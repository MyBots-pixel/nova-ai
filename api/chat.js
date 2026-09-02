const https = require("https");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "Nova-AI/1.0",
          ...(options.headers || {})
        },
        timeout: 15000
      },
      (response) => {
        let body = "";

        response.on("data", (chunk) => {
          body += chunk;
        });

        response.on("end", () => {
          try {
            const data = JSON.parse(body);

            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(
                new Error(
                  data?.reason ||
                  data?.error ||
                  `Request failed with status ${response.statusCode}`
                )
              );
              return;
            }

            resolve(data);
          } catch (error) {
            reject(new Error("Invalid response from external service."));
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Request timed out."));
    });

    request.on("error", reject);
  });
}

function cleanText(value) {
  if (typeof value !== "string") return "";

  return value
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, 4000);
}

function isWeatherRequest(message) {
  const text = message.toLowerCase();

  const weatherWords = [
    "weather",
    "temperature",
    "forecast",
    "rain",
    "raining",
    "snow",
    "snowing",
    "sunny",
    "cloudy",
    "cloud",
    "wind",
    "winds",
    "humidity",
    "hot",
    "cold",
    "degrees",
    "precipitation"
  ];

  const locationWords = [
    "in ",
    "at ",
    "near ",
    "for ",
    "there",
    "here",
    "today",
    "tomorrow",
    "tonight",
    "this evening",
    "this afternoon"
  ];

  const hasWeatherWord = weatherWords.some((word) =>
    text.includes(word)
  );

  const hasLocationContext = locationWords.some((word) =>
    text.includes(word)
  );

  return hasWeatherWord && hasLocationContext;
}

function isTimeRequest(message) {
  const text = message.toLowerCase();

  return (
    text.includes("what time") ||
    text.includes("current time") ||
    text.includes("time in ") ||
    text.includes("time at ") ||
    text.includes("time now") ||
    text.includes("local time") ||
    text.includes("timezone") ||
    text.includes("time zone") ||
    /\butc\s*[+-]\s*\d+/i.test(message) ||
    /\bgmt\s*[+-]\s*\d+/i.test(message) ||
    /\bbst\s*[+-]\s*\d+/i.test(message)
  );
}

function extractLocation(message) {
  const patterns = [
    /\bweather\s+(?:in|at|near|for)\s+(.+?)(?:\?|$)/i,
    /\btemperature\s+(?:in|at|near|for)\s+(.+?)(?:\?|$)/i,
    /\bforecast\s+(?:in|at|near|for)\s+(.+?)(?:\?|$)/i,
    /\btime\s+(?:in|at)\s+(.+?)(?:\?|$)/i,
    /\blocal\s+time\s+(?:in|at)\s+(.+?)(?:\?|$)/i,
    /\b(?:rain|raining|snow|snowing)\s+(?:in|at|near|for)\s+(.+?)(?:\?|$)/i,
    /\b(?:sunny|cloudy|windy)\s+(?:in|at|near|for)\s+(.+?)(?:\?|$)/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match && match[1]) {
      let location = match[1]
        .trim()
        .replace(/[.!]+$/, "")
        .trim();

      // Remove common forecast phrases.
      location = location
        .replace(/\b(today|tomorrow|tonight|now|right now)\b/gi, "")
        .trim();

      if (location.length > 0) {
        return location;
      }
    }
  }

  return null;
}

async function geocodeLocation(location) {
  const url =
    `${GEOCODING_URL}?name=${encodeURIComponent(location)}` +
    `&count=1&language=en&format=json`;

  const data = await fetchJSON(url);

  if (!data.results || data.results.length === 0) {
    return null;
  }

  return data.results[0];
}

function weatherDescription(code) {
  const descriptions = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail"
  };

  return descriptions[code] || "Unknown conditions";
}

async function getWeather(location) {
  const place = await geocodeLocation(location);

  if (!place) {
    return {
      success: false,
      type: "weather",
      error: `I couldn't find a location called "${location}".`
    };
  }

  const weatherURL =
    `${WEATHER_URL}` +
    `?latitude=${encodeURIComponent(place.latitude)}` +
    `&longitude=${encodeURIComponent(place.longitude)}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation` +
    `&hourly=temperature_2m,precipitation_probability,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,weather_code` +
    `&timezone=${encodeURIComponent(place.timezone)}` +
    `&forecast_days=7`;

  const data = await fetchJSON(weatherURL);

  const current = data.current || {};
  const daily = data.daily || {};

  return {
    success: true,
    type: "weather",

    location: {
      name: place.name,
      region: place.admin1 || "",
      country: place.country || "",
      timezone: place.timezone
    },

    current: {
      temperature: current.temperature_2m,
      apparentTemperature: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      precipitation: current.precipitation,
      weatherCode: current.weather_code,
      description: weatherDescription(current.weather_code),
      time: current.time
    },

    forecast: {
      dates: daily.time || [],
      maxTemperatures: daily.temperature_2m_max || [],
      minTemperatures: daily.temperature_2m_min || [],
      rainChance: daily.precipitation_probability_max || [],
      weatherCodes: daily.weather_code || [],
      sunrise: daily.sunrise || [],
      sunset: daily.sunset || []
    }
  };
}

