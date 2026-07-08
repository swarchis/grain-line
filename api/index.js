// api/index.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 🛑 STRICTLY USING THE REQUESTED MODEL
const MODEL_NAME = "gemini-flash-lite-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

async function callGemini(prompt, imageBase64) {
  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: "image/png",
            data: imageBase64
          }
        }
      ]
    }],
    generationConfig: {
      response_mime_type: "application/json",
    },
    // Turn off all safety blocks so fashion sketches aren't flagged
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };

  console.log(`🚀 Sending request to: ${MODEL_NAME}`);

  const response = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("❌ Gemini API Error:", JSON.stringify(data, null, 2));
    throw new Error(data.error?.message || `Gemini Error: ${response.status}`);
  }

  if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
    if (data.candidates?.[0]?.finishReason === 'SAFETY') {
      throw new Error("AI Safety Block. Try removing any text from the drawing.");
    }
    throw new Error("Empty response from AI.");
  }

  const rawJson = data.candidates[0].content.parts[0].text;
  return JSON.parse(rawJson);
}

// Text-only variant — vendor parsing and email drafting don't have an image to attach.
async function callGeminiText(prompt) {
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      response_mime_type: "application/json",
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };

  console.log(`🚀 Sending text request to: ${MODEL_NAME}`);

  const response = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("❌ Gemini API Error:", JSON.stringify(data, null, 2));
    throw new Error(data.error?.message || `Gemini Error: ${response.status}`);
  }

  if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
    if (data.candidates?.[0]?.finishReason === 'SAFETY') {
      throw new Error("AI Safety Block. Try rephrasing.");
    }
    throw new Error("Empty response from AI.");
  }

  const rawJson = data.candidates[0].content.parts[0].text;
  return JSON.parse(rawJson);
}

