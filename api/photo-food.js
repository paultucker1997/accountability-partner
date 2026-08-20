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
          '"servingGrams": number, "servingLabel": string, "found": boolean, "confidence": string}. ' +
          "All *100 fields are per 100 grams. servingGrams is the gram weight of ONE serving as stated on " +
          "the Nutrition Facts panel (the number in parentheses next to Serving Size, e.g. 32 for '2 Tbsp " +
          "(32g)'). servingLabel is the household measure alone, without the gram weight (e.g. '2 tbsp', " +
          "'1 slice', '1 bar', '1 cup', '3 cookies'). confidence is 'label' if you read exact printed " +
          "figures from a visible Nutrition Facts panel, 'brand' if the panel isn't fully visible/legible " +
          "but you can identify the specific product name or brand (e.g. 'Skippy Creamy Peanut Butter') " +
          "and know its typical published nutrition, or 'guess' if you can only tell the general food type " +
          "with no specific brand (e.g. just 'peanut butter' with no brand visible). " +
          "IMPORTANT: never substitute generic category averages when you can identify the actual brand/" +
          "product from ANY visible part of the packaging (logo, product name, partial label) — a partially " +
          "cut-off or blurry photo of a Skippy jar should still return Skippy's real numbers from your " +
          "knowledge, not generic peanut butter numbers, and the name field should include the brand. Use " +
          "'guess' confidence, and put the true generic type in name, only when no brand is identifiable at " +
          "all. Only set found to false if the image shows no food or packaging whatsoever.",
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
      servingLabel: String(parsed.servingLabel || "serving").slice(0, 30),
      confidence: ["label", "brand", "guess"].indexOf(parsed.confidence) !== -1 ? parsed.confidence : "guess"
    });
  } catch (err) {
    res.status(500).json({ error: "Request failed: " + (err && err.message ? err.message : String(err)) });
  }
};
