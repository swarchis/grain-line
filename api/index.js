// api/index.js
const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Resend } = require('resend');

// Explicit path, not the bare `dotenv.config()` default
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const MODEL_NAME = "gemini-flash-lite-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

function cleanAIJSON(text) {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}

async function callGemini(prompt, imageBase64 = null) {
  const parts = [{ text: prompt }];
  if (imageBase64) {
    parts.push({ inline_data: { mime_type: "image/png", data: imageBase64 } });
  }

  const payload = {
    contents: [{ parts }],
    generationConfig: { response_mime_type: "application/json" },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };

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

  const rawText = data.candidates[0].content.parts[0].text;
  return JSON.parse(cleanAIJSON(rawText));
}

const IMAGE_MODEL_NAME = "gemini-2.5-flash-image";
const GEMINI_IMAGE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL_NAME}:generateContent`;

// Sends a text prompt plus zero or more reference images to Gemini's image
// model and returns the generated/edited image as base64. Unlike callGemini
// (which asks for structured JSON back), this model's native output IS an
// image — no responseModalities config needed to get one back.
async function callGeminiImage(prompt, imageInputsBase64 = []) {
  const parts = [{ text: prompt }];
  imageInputsBase64.forEach(b64 => {
    if (b64) parts.push({ inline_data: { mime_type: "image/png", data: b64 } });
  });

  const payload = {
    contents: [{ parts }],
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };

  const response = await fetch(`${GEMINI_IMAGE_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("❌ Gemini Image API Error:", JSON.stringify(data, null, 2));
    throw new Error(data.error?.message || `Gemini Image Error: ${response.status}`);
  }

  const responseParts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = responseParts.find(p => p.inline_data || p.inlineData);
  if (!imagePart) {
    if (data.candidates?.[0]?.finishReason === 'SAFETY') {
      throw new Error("AI safety block — try a different prompt or image.");
    }
    const textPart = responseParts.find(p => p.text);
    throw new Error(textPart?.text ? `AI didn't return an image: ${textPart.text}` : "The AI didn't return an image. Try rephrasing your request.");
  }
  const inline = imagePart.inline_data || imagePart.inlineData;
  return { base64: inline.data, mimeType: inline.mime_type || inline.mimeType || 'image/png' };
}

// ---------------------------------------------------------
// 1. DESIGN & TECH PACK ENDPOINTS
// ---------------------------------------------------------

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

