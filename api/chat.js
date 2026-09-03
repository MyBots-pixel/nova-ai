const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const OPENROUTER_MODEL = "openrouter/free";

/* =========================================================
   LOAD PLACES TOOL
========================================================= */

let searchPlaces = null;

let searchPlaces = null;

try {
  const placesModule = require("./tools/places.js");

  console.log("================================");
  console.log("NOVA PLACES MODULE LOADED");
  console.log("================================");

  if (
    placesModule &&
    typeof placesModule.searchPlaces === "function"
  ) {
    searchPlaces = placesModule.searchPlaces;
  }
} catch (error) {
  console.error("================================");
  console.error("NOVA PLACES LOAD ERROR");
  console.error(error?.stack || error);
  console.error("================================");
}

for (const modulePath of possiblePlacesModules) {
  if (searchPlaces) {
    break;
  }

  try {
    const placesModule = require(modulePath);

    if (
      placesModule &&
      typeof placesModule.searchPlaces === "function"
    ) {
      searchPlaces = placesModule.searchPlaces;

      console.log(
        `Nova Places loaded from ${modulePath}`
      );
    }
  } catch (error) {
    console.warn(
      `Could not load ${modulePath}:`,
      error?.message || error
    );
  }
}

if (!searchPlaces) {
  throw new Error(
    "PLACES_MODULE_LOAD_FAILED"
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

async function geocodeWeatherLocation(location) {
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
  const place =
    await geocodeWeatherLocation(location);

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

      hourly:
        "temperature_2m,precipitation_probability,weather_code",

      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",

      timezone: "auto",
      forecast_days: "3"
    }).toString();

  const weather =
    await safeFetch(url);

  return {
    location: place,
    current: weather.current,
    daily: weather.daily
  };
}

/* =========================================================
   TIME
========================================================= */

async function getTimeForLocation(location) {
  const place =
    await geocodeWeatherLocation(location);

  if (!place) {
    return null;
  }

  return {
    location: place,
    note:
      "Use the location timezone when determining the exact local time."
  };
}

/* =========================================================
   REQUEST DETECTION
========================================================= */

function isWeatherRequest(message) {
  const text =
    String(message || "").toLowerCase();

  return (
    text.includes("weather") ||
    text.includes("temperature") ||
    text.includes("forecast") ||
    text.includes("raining") ||
    text.includes("rain") ||
    text.includes("sunny") ||
    text.includes("snowing") ||
    text.includes("snow") ||
    text.includes("windy")
  );
}

function isTimeRequest(message) {
  const text =
    String(message || "").toLowerCase();

  return (
    text.includes("what time") ||
    text.includes("current time") ||
    text.includes("local time") ||
    text.includes("time in ")
  );
}

function isPlacesRequest(message) {
  const text =
    String(message || "").toLowerCase();

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
    text.includes("cafe") ||
    text.includes("coffee") ||
    text.includes("shop") ||
    text.includes("store") ||
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
  const text =
    String(message || "").toLowerCase();

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
    /\bat\s+(.+)$/i,
    /\bfor\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match =
      String(message || "").match(pattern);

    if (!match || !match[1]) {
      continue;
    }

    let location =
      match[1]
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
  const text =
    String(message || "").toLowerCase();

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
    text.includes("store")
  ) {
    return "shop";
  }

  if (
    text.includes("hospital")
  ) {
    return "hospital";
  }

  if (
    text.includes("hotel")
  ) {
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
    text.includes("fuel") ||
    text.includes("gas station")
  ) {
    return "fuel";
  }

  if (
    text.includes("police")
  ) {
    return "police";
  }

  if (
    text.includes("fire station")
  ) {
    return "fire station";
  }

  if (
    text.includes("gym") ||
    text.includes("fitness")
  ) {
    return "gym";
  }

  if (
    text.includes("park")
  ) {
    return "park";
  }

  if (
    text.includes("cinema")
  ) {
    return "cinema";
  }

  if (
    text.includes("library")
  ) {
    return "library";
  }

  if (
    text.includes("bank")
  ) {
    return "bank";
  }

  if (
    text.includes("atm") ||
    text.includes("cashpoint") ||
    text.includes("cash machine")
  ) {
    return "atm";
  }

  return "places";
}

/* =========================================================
   PLACES
========================================================= */

