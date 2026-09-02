const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const USER_AGENT = "Nova-AI/1.0";

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);

  let data = null;

  try {
    data = await response.json();
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

/*
==================================================
GEOCODE LOCATION
==================================================
*/

async function geocodeLocation(location) {
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
      Accept: "application/json"
    }
  });

  if (!Array.isArray(data) || !data.length) {
    return null;
  }

  return {
    latitude: Number(data[0].lat),
    longitude: Number(data[0].lon),
    displayName: data[0].display_name,
    type: data[0].type,
    address: data[0].address || {}
  };
}

/*
==================================================
CATEGORY MAPPING
==================================================
*/

function getCategoryFilters(query) {
  const text = query.toLowerCase();

  if (
    text.includes("restaurant") ||
    text.includes("restaurants") ||
    text.includes("food") ||
    text.includes("eat")
  ) {
    return [
      '[amenity~"restaurant|fast_food|cafe"]'
    ];
  }

  if (
    text.includes("cafe") ||
    text.includes("coffee") ||
    text.includes("coffee shop")
  ) {
    return [
      '[amenity="cafe"]'
    ];
  }

  if (
    text.includes("shop") ||
    text.includes("shops") ||
    text.includes("shopping")
  ) {
    return [
      '[shop]'
    ];
  }

  if (
    text.includes("supermarket") ||
    text.includes("grocery") ||
    text.includes("groceries")
  ) {
    return [
      '[shop~"supermarket|convenience|grocery"]'
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
    text.includes("station") ||
    text.includes("train station")
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

  return [
    '[name]'
  ];
}

/*
==================================================
OVERPASS QUERY
==================================================
*/

async function searchNearbyPlaces(
  latitude,
  longitude,
  query,
  radius = 5000
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
[out:json][timeout:20];

(
  ${statements.join("\n")}
);

out center tags;
`;

  const response = await fetch(
    OVERPASS_URL,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT
      },
      body:
        `data=${encodeURIComponent(
          overpassQuery
        )}`
    }
  );

  if (!response.ok) {
    throw new Error(
      `Places search failed with status ${response.status}`
    );
  }

  const data = await response.json();

  return Array.isArray(data.elements)
    ? data.elements
    : [];
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
NORMALISE RESULTS
==================================================
*/

function normalisePlace(
  element,
  origin
) {
  const tags = element.tags || {};

  let latitude = element.lat;
  let longitude = element.lon;

  if (
    (latitude == null ||
      longitude == null) &&
    element.center
  ) {
    latitude = element.center.lat;
    longitude = element.center.lon;
  }

  if (
    latitude == null ||
    longitude == null
  ) {
    return null;
  }

  const distance = distanceKm(
    origin.latitude,
    origin.longitude,
    Number(latitude),
    Number(longitude)
  );

  return {
    name:
      tags.name ||
      tags["name:en"] ||
      "Unnamed place",

    type:
      tags.amenity ||
      tags.shop ||
      tags.tourism ||
      tags.leisure ||
      tags.railway ||
      tags.highway ||
      "place",

    latitude: Number(latitude),
    longitude: Number(longitude),

    distanceKm:
      Math.round(distance * 100) / 100,

    address:
      [
        tags["addr:housenumber"],
        tags["addr:street"],
        tags["addr:postcode"]
      ]
        .filter(Boolean)
        .join(" ") || null,

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
MAIN PLACES SEARCH
==================================================
*/

async function searchPlaces({
  query,
  location,
  radius = 5000,
  limit = 10
}) {
  if (!query) {
    throw new Error(
      "A place search query is required."
    );
  }

  if (!location) {
    throw new Error(
      "A location is required."
    );
  }

  const place =
    await geocodeLocation(location);

  if (!place) {
    return {
      location,
      results: []
    };
  }

  const elements =
    await searchNearbyPlaces(
      place.latitude,
      place.longitude,
      query,
      radius
    );

  const results = elements
    .map((element) =>
      normalisePlace(element, place)
    )
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.distanceKm -
        b.distanceKm
    )
    .slice(0, limit);

  return {
    location: place.displayName,
    latitude: place.latitude,
    longitude: place.longitude,
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
