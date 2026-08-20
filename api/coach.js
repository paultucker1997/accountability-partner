// Vercel serverless function — proxies a coaching request to the Anthropic API.
// Keeps the API key server-side (set ANTHROPIC_API_KEY in Vercel project settings);
// the client only ever sends a plain-text daily summary and gets tip text back.

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "Server is missing ANTHROPIC_API_KEY. Add it in Vercel → Project → Settings → Environment Variables, then redeploy."
    });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  const summary = body && typeof body.summary === "string" ? body.summary.slice(0, 4000) : "";
  if (!summary) {
    res.status(400).json({ error: "Missing summary" });
    return;
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 400,
        system:
          "You are a supportive, concise fitness and habit coach embedded in a personal " +
          "accountability app. You'll get a snapshot of the user's day: habits done/missed, " +
          "food logged (calories, protein, carbs), exercise logged, weight, and streak. Give " +
          "2-4 short, specific, encouraging observations or tips based ONLY on this data — " +
          "no generic advice, no filler, no lecturing, no disclaimers. Reference the actual " +
          "numbers when it helps. Plain text, no markdown headers or bullet symbols, under " +
          "120 words total.",
        messages: [{ role: "user", content: summary }]
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(upstream.status).json({ error: "Anthropic API error: " + errText.slice(0, 300) });
      return;
    }

    const data = await upstream.json();
    const text = Array.isArray(data.content)
      ? data.content.map((b) => (b && b.text) || "").join("").trim()
      : "";
    res.status(200).json({ tip: text || "No response from the model." });
  } catch (err) {
    res.status(500).json({ error: "Request failed: " + (err && err.message ? err.message : String(err)) });
  }
};
