// Vercel serverless function — reads a photo of a food's nutrition label using
// Claude's vision and returns structured per-100g nutrition data. Same pattern
// as coach.js: the API key stays server-side, the client only sends image bytes.

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
  const imageBase64 = body && typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  const mediaType = body && typeof body.mediaType === "string" ? body.mediaType : "image/jpeg";
  if (!imageBase64) {
    res.status(400).json({ error: "Missing imageBase64" });
    return;
  }
  if (imageBase64.length > 6000000) {
    res.status(400).json({ error: "Image too large" });
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
        max_tokens: 300,
        system:
          "You read photos of food packaging or nutrition facts panels for a calorie-tracking app. " +
          "Respond with ONLY a single JSON object, no other text, no markdown fences. Shape: " +
          '{"name": string, "kcal100": number, "protein100": number, "carbs100": number, ' +
          '"servingGrams": number, "servingLabel": string, "found": boolean}. ' +
          "All *100 fields are per 100 grams. servingGrams is the gram weight of ONE serving as stated on " +
          "the Nutrition Facts panel (the number in parentheses next to Serving Size, e.g. 32 for '2 Tbsp " +
          "(32g)'). servingLabel is the household measure alone, without the gram weight (e.g. '2 tbsp', " +
          "'1 slice', '1 bar', '1 cup', '3 cookies'). If you can read exact figures from a Nutrition Facts " +
          "panel, compute the per-100g values from the serving size shown. If no nutrition panel is visible, " +
          "make your best estimate from the product name/type — including a reasonable servingGrams and " +
          "servingLabel (e.g. '1 medium' for a piece of fruit) — and set found to true anyway. Only set " +
          "found to false if the image doesn't show food or packaging at all.",
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: "Identify this food, its nutrition per 100g, and its serving size." }
          ]
        }]
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
    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (e) {
      res.status(502).json({ error: "Couldn't parse a response from the model." });
      return;
    }
    if (!parsed.found) {
      res.status(200).json({ found: false });
      return;
    }
    res.status(200).json({
      found: true,
      name: String(parsed.name || "Unknown food").slice(0, 60),
      kcal100: Math.max(0, Math.round(Number(parsed.kcal100) || 0)),
      protein100: Math.max(0, Math.round(Number(parsed.protein100) || 0)),
      carbs100: Math.max(0, Math.round(Number(parsed.carbs100) || 0)),
      servingGrams: Number(parsed.servingGrams) > 0 ? Math.round(Number(parsed.servingGrams)) : 100,
      servingLabel: String(parsed.servingLabel || "serving").slice(0, 30)
    });
  } catch (err) {
    res.status(500).json({ error: "Request failed: " + (err && err.message ? err.message : String(err)) });
  }
};
