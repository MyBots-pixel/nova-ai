const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const OPENROUTER_MODEL = "openrouter/free";

/* =========================================================
   PLACES MODULE
========================================================= */

let searchPlaces = null;

try {
  const placesModule = require("./tools/places.js");

  if (
    placesModule &&
    typeof placesModule.searchPlaces === "function"
  ) {
    searchPlaces = placesModule.searchPlaces;
    console.log("NOVA PLACES MODULE LOADED");
  } else {
    console.error(
      "places.js loaded, but searchPlaces was not found."
    );
  }
} catch (error) {
  console.error(
    "NOVA PLACES LOAD ERROR:",
    error?.stack || error
  );
}

/* =========================================================
   SAFE FETCH
========================================================= */

async function safeFetch(url, options = {}) {
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
      data?.error?.message ||
        data?.error ||
        data?.message ||
        text?.slice(0, 500) ||
        `Request failed with status ${response.status}`
    );
  }

  return data;
}

/* =========================================================
   WEATHER GEOCODING
========================================================= */

async function geocodeLocation(location) {
  if (!location) {
    return null;
  }

  const url =
    "https://geocoding-api.open-meteo.com/v1/search?" +
    new URLSearchParams({
      name: location,
      count: "1",
      language: "en",
      format: "json"
    }).toString();

  const data = await safeFetch(url);

  if (!data?.results?.length) {
    return null;
  }

  const place = data.results[0];

  return {
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    name: place.name,
    country: place.country || "",
    admin1: place.admin1 || ""
  };
}

/* =========================================================
   WEATHER
========================================================= */

async function getWeather(location) {
  const place = await geocodeLocation(location);

  if (!place) {
    return null;
  }

  const url =
    "https://api.open-meteo.com/v1/forecast?" +
    new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),

      current:
        "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",

      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",

      timezone: "auto",
      forecast_days: "3"
    }).toString();

  const weather = await safeFetch(url);

  return {
    location: place,
    current: weather.current,
    daily: weather.daily
  };
}

/* =========================================================
   REQUEST DETECTION
========================================================= */

function isWeatherRequest(message) {
  const text = String(message || "").toLowerCase();

  return (
    text.includes("weather") ||
    text.includes("temperature") ||
    text.includes("forecast") ||
    text.includes("raining") ||
    text.includes("rain") ||
    text.includes("sunny") ||
    text.includes("snow") ||
    text.includes("windy")
  );
}

function isPlacesRequest(message) {
  const text = String(message || "").toLowerCase();

  return (
    text.includes("near me") ||
    text.includes("nearby") ||
    text.includes("around me") ||
    text.includes("closest to me") ||
    text.includes("nearest to me") ||
    text.includes("close to me") ||
    text.includes("find me") ||
    text.includes("find a ") ||
    text.includes("find some ") ||
    text.includes("restaurant") ||
    text.includes("restaurants") ||
    text.includes("cafe") ||
    text.includes("cafes") ||
    text.includes("coffee") ||
    text.includes("shop") ||
    text.includes("shops") ||
    text.includes("store") ||
    text.includes("stores") ||
    text.includes("supermarket") ||
    text.includes("grocery") ||
    text.includes("hospital") ||
    text.includes("hotel") ||
    text.includes("pharmacy") ||
    text.includes("chemist") ||
    text.includes("petrol") ||
    text.includes("fuel") ||
    text.includes("cinema") ||
    text.includes("library") ||
    text.includes("bank") ||
    text.includes("atm") ||
    text.includes("dentist") ||
    text.includes("doctor") ||
    text.includes("police station") ||
    text.includes("fire station") ||
    text.includes("gym") ||
    text.includes("park")
  );
}

function isNearMeRequest(message) {
  const text = String(message || "").toLowerCase();

  return (
    text.includes("near me") ||
    text.includes("nearby") ||
    text.includes("around me") ||
    text.includes("closest to me") ||
    text.includes("nearest to me") ||
    text.includes("close to me")
  );
}

/* =========================================================
   LOCATION EXTRACTION
========================================================= */

function extractLocation(message) {
  const patterns = [
    /\bin\s+(.+)$/i,
    /\bat\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = String(message || "").match(pattern);

    if (!match || !match[1]) {
      continue;
    }

    const location = match[1]
      .trim()
      .replace(/[?.!,]+$/, "")
      .trim();

    if (
      location &&
      location.length > 1 &&
      location.length < 100
    ) {
      return location;
    }
  }

  return null;
}