async function getPlacesData(
  message,
  userLocation = null
) {
  if (!searchPlaces) {
    console.error(
      "Places function is not available."
    );

    return {
      success: false,
      places: [],
      error:
        "The Places module could not be loaded by the server."
    };
  }

  const query =
    extractPlaceQuery(message);

  const nearMe =
    isNearMeRequest(message);

  try {
    /*
      ================================================
      NEAR ME
      ================================================
    */

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
        "Places search:",
        query,
        latitude,
        longitude
      );

      const result =
        await searchPlaces({
          query,
          latitude,
          longitude,
          radius: 5000,
          limit: 8
        });

      console.log(
        "Places result:",
        JSON.stringify(result)
      );

      return result;
    }

    /*
      ================================================
      NAMED LOCATION
      ================================================
    */

    const location =
      extractLocation(message);

    if (location) {
      console.log(
        "Named places search:",
        query,
        location
      );

      const result =
        await searchPlaces({
          query,
          location,
          radius: 5000,
          limit: 8
        });

      console.log(
        "Places result:",
        JSON.stringify(result)
      );

      return result;
    }

    return {
      success: false,
      places: [],
      error:
        "I need a location for this places search."
    };
  } catch (error) {
    console.error(
      "===================================="
    );

    console.error(
      "PLACES SEARCH FAILED"
    );

    console.error(
      error?.stack ||
      error?.message ||
      error
    );

    console.error(
      "===================================="
    );

    /*
      IMPORTANT:
      Return the REAL error so we can see
      exactly what is failing.
    */

    return {
      success: false,
      places: [],
      error:
        `Places search failed: ${
          error?.message ||
          "Unknown error"
        }`
    };
  }
}

/* =========================================================
   REALTIME DATA
========================================================= */

async function getRealtimeData(
  message,
  userLocation = null
) {
  const results = {};

  if (isWeatherRequest(message)) {
    const location =
      extractLocation(message);

    if (location) {
      try {
        const weather =
          await getWeather(location);

        if (weather) {
          results.weather =
            weather;
        }
      } catch (error) {
        console.warn(
          "Weather lookup failed:",
          error?.message || error
        );
      }
    }
  }

  if (isTimeRequest(message)) {
    const location =
      extractLocation(message);

    if (location) {
      try {
        const time =
          await getTimeForLocation(location);

        if (time) {
          results.time =
            time;
        }
      } catch (error) {
        console.warn(
          "Time lookup failed:",
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
   REALTIME CONTEXT
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

  if (data.time) {
    sections.push(
      "LOCATION DATA:\n" +
      JSON.stringify(
        data.time,
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

You are a helpful, intelligent, friendly general-purpose AI assistant.

Your goals:
- Give accurate and useful answers.
- Explain things clearly.
- Help with coding and websites.
- Help troubleshoot errors.
- Help with planning and ideas.
- Use live information when it is supplied.
- Never pretend you accessed information that you did not receive.

For places:
- Use LIVE PLACES DATA when provided.
- Mention useful nearby results.
- Do not invent businesses.
- Do not invent addresses.
- Do not invent ratings.
- Do not invent prices.
- Do not invent opening hours.
- Do not invent distances.
- If the places data contains an error, explain that the live places lookup failed.

For weather:
- Use the supplied live weather data.
- Never invent weather information.

Formatting:
- Keep responses readable.
- Use simple lists when useful.
- Do not use excessive markdown.
- Do not wrap the entire response in quotation marks.

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

  const response =
    await fetch(
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

  let data = null;

  try {
    data =
      await response.json();
  } catch {
    throw new Error(
      "OpenRouter returned an invalid response."
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      data?.error ||
      `OpenRouter request failed with status ${response.status}`
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

    /*
      CORS
    */

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

      /*
        HISTORY
      */

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

      /*
        LOCATION
      */

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
          "Browser location received."
        );
      }

      /*
        MESSAGES
      */

      const messages = [
        ...cleanedHistory,
        {
          role: "user",
          content: message
        }
      ];

      /*
        REALTIME
      */

      const realtimeResults =
        await getRealtimeData(
          message,
          userLocation
        );

      const realtimeContext =
        buildRealtimeContext(
          realtimeResults
        );

      /*
        OPENROUTER
      */

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
        "Nova chat API error:",
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
