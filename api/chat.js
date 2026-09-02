const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

function cleanText(value) {
  if (typeof value !== "string") return "";

  return value
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, 4000);
}

async function fetchJSON(url, options = {}) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, options.timeout || 15000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.reason ||
        data?.error ||
        `Request failed with status ${response.status}`
      );
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// LOCATION
// ============================================================

async function geocodeLocation(location) {
  const url =
    `${GEOCODING_URL}` +
    `?name=${encodeURIComponent(location)}` +
    `&count=1` +
    `&language=en` +
    `&format=json`;

  const data = await fetchJSON(url);

  if (!data.results || data.results.length === 0) {
    return null;
  }

  return data.results[0];
}

// ============================================================
// WEATHER
// ============================================================

function weatherDescription(code) {
  const descriptions = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Rime fog",
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
    82: "Heavy rain showers",
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

  const url =
    `${WEATHER_URL}` +
    `?latitude=${encodeURIComponent(place.latitude)}` +
    `&longitude=${encodeURIComponent(place.longitude)}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset` +
    `&timezone=${encodeURIComponent(place.timezone)}` +
    `&forecast_days=7`;

  const data = await fetchJSON(url);

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

// ============================================================
// TIMEZONE HELPERS
// ============================================================

function isBSTCurrently() {
  const now = new Date();

  const londonParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    timeZoneName: "short"
  }).formatToParts(now);

  const zone = londonParts.find(
    part => part.type === "timeZoneName"
  );

  return zone?.value === "BST";
}

function getUKTime() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZoneName: "short"
  });

  const parts = formatter.formatToParts(now);

  const get = type =>
    parts.find(part => part.type === type)?.value || "";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
    timezone: get("timeZoneName"),
    offset: isBSTCurrently() ? 1 : 0
  };
}

// ============================================================
// OFFSET PARSER
// ============================================================

function parseTimezone(message) {
  const text = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  // ----------------------------------------------------------
  // Explicit UTC/GMT offsets
  // Examples:
  // UTC+1
  // UTC + 1
  // GMT+2
  // UTC-5
  // ----------------------------------------------------------

  const utcMatch = text.match(
    /\b(utc|gmt)\s*([+-])\s*(\d{1,2})(?::(\d{2}))?\b/i
  );

  if (utcMatch) {
    const sign = utcMatch[2] === "+" ? 1 : -1;
    const hours = Number(utcMatch[3]);
    const minutes = Number(utcMatch[4] || 0);

    const offsetMinutes =
      sign * ((hours * 60) + minutes);

    return {
      type: "offset",
      label: `${utcMatch[1].toUpperCase()}${utcMatch[2]}${hours}`,
      offsetMinutes
    };
  }

  // ----------------------------------------------------------
  // Plain UTC / GMT
  // ----------------------------------------------------------

  if (
    /\b(utc|gmt)\b/i.test(text) &&
    !/\b(utc|gmt)\s*[+-]/i.test(text)
  ) {
    return {
      type: "offset",
      label: "UTC+0",
      offsetMinutes: 0
    };
  }

  // ----------------------------------------------------------
  // BST
  //
  // BST is NOT a fixed timezone all year.
  //
  // In the UK:
  // Winter = GMT / UTC+0
  // Summer = BST / UTC+1
  // ----------------------------------------------------------

  if (/\bbst\b/i.test(text)) {
    return {
      type: "uk",
      label: "BST",
      offsetMinutes: null
    };
  }

  // ----------------------------------------------------------
  // BST + or - adjustment
  //
  // Example:
  // BST+1
  //
  // This means:
  // Current BST time + 1 hour
  //
  // Since BST is UTC+1, this becomes UTC+2.
  // ----------------------------------------------------------

  const bstAdjustment = text.match(
    /\bbst\s*([+-])\s*(\d{1,2})(?::(\d{2}))?\b/i
  );

  if (bstAdjustment) {
    const sign = bstAdjustment[1] === "+" ? 1 : -1;
    const hours = Number(bstAdjustment[2]);
    const minutes = Number(bstAdjustment[3] || 0);

    const bstOffsetMinutes =
      (isBSTCurrently() ? 60 : 0);

    const adjustmentMinutes =
      sign * ((hours * 60) + minutes);

    return {
      type: "adjusted",
      label: `BST${bstAdjustment[1]}${hours}`,
      offsetMinutes:
        bstOffsetMinutes + adjustmentMinutes
    };
  }

  return null;
}

// ============================================================
// OFFSET TIME
// ============================================================