function parseOffsetExpression(message) {
  const text = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  /*
    Supports examples such as:

    UTC+1
    UTC + 1
    GMT+5
    BST
    BST+1
    BST + 1
  */

  const match = text.match(
    /\b(utc|gmt|bst)\s*(?:([+-])\s*(\d+(?:\.\d+)?))?\b/i
  );

  if (!match) {
    return null;
  }

  const base = match[1].toUpperCase();
  const sign = match[2];
  const amount = match[3] ? Number(match[3]) : 0;

  let baseOffset = 0;

  if (base === "BST") {
    baseOffset = 1;
  }

  let finalOffset = baseOffset;

  if (sign) {
    finalOffset =
      sign === "+"
        ? baseOffset + amount
        : baseOffset - amount;
  }

  return {
    base,
    baseOffset,
    adjustment: sign ? `${sign}${amount}` : null,
    finalOffset
  };
}

function getUTCOffsetTime(offsetHours) {
  const now = new Date();

  const utcMilliseconds =
    now.getTime() +
    now.getTimezoneOffset() * 60 * 1000;

  const targetMilliseconds =
    utcMilliseconds +
    offsetHours * 60 * 60 * 1000;

  const targetDate = new Date(targetMilliseconds);

  return {
    date: targetDate.toISOString().slice(0, 10),
    time: targetDate.toISOString().slice(11, 16)
  };
}

async function getTimeInformation(message) {
  const offsetExpression = parseOffsetExpression(message);

  if (offsetExpression) {
    const result = getUTCOffsetTime(
      offsetExpression.finalOffset
    );

    return {
      success: true,
      type: "time",
      mode: "utc-offset",

      base: offsetExpression.base,
      baseOffset: offsetExpression.baseOffset,
      adjustment: offsetExpression.adjustment,
      finalOffset: offsetExpression.finalOffset,

      date: result.date,
      time: result.time
    };
  }

  const location = extractLocation(message);

  if (!location) {
    return {
      success: false,
      type: "time",
      error:
        "I need a location or timezone to give you the exact local time."
    };
  }

  const place = await geocodeLocation(location);

  if (!place) {
    return {
      success: false,
      type: "time",
      error: `I couldn't find a location called "${location}".`
    };
  }

  const now = new Date();

  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: place.timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: place.timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const shortTimeZoneFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: place.timezone,
    timeZoneName: "short"
  });

  return {
    success: true,
    type: "time",
    mode: "location",

    location: {
      name: place.name,
      region: place.admin1 || "",
      country: place.country || "",
      timezone: place.timezone
    },

    time: timeFormatter.format(now),
    date: dateFormatter.format(now),
    timezoneLabel: shortTimeZoneFormatter
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value || ""
  };
}

function buildRealtimeContext(data) {
  if (!data || !data.success) {
    return `
REAL-TIME LOOKUP:
The requested real-time information could not be retrieved.

Error:
${data?.error || "Unknown real-time lookup error."}

Do not invent the missing information.
`;
  }

  if (data.type === "weather") {
    const locationParts = [
      data.location.name,
      data.location.region,
      data.location.country
    ].filter(Boolean);

    let forecastText = "";

    if (data.forecast?.dates?.length) {
      forecastText = data.forecast.dates
        .slice(0, 7)
        .map((date, index) => {
          return (
            `${date}: ` +
            `${data.forecast.minTemperatures[index]}°C to ` +
            `${data.forecast.maxTemperatures[index]}°C, ` +
            `${weatherDescription(data.forecast.weatherCodes[index])}, ` +
            `${data.forecast.rainChance[index] ?? 0}% precipitation chance`
          );
        })
        .join("\n");
    }

    return `
REAL-TIME WEATHER DATA
Location: ${locationParts.join(", ")}
Timezone: ${data.location.timezone}

Current local weather:
Temperature: ${data.current.temperature}°C
Feels like: ${data.current.apparentTemperature}°C
Humidity: ${data.current.humidity}%
Wind: ${data.current.windSpeed} km/h
Precipitation: ${data.current.precipitation} mm
Conditions: ${data.current.description}
Local data time: ${data.current.time}

7-day forecast:
${forecastText}

Use this real-time data when answering the user's weather question.
Do not make up different temperatures, conditions, or forecast values.
`;
  }

  if (data.type === "time") {
    if (data.mode === "utc-offset") {
      const sign = data.finalOffset >= 0 ? "+" : "-";
      const absoluteOffset = Math.abs(data.finalOffset);

      return `
REAL-TIME TIME DATA

Requested base timezone: ${data.base}
Base UTC offset: UTC${data.baseOffset >= 0 ? "+" : ""}${data.baseOffset}

Additional adjustment:
${data.adjustment || "None"}

Final timezone:
UTC${sign}${absoluteOffset}

Current date:
${data.date}

Current time:
${data.time}

Use this exact real-time value when answering.
`;
    }

    return `
REAL-TIME TIME DATA

Location: ${data.location.name}${data.location.region ? `, ${data.location.region}` : ""}${data.location.country ? `, ${data.location.country}` : ""}
IANA timezone: ${data.location.timezone}
Timezone abbreviation: ${data.timezoneLabel}

Current local date:
${data.date}

Current local time:
${data.time}

Use this exact real-time value when answering.
`;
  }

  return "";
}