/* =========================================================
   PLACE QUERY
========================================================= */

function extractPlaceQuery(message) {
  const text = String(message || "").toLowerCase();

  if (
    text.includes("restaurant") ||
    text.includes("food") ||
    text.includes("dining") ||
    text.includes("eat")
  ) {
    return "restaurant";
  }

  if (
    text.includes("cafe") ||
    text.includes("cafes") ||
    text.includes("coffee")
  ) {
    return "cafe";
  }

  if (
    text.includes("supermarket") ||
    text.includes("grocery")
  ) {
    return "supermarket";
  }

  if (
    text.includes("shop") ||
    text.includes("shops") ||
    text.includes("store") ||
    text.includes("stores")
  ) {
    return "shop";
  }

  if (text.includes("hospital")) {
    return "hospital";
  }

  if (text.includes("hotel")) {
    return "hotel";
  }

  if (
    text.includes("pharmacy") ||
    text.includes("chemist")
  ) {
    return "pharmacy";
  }

  if (
    text.includes("petrol") ||
    text.includes("fuel")
  ) {
    return "fuel";
  }

  if (text.includes("cinema")) {
    return "cinema";
  }

  if (text.includes("library")) {
    return "library";
  }

  if (text.includes("bank")) {
    return "bank";
  }

  if (text.includes("atm")) {
    return "atm";
  }

  if (text.includes("dentist")) {
    return "dentist";
  }

  if (text.includes("doctor")) {
    return "doctor";
  }

  if (text.includes("police")) {
    return "police";
  }

  if (text.includes("fire station")) {
    return "fire station";
  }

  if (
    text.includes("gym") ||
    text.includes("fitness")
  ) {
    return "gym";
  }

  if (text.includes("park")) {
    return "park";
  }

  return "places";
}

/* =========================================================
   PLACES LOOKUP
========================================================= */

async function getPlacesData(
  message,
  userLocation = null
) {
  if (!searchPlaces) {
    console.error(
      "Places module is unavailable."
    );

    return {
      success: false,
      places: [],
      error:
        "Places module could not be loaded."
    };
  }

  const query = extractPlaceQuery(message);
  const nearMe = isNearMeRequest(message);

  try {
    if (nearMe) {
      if (!userLocation) {
        return {
          success: false,
          places: [],
          error:
            "No browser location was supplied."
        };
      }

      const latitude =
        Number(userLocation.latitude);

      const longitude =
        Number(userLocation.longitude);

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return {
          success: false,
          places: [],
          error:
            "The browser supplied an invalid location."
        };
      }

      console.log(
        "NOVA PLACES SEARCH:",
        query,
        latitude,
        longitude
      );

      const result = await searchPlaces({
        query,
        latitude,
        longitude,
        radius: 5000,
        limit: 8
      });

      console.log(
        "NOVA PLACES RESULT:",
        JSON.stringify(result)
      );

      return result;
    }

    const location = extractLocation(message);

    if (location) {
      const result = await searchPlaces({
        query,
        location,
        radius: 5000,
        limit: 8
      });

      return result;
    }

    return {
      success: false,
      places: [],
      error:
        "I need a location for this search."
    };
  } catch (error) {
    console.error(
      "NOVA PLACES ERROR:",
      error?.stack || error
    );

    return {
      success: false,
      places: [],
      error:
        `Places search failed: ${
          error?.message || "Unknown error"
        }`
    };
  }
}

/* =========================================================
   REALTIME DATA
========================================================= */

async function getRealtimeData(
  message,
  userLocation
) {
  const results = {};

  if (isWeatherRequest(message)) {
    const location = extractLocation(message);

    if (location) {
      try {
        const weather =
          await getWeather(location);

        if (weather) {
          results.weather = weather;
        }
      } catch (error) {
        console.error(
          "Weather error:",
          error?.message || error
        );
      }
    }
  }

  if (isPlacesRequest(message)) {
    results.places =
      await getPlacesData(
        message,
        userLocation
      );
  }

  return results;
}

/* =========================================================
   LIVE CONTEXT
========================================================= */

