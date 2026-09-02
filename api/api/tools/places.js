const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const USER_AGENT = "Nova-AI/1.0 (Places Search)";

const REQUEST_TIMEOUT = 12000;
const DEFAULT_RADIUS = 3000;
const DEFAULT_LIMIT = 8;

/*
==================================================
SAFE FETCH
==================================================
*/

async function safeFetch(url, options = {}, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status}`
      );
    }

    if (!text) {
      throw new Error("Empty response from places service.");
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Places service returned invalid JSON.");
    }
  } finally {
    clearTimeout(timer);
  }
}

/*
==================================================
GEOCODE LOCATION
==================================================
*/

async function geocodeLocation(location) {
  if (!location || typeof location !== "string") {
    return null;
  }

  const cleanLocation = location.trim();

  if (!cleanLocation) {
    return null;
  }

  const params = new URLSearchParams({
    q: cleanLocation,
    format: "jsonv2",
    limit: "1",
    addressdetails: "1"
  });

  const data = await safeFetch(
    `${NOMINATIM_URL}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json"
      }
    }
  );

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const result = data[0];

  const latitude = Number(result.lat);
  const longitude = Number(result.lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    displayName: result.display_name || cleanLocation,
    type: result.type || "place",
    address: result.address || {}
  };
}

/*
==================================================
CATEGORY FILTERS
==================================================
*/