async function getRealtimeData(message) {
  try {
    if (isWeatherRequest(message)) {
      const location = extractLocation(message);

      if (!location) {
        return {
          success: false,
          type: "weather",
          error:
            "I need a location for the weather request, such as London or New York."
        };
      }

      return await getWeather(location);
    }

    if (isTimeRequest(message)) {
      return await getTimeInformation(message);
    }

    return null;
  } catch (error) {
    console.error("Realtime lookup error:", error);

    return {
      success: false,
      type: "realtime",
      error:
        "The real-time information service is temporarily unavailable."
    };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY is not configured."
      });
    }

    const body = req.body || {};

    const message = cleanText(body.message);

    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            (item) =>
              item &&
              (item.role === "user" || item.role === "assistant") &&
              typeof item.content === "string"
          )
          .slice(-20)
          .map((item) => ({
            role: item.role,
            content: cleanText(item.content).slice(0, 6000)
          }))
      : [];

    if (!message) {
      return res.status(400).json({
        error: "Message is required."
      });
    }

    // ---------------------------------------------
    // REAL-TIME INFORMATION
    // ---------------------------------------------

    const realtimeData = await getRealtimeData(message);

    const realtimeContext = buildRealtimeContext(realtimeData);

    // ---------------------------------------------
    // NOVA SYSTEM PROMPT
    // ---------------------------------------------

    const systemPrompt = `
You are Nova AI, a helpful, friendly, intelligent AI assistant.

Answer naturally and clearly.

IMPORTANT REAL-TIME RULES:

If REAL-TIME DATA is provided below, use it as the authoritative source
for the user's current weather/time request.

Never invent real-time weather or time information.

If the real-time lookup failed, clearly tell the user that the live
information could not be retrieved instead of pretending you know it.

For weather:
- Give temperatures in Celsius unless the user asks for Fahrenheit.
- Mention the location.
- Keep the answer easy to read.
- You may include useful current conditions such as temperature,
  feels-like temperature, rain chance, wind, and conditions.
- For forecast questions, use the supplied forecast data.

For time:
- Give the exact current local time supplied by the real-time data.
- Mention the timezone when useful.
- If the user uses an unusual expression such as "BST+1", explain
  exactly how you interpreted it.

IMPORTANT:
"BST" normally means British Summer Time, which is UTC+1.
Therefore "BST+1" is interpreted here as one additional hour beyond
BST, resulting in UTC+2.

Do not claim that a location-based time lookup is exact if the location
could not be resolved.

Do not mention internal APIs, server code, environment variables,
OpenRouter, or implementation details unless the user specifically
asks about how Nova works.

You can answer normal questions normally when no real-time information
is supplied.
`;

    const messages = [
      {
        role: "system",
        content: systemPrompt
      },
      ...history,
      {
        role: "user",
        content:
          message +
          (realtimeContext
            ? `\n\n${realtimeContext}`
            : "")
      }
    ];

    // ---------------------------------------------
    // OPENROUTER
    // ---------------------------------------------

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 30000);

    let response;

    try {
      response = await fetch(OPENROUTER_URL, {
        method: "POST",

        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://nova-ai.vercel.app",
          "X-Title": "Nova AI"
        },

        body: JSON.stringify({
          model: "openrouter/free",

          messages,

          temperature: 0.7,

          max_tokens: 1500
        }),

        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenRouter error:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          data?.error ||
          "Nova AI could not process the request."
      });
    }

    const reply =
      data?.choices?.[0]?.message?.content;

    if (!reply) {
      console.error("Unexpected OpenRouter response:", data);

      return res.status(500).json({
        error: "Nova AI returned an empty response."
      });
    }

    return res.status(200).json({
      reply,
      realtime:
        realtimeData?.success
          ? {
              type: realtimeData.type,
              location:
                realtimeData.location || null
            }
          : null
    });

  } catch (error) {
    console.error("Nova API error:", error);

    if (error.name === "AbortError") {
      return res.status(504).json({
        error:
          "Nova AI took too long to respond. Please try again."
      });
    }

    return res.status(500).json({
      error:
        "Something went wrong while connecting to Nova AI."
    });
  }
};