app.post('/api/generate-silhouette', async (req, res) => {
  console.log("📥 Received silhouette generation request...");
  try {
    const { garmentType } = req.body;
    if (!garmentType || !garmentType.trim()) return res.status(400).json({ ok: false, error: 'No garment type provided' });

    const prompt = `You are a technical fashion illustrator drawing a flat, symmetric garment silhouette outline for the garment type: "${garmentType.trim()}".

Style rules — match these exactly, this must look like a simple technical flat, not clip art:
- Output SVG path "d" strings only, meant to be drawn in a 60×72 viewBox, stroke-only (no fill), centered in the frame with a small margin.
- Keep it to 1-3 paths total: one closed outline path for the garment's overall shape, and optionally 1-2 simple interior detail paths (a seam line, a neckline curve, a strap) — nothing decorative or textured.
- Use simple curves (Q or C commands) and lines (L), the way a garment technical flat is drawn — no more than ~12 path commands per path.
- The shape must be a plausible, recognizable silhouette of "${garmentType.trim()}" as worn/laid flat, front view.
- If the garment has small fixed points worth marking (e.g. button positions), you may include up to 2 small accent dots as {"cx","cy","r"} objects with r between 1 and 2.

Return ONLY a JSON object with exactly this structure:
{
  "paths": ["<svg path d string>", "<svg path d string>"],
  "accents": [{"cx": <number>, "cy": <number>, "r": <number>}]
}
"accents" may be an empty array. Do not include any commentary, only the JSON object.`;

    const result = await callGemini(prompt);
    if (!Array.isArray(result.paths) || result.paths.length === 0 || result.paths.length > 3) {
      throw new Error('AI returned an unusable silhouette — try rephrasing the garment type.');
    }
    const paths = result.paths.filter(p => typeof p === 'string' && p.length > 0 && p.length < 500);
    if (paths.length === 0) throw new Error('AI returned an unusable silhouette — try rephrasing the garment type.');
    const accents = Array.isArray(result.accents)
      ? result.accents.filter(a => a && typeof a.cx === 'number' && typeof a.cy === 'number' && typeof a.r === 'number').slice(0, 2)
      : [];

    console.log("✅ Silhouette generation successful");
    res.json({ ok: true, paths, accents });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ---------------------------------------------------------
// 2. VENDOR SOURCING & OUTREACH ENDPOINTS
// ---------------------------------------------------------

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

    const parsed = await callGemini(prompt);
    console.log("✅ Vendor parse successful");
    res.json({ ok: true, vendor: parsed });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/draft-vendor-email', async (req, res) => {
  console.log("📥 Received email draft request...");
  try {
    const { vendorName, productName, garmentType, preferences, ask } = req.body;
    if (!vendorName) return res.status(400).json({ ok: false, error: 'No vendor provided' });

    const prompt = `You are an independent fashion brand founder writing an outreach email to a clothing manufacturer.

Write a professional, concise, and polite Request for Quote (RFQ) email to a manufacturer.
Factories are busy and ignore long emails. Get straight to the point.

Details to include:
- Vendor Name: ${vendorName}
- Product: ${productName || 'a new design'} (${garmentType || 'unspecified type'})
- Target Quantity (MOQ): ${preferences?.quantity || 'Not specified yet'}
- Target Unit Cost: ${preferences?.targetUnitCost ? '$' + preferences.targetUnitCost : 'Not specified yet'}
- Target Deadline: ${preferences?.deadline || 'Standard lead time'}
- Additional Founder Note/Ask: ${ask || 'General outreach to introduce the project and ask about working together.'}

Write a concise, professional email (under 200 words), with a placeholder for the sender's name at the bottom. Return a JSON object with exactly this structure:
{
  "subject": "string",
  "body": "string (plain text, use \\n for line breaks, no markdown)"
}`;

    const draft = await callGemini(prompt);
    console.log("✅ Email draft successful");
    res.json({ ok: true, draft });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/search-vendors', async (req, res) => {
  console.log("📥 Received vendor search request...");
  try {
    const { query } = req.body;
    if (!query || !query.trim()) return res.status(400).json({ ok: false, error: 'No search query provided' });
    if (!process.env.TAVILY_API_KEY || process.env.TAVILY_API_KEY.startsWith('get_a_free_key')) {
      return res.status(400).json({ ok: false, error: 'TAVILY_API_KEY is not set in api/.env — get a free key at tavily.com' });
    }

    const broadQuery = query.split(/[,.]|(?:\bwith\b)|(?:\bthat\b)/)[0].trim();
    const MFG_BIAS = 'private label OR white label OR OEM ODM OR contract manufacturer OR wholesale factory -shop -"our collection"';
    const [tightRes, broadRes] = await Promise.all([
      fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: `${query} ${MFG_BIAS}`,
          search_depth: 'advanced',
          max_results: 12,
        }),
      }).then(r => r.json()),
      fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: `${broadQuery} ${MFG_BIAS}`,
          search_depth: 'basic',
          max_results: 10,
        }),
      }).then(r => r.json()),
    ]);
    if (tightRes.error) throw new Error(tightRes.error);

    const seen = new Set();
    const results = [...(tightRes.results || []), ...(broadRes.results || [])].filter(r => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    if (results.length === 0) {
      return res.json({ ok: true, recommended: [], broader: [] });
    }

    const prompt = `A fashion brand founder searched for a MANUFACTURER with this request: "${query}"

Here are real web search results (some from a tightly-matched search, some from a broader category search, mixed together):
${results.map((r, i) => `[${i}] ${r.title}\nURL: ${r.url}\n${(r.content || '').slice(0, 900)}`).join('\n\n')}

CRITICAL FILTER — apply this before anything else:
The founder needs a company that will MANUFACTURE GARMENTS FOR THEM based on a design/tech pack they send in — private label, white label, OEM/ODM, contract manufacturing, cut-make-trim, "start your own clothing line" production partners.
EXCLUDE any company that is itself a clothing BRAND selling finished products under its own name directly to end consumers — even if it mentions organic cotton, sustainable materials, or "manufactured ethically." A brand talking about how ITS OWN products are made is not a match.
Signals a result IS a manufacturer-for-hire (include): "private label," "white label," "wholesale," "MOQ for your brand," "start your clothing line," "we manufacture for brands," "contract manufacturing," "OEM/ODM," "sample and bulk production," "sourcing agent," "factory partner," pricing/MOQ framed around a business customer.
Signals a result is a retail BRAND instead (exclude): online shop / storefront language, "shop now," "add to cart," "our collection," a founder's personal story about their own product line, sizing charts for individual customers, no mention of producing for other businesses.
If you are not reasonably confident a result is a manufacturer-for-hire rather than a retail brand, LEAVE IT OUT — do not guess, and do not include it "just in case." Precision matters more than volume here.

After applying that filter, split what's left into two groups:
- "recommended": manufacturers that match essentially everything specific in the founder's request (e.g. if they gave a material, price range, MOQ, or location, these hit all of it).
- "broader": manufacturers that match the general category but miss one or more of the specific details — still include these, don't drop them, since "recommended" can be wrong and the founder should see other real options.
If the founder's request was vague/generic, most results likely belong in "broader" since there's nothing specific to fully match yet.
It's completely fine for a group to be empty if nothing qualifies — an empty list beats a wrong one.

For each manufacturer, figure out the source carefully:
- If the result IS the manufacturer's own website/page (domain matches the company, or it's their official site/contact page), set "sourceType": "vendor" and "sourceUrl" to that link.
- If the result is actually a THIRD PARTY talking about the manufacturer (an Instagram account that reviews manufacturers, a blog post, a directory listing, a marketplace aggregator page) rather than their own presence, set "sourceType": "review". If the snippet text itself mentions the manufacturer's own website, email, or handle, put THAT as "sourceUrl" and put the original review/mention link as "reviewUrl". If no direct link can be found anywhere, "sourceUrl" should be the review link itself (still set "sourceType": "review").

Also extract, if the text supports it (leave null/empty rather than guessing): specialties (short phrases describing what they specialize in — materials, garment types, techniques), moq (minimum order quantity as a number), leadTime (e.g. "45 days").

Do not invent details not supported by the text. Return a JSON object with exactly this structure:
{
  "recommended": [
    { "name": "string", "category": "string", "location": "string or empty", "description": "one sentence on why this matches", "sourceUrl": "string", "sourceType": "vendor" | "review", "reviewUrl": "string or null", "specialties": ["string"], "moq": <number or null>, "leadTime": "string or null" }
  ],
  "broader": [ same shape as above ]
}`;

    const parsed = await callGemini(prompt);

    const PARKING_SIGNALS = ['buy this domain', 'domain is for sale', 'this domain may be for sale', 'domain for sale', 'sedo.com', 'hugedomains', 'afternic', 'dan.com', 'godaddy.com/domainsearch', 'the lease to own', 'inquire about this domain'];
    async function isLikelyAlive(url) {
      if (!url) return true;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const r = await fetch(url, { signal: controller.signal, redirect: 'follow' });
        clearTimeout(timeout);
        if (!r.ok) return true; 
        const text = (await r.text()).toLowerCase().slice(0, 5000);
        return !PARKING_SIGNALS.some(s => text.includes(s));
      } catch {
        return true; 
      }
    }
    async function filterAlive(list) {
      const checks = await Promise.all((list || []).map(async v => ({ v, alive: await isLikelyAlive(v.sourceUrl) })));
      return checks.filter(c => c.alive).map(c => c.v);
    }

    const [recommended, broader] = await Promise.all([
      filterAlive(parsed.recommended),
      filterAlive(parsed.broader),
    ]);

    console.log("✅ Vendor search successful");
    res.json({ ok: true, recommended, broader });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/analyze-vendor-fit', async (req, res) => {
  console.log("📥 Received vendor fit request...");
  try {
    const { vendor, product, brand, quoteHistory, bom } = req.body;
    if (!vendor || !product) return res.status(400).json({ ok: false, error: 'Vendor and product are required' });
    if (!product.budget) {
      return res.status(400).json({ ok: false, error: 'No budget set for this product — enter one before analyzing, there is nothing to compare vendor cost against otherwise.' });
    }

    const prompt = `You are a sourcing advisor helping a fashion brand founder judge whether a vendor is a good fit for a specific product. Be honest and specific — flag real risks rather than being generically positive.

Vendor:
Name: ${vendor.name}
Category: ${vendor.category || 'unknown'}
Location: ${vendor.location || 'unknown'}
MOQ: ${vendor.moq ?? 'unknown'}
Lead time: ${vendor.lead_time || 'unknown'}
Specialties: ${(vendor.specialties || []).join(', ') || 'none listed'}
Rating: ${vendor.rating ?? 'no rating'}
Founder's own notes about this vendor: ${vendor.notes || 'none'}
Trust label: ${vendor.label}

Product to be made:
Name: ${product.name}
Category: ${product.category}
Budget: $${product.budget}
Risk tolerance for this product: ${product.risk}
Factory readiness score: ${product.readiness}%

Bill of materials for this product (this matters a lot — a vendor's fit strongly depends on whether they plausibly work with these specific materials/components):
${bom && bom.length ? bom.map(b => `- ${b.material}${b.qtyPerUnit ? `, ${b.qtyPerUnit}/unit` : ''}${b.unitCost ? `, ~$${b.unitCost}/unit material cost` : ''}`).join('\n') : 'No BOM on file yet for this product.'}

Brand context:
Quality tier: ${brand?.qualityTier || 'unknown'}
Budget philosophy: ${brand?.budgetPhilosophy || 'unknown'}
Sustainability preference: ${brand?.sustainability || 'unknown'}
Global risk tolerance: ${brand?.globalRisk || 'unknown'}

Quote history with this vendor for this product: ${quoteHistory && quoteHistory.length ? JSON.stringify(quoteHistory) : 'none yet'}

Assess, in this order of importance:
1. Material/BOM compatibility — do this vendor's specialties/category plausibly cover the specific materials listed in the BOM? Call out any material that looks like a stretch for their stated specialties (e.g. a denim specialist being asked to produce a technical shell fabric).
2. Whether the MOQ makes sense against the stated budget — rough unit economics: divide budget by MOQ for a rough per-unit ceiling, and compare that against the BOM's per-unit material costs if given (materials alone eating most of that ceiling is a red flag — there's nothing left for labor, overhead, or margin).
3. Location/lead-time risk relative to the stated risk tolerance.
4. Anything concerning in the notes or quote history (a quoted price far above budget, no specialties overlap, no track record at all).
If quote history with this vendor exists, weight it heavily — real quotes are much stronger evidence than category matching alone.
If there's very little data available (no quotes, no notes, no rating, no BOM), say so explicitly and reflect that as lower confidence rather than inventing certainty.

Return a JSON object with exactly this structure:
{
  "score": <number 0-100, overall fit/profitability confidence>,
  "notes": [
    { "severity": "green" | "amber" | "blue" | "red", "text": "specific, actionable feedback string" }
  ]
}`;

    const analysis = await callGemini(prompt);
    console.log("✅ Vendor fit analysis successful");
    res.json({ ok: true, analysis });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ---------------------------------------------------------
// 3. BILLING (Stripe)
// ---------------------------------------------------------
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const PRICE_IDS = { basic: process.env.STRIPE_PRICE_BASIC, premium: process.env.STRIPE_PRICE_PREMIUM };
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const API_URL = process.env.API_URL || 'http://localhost:3001';

function requireStripe(res) {
  if (!stripe) {
    res.status(400).json({ ok: false, error: 'Billing is not configured yet — add STRIPE_SECRET_KEY to api/.env and run scripts/setup-stripe-products.js.' });
    return false;
  }
  return true;
}

app.post('/api/create-checkout-session', async (req, res) => {
  if (!requireStripe(res)) return;
  try {
    const { plan, brandId, brandEmail } = req.body;
    const priceId = PRICE_IDS[plan];
    if (!priceId) return res.status(400).json({ ok: false, error: `Unknown or unconfigured plan: ${plan}` });
    if (!brandId) return res.status(400).json({ ok: false, error: 'No brand provided' });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: brandEmail || undefined,
      client_reference_id: brandId,
      metadata: { brandId, plan },
      success_url: `${APP_URL}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/settings?billing=cancelled`,
    });
    res.json({ ok: true, url: session.url });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/confirm-checkout', async (req, res) => {
  if (!requireStripe(res)) return;
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ ok: false, error: 'No session id provided' });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.status(400).json({ ok: false, error: 'Checkout has not completed yet.' });
    }
    res.json({
      ok: true,
      plan: session.metadata?.plan,
      brandId: session.client_reference_id,
      customerId: session.customer,
      subscriptionId: session.subscription,
    });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/create-portal-session', async (req, res) => {
  if (!requireStripe(res)) return;
  try {
    const { customerId } = req.body;
    if (!customerId) return res.status(400).json({ ok: false, error: 'No Stripe customer on file for this brand yet.' });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/settings`,
    });
    res.json({ ok: true, url: session.url });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/subscription-status', async (req, res) => {
  if (!requireStripe(res)) return;
  try {
    const { subscriptionId } = req.body;
    if (!subscriptionId) return res.status(400).json({ ok: false, error: 'No subscription id provided' });

    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const isActive = sub.status === 'active' || sub.status === 'trialing';
    let plan = null;
    if (isActive) {
      const priceId = sub.items.data[0]?.price?.id;
      plan = Object.entries(PRICE_IDS).find(([, id]) => id === priceId)?.[0] || null;
    }
    res.json({ ok: true, active: isActive, plan, status: sub.status });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ---------------------------------------------------------
// 4. SHOPIFY INTEGRATION
// ---------------------------------------------------------

app.get('/api/shopify/auth', (req, res) => {
  const { shop, brandId } = req.query;
  if (!shop || !brandId) return res.status(400).send('Missing shop or brandId');

  if (!process.env.SHOPIFY_CLIENT_ID) {
    return res.status(400).send('SHOPIFY_CLIENT_ID is missing from api/.env.');
  }

  const scopes = 'read_orders,read_products';
  const redirectUri = `${API_URL}/api/shopify/callback`;
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_CLIENT_ID}&scope=${scopes}&redirect_uri=${redirectUri}&state=${brandId}`;
  
  res.redirect(installUrl);
});