app.post('/api/analyze-design', async (req, res) => {
  console.log("📥 Received analysis request...");
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ ok: false, error: 'No image provided' });

    const prompt = `You are an expert fashion technical designer. Analyze this garment design.
Provide a JSON response with exactly this structure:
{
  "score": <number 0-100>,
  "notes": [
    {
      "severity": "green" | "amber" | "blue" | "red",
      "text": "feedback string"
    }
  ]
}`;

    const analysis = await callGemini(prompt, imageBase64);
    console.log("✅ Analysis successful");
    res.json({ ok: true, analysis });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/generate-tech-pack', async (req, res) => {
  console.log("📥 Received tech pack request...");
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ ok: false, error: 'No image provided' });

    const prompt = `You are an expert technical fashion designer. Create a Bill of Materials (BOM) and Measurements chart for Size Medium.
Return a JSON object with this exact structure:
{
  "bom": [
    { "id": "bom-1", "material": "string", "supplier": "string", "qtyPerUnit": "string", "unitCost": "string" }
  ],
  "measurements": [
    { "id": "meas-1", "size": "S", "chest": "string", "length": "string", "sleeve": "string" },
    { "id": "meas-2", "size": "M", "chest": "string", "length": "string", "sleeve": "string" },
    { "id": "meas-3", "size": "L", "chest": "string", "length": "string", "sleeve": "string" }
  ]
}`;

    const techPackData = await callGemini(prompt, imageBase64);
    console.log("✅ Tech Pack successful");
    res.json({ ok: true, techPackData });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Parses whatever a founder pastes when importing a vendor (a marketplace link,
// a forwarded email, raw notes) into a structured profile. This is the
// human-in-the-loop alternative to scraping sites like Alibaba directly —
// the founder always reviews/edits the result before it's saved.
app.post('/api/parse-vendor', async (req, res) => {
  console.log("📥 Received vendor parse request...");
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ ok: false, error: 'No text provided' });

    const prompt = `You are helping a fashion brand founder import a vendor into their sourcing tool.
They pasted the following link, forwarded email, or notes about a manufacturer/vendor:
"""
${text}
"""
Extract whatever you can reasonably infer. Do not invent specifics you can't support from the text (leave a field as an empty string or null instead of guessing).
Return a JSON object with exactly this structure:
{
  "name": "string",
  "category": "string (e.g. Denim, Knitwear, Outerwear, Headwear, Bags)",
  "location": "string (city, country if known)",
  "specialties": ["short phrase", "short phrase"],
  "moq": <number or null>,
  "leadTime": "string or null (e.g. '45 days')"
}`;

    const parsed = await callGeminiText(prompt);
    console.log("✅ Vendor parse successful");
    res.json({ ok: true, vendor: parsed });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Drafts an email to a vendor using brand/product context. Returns text only —
// the frontend opens it in the founder's own mail client (mailto:) rather than
// sending anything itself, so there's no inbox/OAuth integration to build yet.
app.post('/api/draft-vendor-email', async (req, res) => {
  console.log("📥 Received email draft request...");
  try {
    const { vendorName, productName, garmentType, preferences, ask } = req.body;
    if (!vendorName) return res.status(400).json({ ok: false, error: 'No vendor provided' });

    const prompt = `You are a fashion brand founder's assistant, drafting a professional but warm sourcing email to a manufacturer.
Vendor: ${vendorName}
Product: ${productName || 'a garment'} (${garmentType || 'unspecified type'})
Specific requirements from the founder: ${JSON.stringify(preferences || {})}
What the founder wants to say or ask: ${ask || 'General outreach to introduce the project and ask about working together.'}

Write a concise, professional email (under 200 words). Return a JSON object with exactly this structure:
{
  "subject": "string",
  "body": "string (plain text, use \\n for line breaks, no markdown)"
}`;

    const draft = await callGeminiText(prompt);
    console.log("✅ Email draft successful");
    res.json({ ok: true, draft });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Real-time vendor search — no local database involved. Tavily runs an actual
// web search (Gemini's own Search grounding needs a billing-enabled Google
// Cloud project, confirmed via direct testing, so this stays a separate call),
// then Gemini reads the real results and extracts candidate vendor profiles.
// The founder reviews and explicitly saves whichever ones they want — nothing
// here is written to their vendor list automatically.
app.post('/api/search-vendors', async (req, res) => {
  console.log("📥 Received vendor search request...");
  try {
    const { query } = req.body;
    if (!query || !query.trim()) return res.status(400).json({ ok: false, error: 'No search query provided' });
    if (!process.env.TAVILY_API_KEY || process.env.TAVILY_API_KEY.startsWith('get_a_free_key')) {
      return res.status(400).json({ ok: false, error: 'TAVILY_API_KEY is not set in api/.env — get a free key at tavily.com' });
    }

    // Two Tavily calls run in parallel: a tight query (as the founder typed it) and
    // a loosened one (category/location only) so there's always a wider pool to draw
    // "broader" candidates from, even when the specific query is too narrow to surface much.
    const broadQuery = query.split(/[,.]|(?:\bwith\b)|(?:\bthat\b)/)[0].trim();
    const [tightRes, broadRes] = await Promise.all([
      fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: `${query} manufacturer OR supplier OR factory contact`,
          search_depth: 'advanced',
          max_results: 12,
        }),
      }).then(r => r.json()),
      fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: `${broadQuery} manufacturer OR supplier`,
          search_depth: 'basic',
          max_results: 10,
        }),
      }).then(r => r.json()),
    ]);
    if (tightRes.error) throw new Error(tightRes.error);

    // De-dupe by URL across both result sets.
    const seen = new Set();
    const results = [...(tightRes.results || []), ...(broadRes.results || [])].filter(r => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    if (results.length === 0) {
      return res.json({ ok: true, recommended: [], broader: [] });
    }

    const prompt = `A fashion brand founder searched for vendors with this request: "${query}"

Here are real web search results (some from a tightly-matched search, some from a broader category search, mixed together):
${results.map((r, i) => `[${i}] ${r.title}\nURL: ${r.url}\n${(r.content || '').slice(0, 900)}`).join('\n\n')}

Extract candidate manufacturers/vendors. Be generous, not just literal — include anything plausibly relevant, not only exact matches. Skip only results that are clearly not about a specific company (generic blog posts with no vendor named, marketplace homepages with no specific seller, unrelated pages).

Split them into two groups:
- "recommended": vendors that match essentially everything specific in the founder's request (e.g. if they gave a material, price range, MOQ, or location, these hit all of it).
- "broader": plausible vendors that match the general category/product but miss one or more of the specific details — include these too, don't drop them, since "recommended" can be wrong and the founder should still see other real options.
If the founder's request was vague/generic, most results likely belong in "broader" since there's nothing specific to fully match yet.

For each vendor, figure out the source carefully:
- If the result IS the vendor's own website/page (domain matches the company, or it's their official site/contact page/storefront), set "sourceType": "vendor" and "sourceUrl" to that link.
- If the result is actually a THIRD PARTY talking about the vendor (an Instagram account that reviews manufacturers, a blog post, a directory listing, a marketplace aggregator page) rather than the vendor's own presence, set "sourceType": "review". If the snippet text itself mentions the vendor's own website, email, or handle, put THAT as "sourceUrl" and put the original review/mention link as "reviewUrl". If no direct vendor link can be found anywhere, "sourceUrl" should be the review link itself (still set "sourceType": "review" so the founder knows it's not the vendor's own page).

Do not invent details not supported by the text. Return a JSON object with exactly this structure:
{
  "recommended": [
    { "name": "string", "category": "string", "location": "string or empty", "description": "one sentence on why this matches", "sourceUrl": "string", "sourceType": "vendor" | "review", "reviewUrl": "string or null" }
  ],
  "broader": [ same shape as above ]
}`;

    const parsed = await callGeminiText(prompt);
    console.log("✅ Vendor search successful");
    res.json({ ok: true, recommended: parsed.recommended || [], broader: parsed.broader || [] });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🧠 Backend running on http://localhost:${PORT}`);
});