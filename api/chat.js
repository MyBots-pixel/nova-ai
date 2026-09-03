const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const OPENROUTER_MODEL = "openrouter/free";

let searchPlaces = null;

try {
  const placesModule = require("./tools/places");

  if (
    placesModule &&
    typeof placesModule.searchPlaces === "function"
  ) {
    searchPlaces = placesModule.searchPlaces;
  }
} catch (error) {
  console.warn(
    "Places tool could not be loaded:",
    error?.message || error
  );
}

/* =========================================================
   SAFE FETCH
========================================================= */

async function safeFetch(url, options = {}) {
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
        data?.message ||
        `Request failed with status ${response.status}`
    );
  }

  return data;
}

/* =========================================================
   WEATHER
========================================================= */

async function geocodeLocation(location) {
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
    country: place.country,
    admin1: place.admin1 || ""
  };
}

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
      hourly:
        "temperature_2m,precipitation_probability,weather_code",
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
   TIME
========================================================= */

async function getTimeForLocation(location) {
  const place = await geocodeLocation(location);

  if (!place) {
    return null;
  }

  return {
    location: place,
    note:
      "Exact local time is best determined from the location's timezone."
  };
}

/* =========================================================
   REQUEST DETECTION
========================================================= */

function isWeatherRequest(message) {
  const text = message.toLowerCase();

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
  const text = message.toLowerCase();

  return (
    text.includes("what time") ||
    text.includes("current time") ||
    text.includes("local time") ||
    text.includes("time in ")
  );
}

function isPlacesRequest(message) {
  const text = message.toLowerCase();

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
    text.includes("restaurants") ||
    text.includes("restaurant") ||
    text.includes("cafes") ||
    text.includes("cafe") ||
    text.includes("shops") ||
    text.includes("shop") ||
    text.includes("stores") ||
    text.includes("store") ||
    text.includes("supermarket") ||
    text.includes("hospital") ||
    text.includes("hospitals") ||
    text.includes("hotel") ||
    text.includes("hotels") ||
    text.includes("pharmacy") ||
    text.includes("pharmacies") ||
    text.includes("petrol station") ||
    text.includes("petrol stations") ||
    text.includes("gas station") ||
    text.includes("gas stations")
  );
}

function isNearMeRequest(message) {
  const text = message.toLowerCase();

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
    const match = message.match(pattern);

    if (match && match[1]) {
      let location = match[1].trim();

      location = location
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
  }

  return null;
}

/* =========================================================
   PLACE QUERY EXTRACTION
========================================================= */

function extractPlaceQuery(message) {
  const text = message.toLowerCase();

  if (
    text.includes("restaurant") ||
    text.includes("restaurants") ||
    text.includes("food") ||
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
    text.includes("shop") ||
    text.includes("shops") ||
    text.includes("store") ||
    text.includes("stores")
  ) {
    return "shop";
  }

  if (
    text.includes("supermarket") ||
    text.includes("supermarkets")
  ) {
    return "supermarket";
  }

  if (
    text.includes("hospital") ||
    text.includes("hospitals")
  ) {
    return "hospital";
  }

  if (
    text.includes("hotel") ||
    text.includes("hotels")
  ) {
    return "hotel";
  }

  if (
    text.includes("pharmacy") ||
    text.includes("pharmacies")
  ) {
    return "pharmacy";
  }

  if (
    text.includes("petrol") ||
    text.includes("petrol station") ||
    text.includes("petrol stations") ||
    text.includes("gas station") ||
    text.includes("gas stations")
  ) {
    return "fuel";
  }

  return "places";
}

/* =========================================================
   PLACES
========================================================= */