function buildRealtimeContext(data) {
  if (
    !data ||
    typeof data !== "object"
  ) {
    return "";
  }

  const sections = [];

  if (data.weather) {
    sections.push(
      "LIVE WEATHER DATA:\n" +
        JSON.stringify(
          data.weather,
          null,
          2
        )
    );
  }

  if (data.places) {
    sections.push(
      "LIVE PLACES DATA:\n" +
        JSON.stringify(
          data.places,
          null,
          2
        )
    );
  }

  if (!sections.length) {
    return "";
  }

  return (
    "\n\nIMPORTANT LIVE INFORMATION:\n\n" +
    sections.join("\n\n") +
    "\n\nUse this information when answering. " +
    "Never invent businesses, addresses, ratings, " +
    "prices, opening hours, or distances."
  );
}

/* =========================================================
   SYSTEM PROMPT
========================================================= */

const SYSTEM_PROMPT = `
You are Nova AI.

You are a helpful general-purpose AI assistant.

Give clear, useful and accurate answers.

When LIVE PLACES DATA is supplied:
- Use it.
- Mention the businesses supplied.
- Never invent businesses.
- Never invent addresses.
- Never invent ratings.
- Never invent prices.
- Never invent opening hours.
- Never invent distances.

If live places data contains an error:
- Clearly tell the user the lookup failed.
- Do not make up restaurant recommendations.

When LIVE WEATHER DATA is supplied:
- Use it.
- Do not invent weather information.

Keep responses readable and natural.

You are Nova AI, not ChatGPT.
`;

/* =========================================================
   OPENROUTER
========================================================= */

async function askOpenRouter(
  messages,
  realtimeContext
) {
  const apiKey =
    process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured."
    );
  }

  const finalMessages = [
    {
      role: "system",
      content:
        SYSTEM_PROMPT +
        realtimeContext
    },
    ...messages
  ];

  const response = await fetch(
    OPENROUTER_URL,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${apiKey}`,

        "HTTP-Referer":
          "https://nova-ai.vercel.app",

        "X-Title":
          "Nova AI"
      },

      body: JSON.stringify({
        model:
          OPENROUTER_MODEL,

        messages:
          finalMessages,

        max_tokens:
          8192,

        temperature:
          0.7
      })
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.error ||
        `OpenRouter failed with status ${response.status}`
    );
  }

  const reply =
    data?.choices?.[0]?.message?.content;

  if (
    typeof reply !== "string" ||
    !reply.trim()
  ) {
    throw new Error(
      "OpenRouter did not return a response."
    );
  }

  return reply.trim();
}

/* =========================================================
   MAIN HANDLER
========================================================= */

module.exports =
  async function handler(req, res) {

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Access-Control-Allow-Methods",
      "POST, OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
      return res
        .status(200)
        .end();
    }

    if (req.method !== "POST") {
      return res
        .status(405)
        .json({
          error:
            "Method not allowed."
        });
    }

    try {
      const body =
        req.body || {};

      const message =
        typeof body.message === "string"
          ? body.message.trim()
          : "";

      if (!message) {
        return res
          .status(400)
          .json({
            error:
              "Please enter a message."
          });
      }

      const history =
        Array.isArray(body.history)
          ? body.history
          : [];

      const cleanedHistory =
        history
          .filter(
            (item) =>
              item &&
              (
                item.role === "user" ||
                item.role === "assistant"
              ) &&
              typeof item.content ===
                "string"
          )
          .slice(-20)
          .map((item) => ({
            role:
              item.role,

            content:
              item.content.slice(
                0,
                12000
              )
          }));

      let userLocation = null;

      if (
        body.location &&
        Number.isFinite(
          Number(
            body.location.latitude
          )
        ) &&
        Number.isFinite(
          Number(
            body.location.longitude
          )
        )
      ) {
        userLocation = {
          latitude:
            Number(
              body.location.latitude
            ),

          longitude:
            Number(
              body.location.longitude
            )
        };

        console.log(
          "NOVA BROWSER LOCATION RECEIVED:",
          userLocation
        );
      }

      const messages = [
        ...cleanedHistory,
        {
          role: "user",
          content: message
        }
      ];

      const realtimeResults =
        await getRealtimeData(
          message,
          userLocation
        );

      const realtimeContext =
        buildRealtimeContext(
          realtimeResults
        );

      const reply =
        await askOpenRouter(
          messages,
          realtimeContext
        );

      return res
        .status(200)
        .json({
          reply
        });

    } catch (error) {
      console.error(
        "NOVA CHAT ERROR:",
        error?.stack ||
          error
      );

      return res
        .status(500)
        .json({
          error:
            error?.message ||
            "Something went wrong while generating the response."
        });
    }
  };