app.get('/api/shopify/callback', async (req, res) => {
  const { shop, code, state: brandId } = req.query;
  if (!shop || !code || !brandId) return res.status(400).send('Missing parameters');

  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code
      })
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error_description || 'Failed to get token');

    res.redirect(`${APP_URL}/sales?shopify_success=true&shop=${shop}&token=${data.access_token}&brandId=${brandId}`);
  } catch (err) {
    console.error('Shopify OAuth Error:', err);
    res.redirect(`${APP_URL}/sales?shopify_error=true`);
  }
});

app.post('/api/shopify/fetch-orders', async (req, res) => {
  const { shop, token } = req.body;
  if (!shop || !token) return res.status(400).json({ ok: false, error: 'Missing shop or token' });

  try {
    const response = await fetch(`https://${shop}/admin/api/2024-01/orders.json?status=any&limit=250`, {
      headers: { 'X-Shopify-Access-Token': token }
    });
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.errors || 'Failed to fetch orders');
    res.json({ ok: true, orders: data.orders });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------
// 5. EMAIL INTEGRATION (Resend)
// ---------------------------------------------------------

app.post('/api/send-invite', async (req, res) => {
  console.log("📥 Received invite email request...");
  if (!resend) {
    console.warn("⚠️ RESEND_API_KEY missing. Skipping email send.");
    return res.json({ ok: true, message: 'Skipped email because no key was found.' });
  }

  try {
    const { email, brandName, inviterName, role } = req.body;
    const inviteLink = `${APP_URL}/signup?email=${encodeURIComponent(email)}`;

    const htmlBody = `
      <div style="font-family: sans-serif; padding: 20px; color: #222;">
        <h2>You've been invited to Grainline!</h2>
        <p><strong>${inviterName || 'A teammate'}</strong> has invited you to join the <strong>${brandName}</strong> workspace as an ${role}.</p>
        <p>Grainline is a production operating system for fashion brands.</p>
        <a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; background: #211D18; color: #fff; text-decoration: none; border-radius: 8px; margin-top: 10px;">
          Join Workspace
        </a>
      </div>
    `;

    const data = await resend.emails.send({
      from: 'Grainline <onboarding@resend.dev>',
      to: email, 
      subject: `Join ${brandName} on Grainline`,
      html: htmlBody,
    });

    res.json({ ok: true, data });
  } catch (error) {
    console.error('❌ Email Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ---------------------------------------------------------
// 5. DASHBOARD AI SUGGESTIONS
// ---------------------------------------------------------
const SUGGESTION_CATEGORIES = ['readiness', 'deadline', 'vendor', 'budget', 'team', 'billing', 'design', 'general'];

app.post('/api/dashboard-suggestions', async (req, res) => {
  console.log("📥 Received dashboard suggestions request...");
  try {
    const { brand, products, upcomingDeadlines, gateFlags, aiUsage, seats } = req.body;

    const prompt = `You are a production-operations advisor for an independent clothing brand founder, reviewing their dashboard for anything worth flagging today. Be specific and reference real product names when relevant — never invent products, vendors, or numbers that weren't given to you. If the data below looks genuinely healthy with nothing urgent, say so plainly instead of inventing a concern.

Brand: ${brand?.name || 'Unknown'}, plan tier: ${brand?.plan_tier || 'free'}

Active products (name, stage, readiness %, risk, budget):
${products && products.length ? products.map(p => `- ${p.name}: ${p.stage}, ${p.readiness}% ready, ${p.risk} risk, $${p.budget || 0} budget`).join('\n') : 'None yet.'}

Products below the 80% readiness gate while in sourcing: ${gateFlags ?? 0}

Upcoming production due dates:
${upcomingDeadlines && upcomingDeadlines.length ? upcomingDeadlines.map(d => `- ${d.product}: due ${d.due_date} (${d.stage})`).join('\n') : 'None scheduled.'}

AI usage this month: ${aiUsage?.used ?? 0} / ${aiUsage?.limit ?? 0}
Team seats used: ${seats?.used ?? 0} / ${seats?.limit ?? 0}

Return a JSON object with exactly this structure:
{
  "suggestions": [
    { "category": one of ${JSON.stringify(SUGGESTION_CATEGORIES)}, "severity": "info" | "warning" | "success", "text": "specific, actionable sentence" }
  ]
}
Return 2 to 4 suggestions, ordered most important first. Use "warning" only for things that need action soon (a gate flag, a near-term deadline, hitting a plan limit); use "success" sparingly, only when something is genuinely going well and worth acknowledging; otherwise "info".`;

    const result = await callGemini(prompt);
    console.log("✅ Dashboard suggestions successful");
    res.json({ ok: true, suggestions: result.suggestions || [] });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ---------------------------------------------------------
// 6. AI DESIGN STUDIO — image generation & editing
// ---------------------------------------------------------
// One endpoint, many "modes" — every image tool (sketch-to-design, edit,
// background removal, recoloring, fabric swap, pattern generation, logo
// placement, mockup generation, flat sketch, alternate views, variants) is
// fundamentally the same call to the image model with a different prompt
// template and different reference images, so the prompt engineering lives
// here in one place rather than duplicated per tool.
const IMAGE_MODE_PROMPTS = {
  'sketch-to-design': (p) => `You are a fashion technical illustrator. Take this rough sketch and render it as a clean, professional garment design image — polished linework, realistic fabric drape and shading, on a plain white background, single garment only, no model.${p ? ` Style direction: ${p}.` : ''} Keep the same silhouette and proportions as the sketch — you're rendering it, not redesigning it.`,
  'ai-edit': (p) => `You are editing this garment design image. Apply exactly this change, keeping everything else about the garment identical: ${p || 'make a small refinement'}. Keep the same camera angle, background, and overall composition.`,
  'bg-remove': () => `Remove the background from this image completely, replacing it with a plain solid white background. Keep the garment itself pixel-identical — do not alter its color, shape, or details.`,
  'recolor': (p) => `Recolor the garment in this image to ${p || 'a different color'}, preserving all fabric texture, shading, folds, and construction details exactly as they are — only the color changes.`,
  'fabric-swap': (p) => `Change the fabric of the garment in this image to ${p || 'a different fabric'}, updating texture and drape to realistically reflect that fabric while keeping the exact same garment silhouette, cut, and design details.`,
  'pattern': (p) => `Generate a seamless, tileable textile pattern image: ${p || 'an abstract pattern'}. The image should be a flat, repeating pattern swatch suitable for printing on fabric — no garment, no background scene, just the pattern itself filling the frame.`,
  'logo-placement': (p) => `The first image is a garment design. The second image is a logo. Composite the logo onto the garment${p ? ` at this placement: ${p}` : ' in a natural, appropriately-sized placement (e.g. left chest for a top)'}, matching the garment's perspective, lighting, and fabric texture so it looks printed/embroidered on, not pasted flat.`,
  'mockup': (p) => `Create a professional product photography mockup of this garment design: ${p || 'worn by a model in a studio setting with clean, even lighting'}. Keep the garment's design, color, and details exactly as shown in the reference image.`,
  'flat-sketch': () => `Convert this garment image into a clean technical flat sketch — precise black linework on a white background, no shading or color, front view, the kind used in a professional tech pack.`,
  'view': (p) => `Generate the ${p || 'back'} view of this exact same garment — same color, fabric, and design details as the reference image, just shown from a different angle.`,
  'variant': (p) => `Create a design variation of this garment: ${p || 'a stylistic variation'}. Keep it recognizably related to the original but with this specific change applied.`,
};
const MODES_WITHOUT_IMAGE = ['pattern']; // the only mode that can run as pure text-to-image

app.post('/api/design/ai-image', async (req, res) => {
  console.log("📥 Received AI image request...");
  try {
    const { mode, prompt, images } = req.body;
    const builder = IMAGE_MODE_PROMPTS[mode];
    if (!builder) return res.status(400).json({ ok: false, error: 'Unknown AI image mode: ' + mode });
    if ((!images || images.length === 0) && !MODES_WITHOUT_IMAGE.includes(mode)) {
      return res.status(400).json({ ok: false, error: 'No reference image provided' });
    }
    const fullPrompt = builder(prompt);
    const result = await callGeminiImage(fullPrompt, images || []);
    console.log("✅ AI image successful:", mode);
    res.json({ ok: true, imageBase64: result.base64, mimeType: result.mimeType });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/design/color-palette', async (req, res) => {
  console.log("📥 Received color palette request...");
  try {
    const { imageBase64, brief } = req.body;
    if (!imageBase64 && !brief) return res.status(400).json({ ok: false, error: 'Provide a design image or a brief description' });

    const prompt = `You are a fashion colorist advising an independent clothing brand. ${imageBase64 ? 'Based on the attached garment design image,' : `Based on this brief: "${brief}",`} suggest a cohesive 5-color palette for this product or collection — think about what would actually work together in production (dye-ability, how the accent reads against the base), not just what looks nice in a swatch.

Return a JSON object with exactly this structure:
{ "palette": [ { "name": "descriptive color name", "hex": "#RRGGBB", "role": "primary" | "secondary" | "accent" | "neutral" } ] }
Exactly 5 entries: one primary, one secondary, one accent, and two neutrals.`;

    const result = await callGemini(prompt, imageBase64 || null);
    console.log("✅ Color palette successful");
    res.json({ ok: true, palette: result.palette || [] });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/design/trend-inspiration', async (req, res) => {
  console.log("📥 Received trend inspiration request...");
  try {
    const { category } = req.body;
    if (!category || !category.trim()) return res.status(400).json({ ok: false, error: 'No garment category provided' });
    if (!process.env.TAVILY_API_KEY || process.env.TAVILY_API_KEY.startsWith('get_a_free_key')) {
      return res.status(400).json({ ok: false, error: 'TAVILY_API_KEY is not set in api/.env — get a free key at tavily.com' });
    }

    const searchRes = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: `${category} fashion design trends this season silhouettes colors fabrics`,
        search_depth: 'advanced',
        max_results: 10,
      }),
    }).then(r => r.json());
    if (searchRes.error) throw new Error(searchRes.error);

    const results = searchRes.results || [];
    if (results.length === 0) {
      return res.json({ ok: true, trends: [] });
    }

    const prompt = `A fashion brand founder wants current design trend inspiration for: "${category}"

Real web search results:
${results.map((r, i) => `[${i}] ${r.title}\n${(r.content || '').slice(0, 700)}`).join('\n\n')}

Synthesize this into concrete, actionable design trend points a founder could actually use when briefing a design — silhouettes, colors, fabrics, details/trims. Don't invent trends not supported by the search results; if the results are thin, return fewer, more grounded points rather than padding it out.

Return a JSON object with exactly this structure:
{ "trends": [ { "theme": "short trend name", "detail": "1-2 sentence description of what this means for the design", "category": "silhouette" | "color" | "fabric" | "detail" } ] }
Return 3 to 6 entries.`;

    const result = await callGemini(prompt);
    console.log("✅ Trend inspiration successful");
    res.json({ ok: true, trends: result.trends || [] });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🧠 Backend running on http://localhost:${PORT}`);
});