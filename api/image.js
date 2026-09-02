export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        error: "Please provide an image prompt."
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY is not configured."
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);

    const response = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nova-ai.vercel.app",
        "X-Title": "Nova AI"
      },
      body: JSON.stringify({
        model: "bytedance-seed/seedream-4.5",
        prompt: prompt
      })
    });

    clearTimeout(timeout);

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenRouter image error:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "The image could not be generated."
      });
    }

    const image = data?.data?.[0];

    if (!image?.b64_json) {
      return res.status(500).json({
        error: "OpenRouter returned no image."
      });
    }

    const mediaType = image.media_type || "image/png";

    return res.status(200).json({
      image: `data:${mediaType};base64,${image.b64_json}`
    });

  } catch (error) {
    console.error("Image generation error:", error);

    if (error.name === "AbortError") {
      return res.status(504).json({
        error: "Image generation took too long. Please try again."
      });
    }

    return res.status(500).json({
      error: "Something went wrong while generating the image."
    });
  }
}