function getTimeAtOffset(offsetMinutes) {
  const now = new Date();

  const utcTime =
    now.getTime() +
    now.getTimezoneOffset() * 60 * 1000;

  const targetTime =
    utcTime +
    offsetMinutes * 60 * 1000;

  const target = new Date(targetTime);

  const hours = String(target.getUTCHours()).padStart(2, "0");
  const minutes = String(target.getUTCMinutes()).padStart(2, "0");
  const seconds = String(target.getUTCSeconds()).padStart(2, "0");

  const day = String(target.getUTCDate()).padStart(2, "0");
  const month = String(target.getUTCMonth() + 1).padStart(2, "0");
  const year = target.getUTCFullYear();

  const sign = offsetMinutes >= 0 ? "+" : "-";

  const absoluteMinutes = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteMinutes / 60);
  const offsetRemainder = absoluteMinutes % 60;

  let offsetText = `UTC${sign}${offsetHours}`;

  if (offsetRemainder !== 0) {
    offsetText += `:${String(offsetRemainder).padStart(2, "0")}`;
  }

  return {
    time: `${hours}:${minutes}:${seconds}`,
    date: `${year}-${month}-${day}`,
    offsetText
  };
}

// ============================================================
// LOCATION TIME
// ============================================================

async function getLocationTime(location) {
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

  const zoneFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: place.timezone,
    timeZoneName: "long"
  });

  const zoneParts = zoneFormatter.formatToParts(now);

  const timezoneName =
    zoneParts.find(
      part => part.type === "timeZoneName"
    )?.value || place.timezone;

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
    timezoneName
  };
}

// ============================================================
// EXTRACT LOCATION
// ============================================================

function extractLocation(message) {
  const patterns = [
    /\bweather\s+(?:in|at|near|for)\s+(.+?)(?:\?|$)/i,
    /\btemperature\s+(?:in|at|near|for)\s+(.+?)(?:\?|$)/i,
    /\bforecast\s+(?:in|at|near|for)\s+(.+?)(?:\?|$)/i,
    /\btime\s+(?:in|at)\s+(.+?)(?:\?|$)/i,
    /\blocal\s+time\s+(?:in|at)\s+(.+?)(?:\?|$)/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match && match[1]) {
      let location = match[1]
        .trim()
        .replace(/[.!]+$/, "")
        .trim();

      location = location
        .replace(
          /\b(today|tomorrow|tonight|now|right now)\b/gi,
          ""
        )
        .trim();

      if (location) {
        return location;
      }
    }
  }

  return null;
}

// ============================================================
// REQUEST DETECTION
// ============================================================

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
    "humidity",
    "wind",
    "degrees"
  ];

  return weatherWords.some(word =>
    text.includes(word)
  );
}

function isTimeRequest(message) {
  const text = message.toLowerCase();

  return (
    text.includes("what time") ||
    text.includes("current time") ||
    text.includes("time in ") ||
    text.includes("time at ") ||
    text.includes("local time") ||
    text.includes("time now") ||
    /\butc\s*[+-]\s*\d+/i.test(message) ||
    /\bgmt\s*[+-]\s*\d+/i.test(message) ||
    /\bbst\b/i.test(message)
  );
}

// ============================================================
// REAL-TIME DATA
// ============================================================

async function getRealtimeData(message) {
  try {
    if (isWeatherRequest(message)) {
      const location = extractLocation(message);

      if (!location) {
        return {
          success: false,
          type: "weather",
          error:
            "Please give me a location, for example: weather in London."
        };
      }

      return await getWeather(location);
    }

    if (isTimeRequest(message)) {
      const timezone = parseTimezone(message);

      // BST / BST+1 / BST-1
      if (timezone) {
        if (timezone.type === "uk") {
          const ukTime = getUKTime();

          return {
            success: true,
            type: "time",
            mode: "uk",
            time: ukTime.time,
            date: ukTime.date,
            timezone: ukTime.timezone,
            offsetMinutes: ukTime.offset * 60
          };
        }

        const result = getTimeAtOffset(
          timezone.offsetMinutes
        );

        return {
          success: true,
          type: "time",
          mode: "offset",
          requestedTimezone: timezone.label,
          time: result.time,
          date: result.date,
          offsetText: result.offsetText
        };
      }

      // City / country
      const location = extractLocation(message);

      if (location) {
        return await getLocationTime(location);
      }

      return {
        success: false,
        type: "time",
        error:
          "Please give me a location or timezone, such as London, Tokyo, UTC+1 or BST."
      };
    }

    return null;

  } catch (error) {
    console.error("Realtime error:", error);

    return {
      success: false,
      type: "realtime",
      error:
        "The live information service is temporarily unavailable."
    };
  }
}

