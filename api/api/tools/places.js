const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

const USER_AGENT = "Nova-AI/1.0 (Places Search)";

/* =========================
   SAFE FETCH
========================= */

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `Request failed with status ${response.status}`
    );
  }

  return data;
}

/* =========================
   GEOCODING
========================= */

async function geocodeLocation(location) {
  if (!location || typeof location !== "string") {
    return null;
  }

  const url =
    `${NOMINATIM_URL}?` +
    new URLSearchParams({
      q: location,
      format: "jsonv2",
      limit: "1",
      addressdetails: "1"
    }).toString();

  const data = await fetchJSON(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/json"
    }
  });

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const latitude = Number(data[0].lat);
  const longitude = Number(data[0].lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    displayName: data[0].display_name || "",
    type: data[0].type || "",
    address: data[0].address || {}
  };
}

/* =========================
   CATEGORY DETECTION
========================= */

function getCategoryFilters(query) {
  const text = String(query || "").toLowerCase();

  if (
    text.includes("restaurant") ||
    text.includes("restaurants") ||
    text.includes("food") ||
    text.includes("dining") ||
    text.includes("eat")
  ) {
    return [
      '[amenity~"restaurant|fast_food|food_court"]'
    ];
  }

  if (
    text.includes("cafe") ||
    text.includes("cafes") ||
    text.includes("coffee") ||
    text.includes("coffee shop")
  ) {
    return [
      '[amenity="cafe"]'
    ];
  }

  if (
    text.includes("supermarket") ||
    text.includes("supermarkets") ||
    text.includes("grocery") ||
    text.includes("groceries")
  ) {
    return [
      '[shop~"supermarket|convenience|grocery"]'
    ];
  }

  if (
    text.includes("petrol") ||
    text.includes("petrol station") ||
    text.includes("fuel") ||
    text.includes("gas station")
  ) {
    return [
      '[amenity="fuel"]'
    ];
  }

  if (
    text.includes("hospital") ||
    text.includes("hospitals")
  ) {
    return [
      '[amenity="hospital"]'
    ];
  }

  if (
    text.includes("pharmacy") ||
    text.includes("pharmacies") ||
    text.includes("chemist") ||
    text.includes("chemists")
  ) {
    return [
      '[amenity="pharmacy"]'
    ];
  }

  if (
    text.includes("school") ||
    text.includes("schools")
  ) {
    return [
      '[amenity="school"]'
    ];
  }

  if (
    text.includes("hotel") ||
    text.includes("hotels")
  ) {
    return [
      '[tourism="hotel"]',
      '[tourism="hostel"]',
      '[tourism="guest_house"]'
    ];
  }

  if (
    text.includes("gym") ||
    text.includes("gyms") ||
    text.includes("fitness")
  ) {
    return [
      '[leisure="fitness_centre"]',
      '[leisure="sports_centre"]'
    ];
  }

  if (
    text.includes("park") ||
    text.includes("parks")
  ) {
    return [
      '[leisure="park"]',
      '[leisure="garden"]'
    ];
  }

  if (
    text.includes("police") ||
    text.includes("police station")
  ) {
    return [
      '[amenity="police"]'
    ];
  }

  if (
    text.includes("fire station") ||
    text.includes("fire stations")
  ) {
    return [
      '[amenity="fire_station"]'
    ];
  }

  if (
    text.includes("bank") ||
    text.includes("banks")
  ) {
    return [
      '[amenity="bank"]'
    ];
  }

  if (
    text.includes("atm") ||
    text.includes("cash machine") ||
    text.includes("cashpoint")
  ) {
    return [
      '[amenity="atm"]'
    ];
  }

  if (
    text.includes("cinema") ||
    text.includes("cinemas")
  ) {
    return [
      '[amenity="cinema"]'
    ];
  }

  if (
    text.includes("library") ||
    text.includes("libraries")
  ) {
    return [
      '[amenity="library"]'
    ];
  }

  if (
    text.includes("dentist") ||
    text.includes("dentists")
  ) {
    return [
      '[amenity="dentist"]'
    ];
  }

  if (
    text.includes("doctor") ||
    text.includes("doctors") ||
    text.includes("gp")
  ) {
    return [
      '[amenity="doctors"]'
    ];
  }

  if (
    text.includes("shop") ||
    text.includes("shops") ||
    text.includes("store") ||
    text.includes("stores")
  ) {
    return [
      '[shop]'
    ];
  }

  return [
    '[name]',
    '[amenity]',
    '[shop]',
    '[tourism]',
    '[leisure]'
  ];
}

/* =========================
   DISTANCE
========================= */