function getCategoryFilters(query) {
  const text = String(query || "").toLowerCase();

  if (
    text.includes("restaurant") ||
    text.includes("restaurants")
  ) {
    return [
      '[amenity="restaurant"]'
    ];
  }

  if (
    text.includes("fast food") ||
    text.includes("takeaway") ||
    text.includes("takeout")
  ) {
    return [
      '[amenity="fast_food"]'
    ];
  }

  if (
    text.includes("cafe") ||
    text.includes("coffee")
  ) {
    return [
      '[amenity="cafe"]'
    ];
  }

  if (
    text.includes("supermarket") ||
    text.includes("grocery") ||
    text.includes("groceries")
  ) {
    return [
      '[shop="supermarket"]',
      '[shop="convenience"]'
    ];
  }

  if (
    text.includes("shop") ||
    text.includes("shops") ||
    text.includes("shopping")
  ) {
    return [
      "[shop]"
    ];
  }

  if (
    text.includes("cinema") ||
    text.includes("movie")
  ) {
    return [
      '[amenity="cinema"]'
    ];
  }

  if (
    text.includes("park") ||
    text.includes("parks")
  ) {
    return [
      '[leisure="park"]'
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
    text.includes("pharmacies")
  ) {
    return [
      '[amenity="pharmacy"]'
    ];
  }

  if (
    text.includes("hotel") ||
    text.includes("hotels")
  ) {
    return [
      '[tourism="hotel"]'
    ];
  }

  if (
    text.includes("gym") ||
    text.includes("gyms")
  ) {
    return [
      '[leisure="fitness_centre"]'
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
    text.includes("museum") ||
    text.includes("museums")
  ) {
    return [
      '[tourism="museum"]'
    ];
  }

  if (
    text.includes("train station") ||
    text.includes("railway station")
  ) {
    return [
      '[railway="station"]'
    ];
  }

  if (
    text.includes("bus stop") ||
    text.includes("bus stops")
  ) {
    return [
      '[highway="bus_stop"]'
    ];
  }

  if (
    text.includes("petrol") ||
    text.includes("fuel") ||
    text.includes("gas station")
  ) {
    return [
      '[amenity="fuel"]'
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
    text.includes("bank") ||
    text.includes("banks")
  ) {
    return [
      '[amenity="bank"]'
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

  /*
  Generic named places.
  */

  return [
    "[name]"
  ];
}

/*
==================================================
OVERPASS SEARCH
==================================================
*/

async function searchNearbyPlaces(
  latitude,
  longitude,
  query,
  radius = DEFAULT_RADIUS
) {
  const filters = getCategoryFilters(query);

  const statements = [];

  for (const filter of filters) {
    statements.push(
      `node(around:${radius},${latitude},${longitude})${filter};`
    );

    statements.push(
      `way(around:${radius},${latitude},${longitude})${filter};`
    );

    statements.push(
      `relation(around:${radius},${latitude},${longitude})${filter};`
    );
  }

  const overpassQuery = `
[out:json][timeout:15];

(
${statements.join("\n")}
);

out center tags;
`;

  const body =
    `data=${encodeURIComponent(overpassQuery)}`;

  const data = await safeFetch(
    OVERPASS_URL,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        Accept: "application/json"
      },
      body
    },
    18000
  );

  if (!data || !Array.isArray(data.elements)) {
    return [];
  }

  return data.elements;
}

/*
==================================================
DISTANCE
==================================================
*/

function distanceKm(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const earthRadius = 6371;

  const dLat =
    ((lat2 - lat1) * Math.PI) / 180;

  const dLon =
    ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(
      (lat1 * Math.PI) / 180
    ) *
      Math.cos(
        (lat2 * Math.PI) / 180
      ) *
      Math.sin(dLon / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadius * c;
}

/*
==================================================
NORMALISE PLACE
==================================================
*/

function normalisePlace(
  element,
  origin
) {
  const tags = element?.tags || {};

  let latitude = element?.lat;
  let longitude = element?.lon;

  if (
    (latitude == null ||
      longitude == null) &&
    element?.center
  ) {
    latitude = element.center.lat;
    longitude = element.center.lon;
  }

  latitude = Number(latitude);
  longitude = Number(longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const distance = distanceKm(
    origin.latitude,
    origin.longitude,
    latitude,
    longitude
  );

  const type =
    tags.amenity ||
    tags.shop ||
    tags.tourism ||
    tags.leisure ||
    tags.railway ||
    tags.highway ||
    tags.office ||
    "place";

  const addressParts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"],
    tags["addr:postcode"]
  ].filter(Boolean);

  return {
    name:
      tags.name ||
      tags["name:en"] ||
      "Unnamed place",

    type,

    latitude,

    longitude,

    distanceKm:
      Math.round(distance * 100) / 100,

    address:
      addressParts.length > 0
        ? addressParts.join(", ")
        : null,

    phone:
      tags.phone ||
      tags["contact:phone"] ||
      null,

    website:
      tags.website ||
      tags["contact:website"] ||
      null,

    openingHours:
      tags.opening_hours ||
      null
  };
}

/*
==================================================
REMOVE DUPLICATES
==================================================
*/

function removeDuplicates(results) {
  const seen = new Set();

  return results.filter((place) => {
    const key = [
      place.name.toLowerCase(),
      place.latitude.toFixed(5),
      place.longitude.toFixed(5)
    ].join("|");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

/*
==================================================
MAIN SEARCH
==================================================
*/

async function searchPlaces({
  query,
  location,
  radius = DEFAULT_RADIUS,
  limit = DEFAULT_LIMIT
}) {
  if (
    !query ||
    typeof query !== "string"
  ) {
    throw new Error(
      "A place search query is required."
    );
  }

  if (
    !location ||
    typeof location !== "string"
  ) {
    throw new Error(
      "A location is required."
    );
  }

  const safeRadius = Math.min(
    Math.max(Number(radius) || DEFAULT_RADIUS, 500),
    10000
  );

  const safeLimit = Math.min(
    Math.max(Number(limit) || DEFAULT_LIMIT, 1),
    15
  );

  /*
  First convert the user's location
  into coordinates.
  */

  const origin =
    await geocodeLocation(location);

  if (!origin) {
    return {
      location,
      latitude: null,
      longitude: null,
      results: []
    };
  }

  /*
  Search OpenStreetMap data.
  */

  const elements =
    await searchNearbyPlaces(
      origin.latitude,
      origin.longitude,
      query,
      safeRadius
    );

  /*
  Convert raw OSM objects into
  simple Nova place objects.
  */

  let results = elements
    .map((element) =>
      normalisePlace(
        element,
        origin
      )
    )
    .filter(Boolean);

  /*
  Remove duplicates.
  */

  results = removeDuplicates(results);

  /*
  Sort nearest first.
  */

  results.sort(
    (a, b) =>
      a.distanceKm -
      b.distanceKm
  );

  /*
  Limit results.
  */

  results =
    results.slice(0, safeLimit);

  return {
    location: origin.displayName,
    latitude: origin.latitude,
    longitude: origin.longitude,
    results
  };
}

/*
==================================================
EXPORT
==================================================
*/

module.exports = {
  searchPlaces,
  geocodeLocation
};