// ============================================================
// REAL-TIME CONTEXT FOR NOVA
// ============================================================

function buildRealtimeContext(data) {
  if (!data) {
    return "";
  }

  if (!data.success) {
    return `
LIVE INFORMATION LOOKUP FAILED

${data.error}

Do not invent live information.
`;
  }

  if (data.type === "weather") {
    const location = [
      data.location.name,
      data.location.region,
      data.location.country
    ]
      .filter(Boolean)
      .join(", ");

    const forecast = data.forecast.dates
      .slice(0, 7)
      .map((date, index) => {
        return (
          `${date}: ` +
          `${data.forecast.minTemperatures[index]}°C to ` +
          `${data.forecast.maxTemperatures[index]}°C, ` +
          `${weatherDescription(data.forecast.weatherCodes[index])}, ` +
          `${data.forecast.rainChance[index] ?? 0}% rain chance`
        );
      })
      .join("\n");

    return `
LIVE WEATHER DATA

Location: ${location}
Timezone: ${data.location.timezone}

Current temperature: ${data.current.temperature}°C
Feels like: ${data.current.apparentTemperature}°C
Humidity: ${data.current.humidity}%
Wind: ${data.current.windSpeed} km/h
Precipitation: ${data.current.precipitation} mm
Conditions: ${data.current.description}
Local data time: ${data.current.time}

Forecast:
${forecast}

Use this live data as the source of truth.
Do not make up weather values.
`;
  }

  if (data.type === "time") {
    if (data.mode === "offset") {
      return `
LIVE TIME DATA

Requested timezone: ${data.requestedTimezone}
Actual offset: ${data.offsetText}

Current date: ${data.date}
Current time: ${data.time}

Use this exact live time.
`;
    }

    if (data.mode === "uk") {
      return `
LIVE UK TIME DATA

The United Kingdom currently uses ${data.timezone}.

Current date: ${data.date}
Current time: ${data.time}

BST is UTC+1.
GMT is UTC+0.

Use this exact live time.
`;
    }

    return `
LIVE TIME DATA

Location: ${data.location.name}
${data.location.region ? `Region: ${data.location.region}` : ""}
Country: ${data.location.country}

Timezone: ${data.location.timezone}
Timezone name: ${data.timezoneName}

Current date: ${data.date}
Current local time: ${data.time}

Use this exact live time.
`;
  }

  return "";
}

// ============================================================
// MAIN NOVA API
// ============================================================

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

    if (!message) {
      return res.status(400).json({
        error: "Message is required."
      });
    }

    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            item =>
              item &&
              (item.role === "user" ||
                item.role === "assistant") &&
              typeof item.content === "string"
          )
          .slice(-20)
          .map(item => ({
            role: item.role,
            content: cleanText(item.content).slice(0, 6000)
          }))
      : [];

    // Get live weather/time if needed.
    const realtimeData =
      await getRealtimeData(message);

    const realtimeContext =
      buildRealtimeContext(realtimeData);

    const systemPrompt = `
You are Nova AI.

You are helpful, friendly, intelligent and conversational.

You have access to LIVE INFORMATION when it is supplied below.

IMPORTANT:

If live information is supplied, use it as the authoritative source.

Never invent current weather or time.

For weather:
- Use Celsius by default.
- Give the requested location.
- Give the current conditions clearly.
- Use the supplied forecast when asked about future weather.

For time:
- Use the exact supplied live time.
- Explain the timezone when useful.
- Do not guess the time.

TIMEZONE RULES:

GMT = UTC+0.

BST = British Summer Time = UTC+1.

BST is only used during the UK's daylight-saving period.
Outside that period the UK uses GMT.

If someone asks for "BST+1", interpret it as:
current BST time plus one hour.

Therefore BST+1 normally corresponds to UTC+2.

If someone asks for "BST-1", interpret it as:
current BST time minus one hour.

For explicit UTC/GMT offsets, use the supplied offset exactly.

Keep answers natural and concise.

Do not mention APIs, OpenRouter, server code, environment variables,
or implementation details unless the user specifically asks how Nova works.
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

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 30000);

    let response;

    try {
      response = await fetch(
        OPENROUTER_URL,
        {
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
        }
      );
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
              mode: realtimeData.mode || null
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