function calculateDistance(
  latitude1,
  longitude1,
  latitude2,
  longitude2
) {
  const earthRadiusKm = 6371;

  const lat1 =
    latitude1 * Math.PI / 180;

  const lat2 =
    latitude2 * Math.PI / 180;

  const deltaLat =
    (latitude2 - latitude1) * Math.PI / 180;

  const deltaLon =
    (longitude2 - longitude1) * Math.PI / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(deltaLon / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadiusKm * c;
}

/* =========================
   ADDRESS
========================= */

function buildAddress(tags) {
  const parts = [];

  if (tags["addr:housenumber"]) {
    parts.push(tags["addr:housenumber"]);
  }

  if (tags["addr:street"]) {
    parts.push(tags["addr:street"]);
  }

  if (tags["addr:city"]) {
    parts.push(tags["addr:city"]);
  }

  if (tags["addr:postcode"]) {
    parts.push(tags["addr:postcode"]);
  }

  return parts.join(", ");
}

/* =========================
   DUPLICATES
========================= */

function removeDuplicates(places) {
  const seen = new Set();

  return places.filter((place) => {
    const key =
      `${place.name.toLowerCase()}|` +
      `${place.latitude.toFixed(5)}|` +
      `${place.longitude.toFixed(5)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

/* =========================
   OVERPASS QUERY
========================= */

async function searchNearbyPlaces({
  latitude,
  longitude,
  query,
  radius = 5000,
  limit = 8
}) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return [];
  }

  const safeRadius = Math.min(
    Math.max(Number(radius) || 5000, 250),
    10000
  );

  const safeLimit = Math.min(
    Math.max(Number(limit) || 8, 1),
    20
  );

  const filters = getCategoryFilters(query);

  const parts = [];

  for (const filter of filters) {
    parts.push(
      `node(around:${safeRadius},${latitude},${longitude})${filter};`
    );

    parts.push(
      `way(around:${safeRadius},${latitude},${longitude})${filter};`
    );

    parts.push(
      `relation(around:${safeRadius},${latitude},${longitude})${filter};`
    );
  }

  const overpassQuery = `
[out:json][timeout:25];
(
${parts.join("\n")}
);
out center tags;
`;

  let data = null;
  let lastError = null;

  for (const endpoint of OVERPASS_URLS) {
    try {
      data = await fetchJSON(endpoint, {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
          "Accept": "application/json"
        },
        body:
          "data=" +
          encodeURIComponent(overpassQuery)
      });

      if (data) {
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (!data || !Array.isArray(data.elements)) {
    if (lastError) {
      throw lastError;
    }

    return [];
  }

  const places = [];

  for (const element of data.elements) {
    const tags = element.tags || {};

    const elementLatitude =
      typeof element.lat === "number"
        ? element.lat
        : element.center?.lat;

    const elementLongitude =
      typeof element.lon === "number"
        ? element.lon
        : element.center?.lon;

    if (
      !Number.isFinite(elementLatitude) ||
      !Number.isFinite(elementLongitude)
    ) {
      continue;
    }

    const name =
      tags.name ||
      tags["name:en"] ||
      tags.brand ||
      tags.operator;

    if (!name) {
      continue;
    }

    const distanceKm = calculateDistance(
      latitude,
      longitude,
      elementLatitude,
      elementLongitude
    );

    places.push({
      name,
      latitude: elementLatitude,
      longitude: elementLongitude,

      type:
        tags.amenity ||
        tags.shop ||
        tags.tourism ||
        tags.leisure ||
        "place",

      address: buildAddress(tags),

      distanceKm,

      phone:
        tags.phone ||
        tags["contact:phone"] ||
        null,

      website:
        tags.website ||
        tags["contact:website"] ||
        null
    });
  }

  const uniquePlaces =
    removeDuplicates(places);

  uniquePlaces.sort(
    (a, b) =>
      a.distanceKm - b.distanceKm
  );

  return uniquePlaces.slice(
    0,
    safeLimit
  );
}

/* =========================
   SEARCH BY COORDINATES
========================= */

async function searchPlacesByCoordinates({
  query = "places",
  latitude,
  longitude,
  radius = 5000,
  limit = 8
}) {
  const results =
    await searchNearbyPlaces({
      query,
      latitude,
      longitude,
      radius,
      limit
    });

  return results;
}

/* =========================
   MAIN SEARCH FUNCTION
========================= */

async function searchPlaces({
  query = "places",
  location = null,
  latitude = null,
  longitude = null,
  radius = 5000,
  limit = 8
}) {
  let coordinates = null;

  /*
    PRIORITY 1:
    Browser coordinates.

    This handles:
    "restaurants near me"
    "cafes near me"
    "shops near me"
  */

  if (
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude))
  ) {
    coordinates = {
      latitude: Number(latitude),
      longitude: Number(longitude)
    };
  }

  /*
    PRIORITY 2:
    Named location.

    This handles:
    "restaurants in Oxford"
    "cafes in Peterborough"
    "shops in London"
  */

  if (!coordinates && location) {
    coordinates =
      await geocodeLocation(location);
  }

  if (!coordinates) {
    return {
      success: false,
      places: [],
      error:
        "I couldn't determine the location to search."
    };
  }

  const places =
    await searchPlacesByCoordinates({
      query,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      radius,
      limit
    });

  return {
    success: true,

    places,

    location: {
      name:
        location ||
        "your current location",

      latitude:
        coordinates.latitude,

      longitude:
        coordinates.longitude
    }
  };
}

/* =========================
   EXPORTS
========================= */

module.exports = {
  searchPlaces,
  searchPlacesByCoordinates,
  geocodeLocation
};