async function getPlacesData(message, userLocation = null) {
  if (!searchPlaces) {
    return {
      error:
        "The places service is currently unavailable."
    };
  }

  const query = extractPlaceQuery(message);

  const nearMe = isNearMeRequest(message);

  try {
    /*
      If the browser supplied coordinates, use them directly.
      This avoids trying to guess the user's location.
    */

    if (
      nearMe &&
      userLocation &&
      Number.isFinite(Number(userLocation.latitude)) &&
      Number.isFinite(Number(userLocation.longitude))
    ) {
      return await searchPlaces({
        query,
        latitude: Number(userLocation.latitude),
        longitude: Number(userLocation.longitude),
        radius: 5000,
        limit: 8
      });
    }

    /*
      If the user specified a place such as:
      "restaurants in Oxford"
      use normal geocoding.
    */

    const location = extractLocation(message);

    if (location) {
      return await searchPlaces({
        query,
        location,
        radius: 5000,
        limit: 8
      });
    }

    return {
      error:
        "I need your location to find places near you."
    };
  } catch (error) {
    console.error(
      "Places error:",
      error?.message || error
    );

    return {
      error:
        "I couldn't retrieve nearby places right now."
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
    const location = extractLocation(message);

    if (location) {
      try {
        const weather = await getWeather(location);

        if (weather) {
          results.weather = weather;
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
    const location = extractLocation(message);

    if (location) {
      try {
        const time = await getTimeForLocation(location);

        if (time) {
          results.time = time;
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
    results.places = await getPlacesData(
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
  if (!data || typeof data !== "object") {
    return "";
  }

  const sections = [];

  if (data.weather) {
    sections.push(
      "LIVE WEATHER DATA:\n" +
        JSON.stringify(data.weather, null, 2)
    );
  }

  if (data.time) {
    sections.push(
      "LOCATION DATA:\n" +
        JSON.stringify(data.time, null, 2)
    );
  }

  if (data.places) {
    sections.push(
      "LIVE PLACES DATA:\n" +
        JSON.stringify(data.places, null, 2)
    );
  }

  if (!sections.length) {
    return "";
  }

  return (
    "\n\nIMPORTANT LIVE INFORMATION:\n\n" +
    sections.join("\n\n") +
    "\n\nUse this information when answering the user. " +
    "Do not claim live information that is not contained here."
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
- Use live information when it is supplied to you.
- Never pretend you accessed information that you did not receive.
- If live information is supplied, prefer it over outdated assumptions.

For place searches:
- Use the supplied live places data.
- Mention useful nearby results.
- Do not invent businesses, addresses, ratings, prices, opening hours, or distances.
- If no results are supplied, say that you could not retrieve them.

For weather:
- Use the supplied weather information.
- Do not invent weather conditions.

Formatting:
- Keep answers readable.
- Use normal paragraphs and simple lists when useful.
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
  const apiKey = process.env.OPENROUTER_API_KEY;

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
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer":
          "https://nova-ai.vercel.app",
        "X-Title": "Nova AI"
      },

      body: JSON.stringify({
        model: OPENROUTER_MODEL,

        messages: finalMessages,

        /*
          IMPORTANT:
          Keep this reasonably small so the free
          OpenRouter route does not request an
          enormous token allowance.
        */
        max_tokens: 8192,

        temperature: 0.7
      })
    }
  );

  let data = null;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "OpenRouter returned an invalid response."
    );
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error ||
      `OpenRouter request failed with status ${response.status}`;

    throw new Error(message);
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
   MAIN API HANDLER
========================================================= */

module.exports = async function handler(req, res) {
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
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  try {
    const body = req.body || {};

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (!message) {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    /*
      Conversation history from Nova frontend.
    */

    const history =
      Array.isArray(body.history)
        ? body.history
        : [];

    /*
      Browser location.

      Expected:
      {
        latitude: number,
        longitude: number
      }
    */

    let userLocation = null;

    if (
      body.location &&
      Number.isFinite(
        Number(body.location.latitude)
      ) &&
      Number.isFinite(
        Number(body.location.longitude)
      )
    ) {
      userLocation = {
        latitude: Number(
          body.location.latitude
        ),
        longitude: Number(
          body.location.longitude
        )
      };
    }

    /*
      Keep history safe and reasonably sized.
    */

    const cleanedHistory = history
      .filter(
        (item) =>
          item &&
          (item.role === "user" ||
            item.role === "assistant") &&
          typeof item.content === "string"
      )
      .slice(-20)
      .map((item) => ({
        role: item.role,
        content: item.content.slice(0, 12000)
      }));

    /*
      Make sure the current message is included
      exactly once.
    */

    const messages = [
      ...cleanedHistory,
      {
        role: "user",
        content: message
      }
    ];

    /*
      Get live information if required.
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
      Ask OpenRouter.
    */

    const reply =
      await askOpenRouter(
        messages,
        realtimeContext
      );

    return res.status(200).json({
      reply
    });
  } catch (error) {
    console.error(
      "Nova chat API error:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Something went wrong while generating the response."
    });
  }
};
