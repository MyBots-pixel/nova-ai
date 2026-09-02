const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

async function searchWeb(query) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: "openrouter/auto",
      messages: [
        {
          role: "system",
          content:
            "You are Nova AI's web research tool. Search the live web for the user's request. Use current, reliable sources. Clearly distinguish facts from uncertainty. Keep the answer concise but useful.",
        },
        {
          role: "user",
          content: query,
        },
      ],
      plugins: [
        {
          id: "web",
          max_results: 5,
        },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `OpenRouter web search failed with status ${response.status}`
    );
  }

  const message = data?.choices?.[0]?.message;

  if (!message) {
    throw new Error("No response was returned from the web search.");
  }

  return {
    answer: message.content || "",
    citations: message.annotations || [],
  };
}

module.exports = {
  searchWeb,
};
