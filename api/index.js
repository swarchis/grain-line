// api/index.js
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const { Resend } = require('resend');
const sharp = require('sharp');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { creditCost, tierCredits, getPack } = require('./config/aiCredits');

// Load the API env first, then tolerate keys placed in the Vite app env.
// Existing process env values win, so deploy/runtime secrets are left alone.
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', 'la-guia', '.env.local') });

const app = express();

// Behind Railway's proxy: trust the first hop so req.ip reflects the real
// client (from X-Forwarded-For) — required for correct per-client rate
// limiting — and stop advertising the framework.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Security headers. CSP / cross-origin isolation headers are disabled because
// this is a pure JSON API consumed cross-origin (Cloudflare Pages frontend →
// Railway API) and used for redirect-based OAuth; the rest of helmet's
// defaults (HSTS, noSniff, frameguard, referrer-policy, …) still apply.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS allowlist. Set ALLOWED_ORIGINS (comma-separated, e.g.
// "https://atelier.pages.dev,https://app.atelier.com") in the API env to lock
// this to your own frontend. Left unset it stays permissive (previous
// behavior) but logs a warning so nothing breaks before it's configured.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
if (allowedOrigins.length === 0) {
  console.warn('⚠️  ALLOWED_ORIGINS not set — CORS is open to all origins. Set it in the API env to restrict to your frontend.');
}
app.use(cors({
  origin(origin, cb) {
    // No Origin header = same-origin, curl, or server-to-server (webhooks) → allow.
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────
// Note: CORS only stops browser cross-site calls; scripts/curl ignore it.
// These limiters are the real abuse/DoS/cost protection. Webhooks are exempt
// (Stripe/Shopify send server-to-server bursts that must not be dropped).
const isWebhookOrHealth = (req) =>
  req.path === '/health' ||
  req.path === '/api/stripe/webhook' ||
  req.path.startsWith('/api/shopify/webhooks/');

// Broad limiter across the whole API — catches blunt flooding.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isWebhookOrHealth,
});

// Strict limiter for the expensive AI/generation endpoints — these each cost
// real money (Gemini/Tavily), so cap them tightly per client.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests — please slow down and try again shortly.' },
});

// Tight limiter for outbound email endpoints — abuse here means spam sent
// from your domain.
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many email requests — please wait a few minutes.' },
});

// The metered AI/generation endpoints — rate-limited, JWT-authenticated, and
// credit-charged (see requireAuth registration + metered() below).
const AI_PATHS = [
  '/api/analyze-design',
  '/api/generate-tech-pack',   // also covers /generate-tech-pack-full (prefix)
  '/api/parse-vendor',
  '/api/draft-vendor-email',
  '/api/search-vendors',
  '/api/analyze-vendor-fit',
  '/api/dashboard-suggestions',
  '/api/design/ai-image',
  '/api/design/generate-element',
  '/api/design/color-palette',
  '/api/design/trend-inspiration',
  '/api/chat-reply',
  '/api/quote-economics',
  '/api/cost-simulator',
];

app.use(apiLimiter);
app.use(AI_PATHS, aiLimiter);
app.use(['/api/send-invite', '/api/send-campaign'], emailLimiter);

// Captures the raw buffer body. Required to verify Shopify's SHA-256 HMAC signatures
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// ── Auth + AI credit metering ────────────────────────────────────────────────
// requireAuth validates the caller's Supabase JWT (sent as `Authorization:
// Bearer <token>` by the frontend) and attaches req.user. metered() then checks
// the user actually belongs to the brand and atomically debits its credit
// balance before the handler runs, auto-refunding if the handler errors out.

async function requireAuth(req, res, next) {
  if (!supabase) return res.status(500).json({ ok: false, error: 'Auth is not configured on the server.' });
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Sign in required.' });
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data || !data.user) return res.status(401).json({ ok: false, error: 'Your session has expired — please sign in again.' });
    req.user = data.user;
    return next();
  } catch (err) {
    console.error('Auth check failed:', err.message);
    return res.status(401).json({ ok: false, error: 'Could not verify your session.' });
  }
}

// Owner of, or active member of, the brand?
async function verifyBrandAccess(userId, brandId) {
  if (!supabase || !userId || !brandId) return false;
  const { data: owned } = await supabase
    .from('brands').select('id').eq('id', brandId).eq('user_id', userId).maybeSingle();
  if (owned) return true;
  const { data: member } = await supabase
    .from('brand_members').select('brand_id')
    .eq('brand_id', brandId).eq('user_id', userId).eq('status', 'active').maybeSingle();
  return !!member;
}

async function debitCredits(brandId, cost, feature) {
  const { data, error } = await supabase.rpc('debit_ai_credits', { p_brand_id: brandId, p_cost: cost, p_feature: feature });
  if (error) throw error;
  return typeof data === 'number' ? data : -1;
}

async function refundCredits(brandId, amount, feature) {
  const { error } = await supabase.rpc('refund_ai_credits', { p_brand_id: brandId, p_amount: amount, p_feature: feature });
  if (error) console.error('Credit refund failed:', error.message);
}

// Per-route middleware: verify brand access, atomically charge the feature's
// credit cost, and schedule an auto-refund if the response ends in an error.
function metered(feature) {
  return async (req, res, next) => {
    const brandId = (req.body && (req.body.brandId || req.body.brand_id)) || null;
    if (!brandId) return res.status(400).json({ ok: false, error: 'brandId is required for AI features.' });
    const access = await verifyBrandAccess(req.user && req.user.id, brandId);
    if (!access) return res.status(403).json({ ok: false, error: 'You do not have access to this brand.' });

    const cost = creditCost(feature);
    let remaining;
    try {
      remaining = await debitCredits(brandId, cost, feature);
    } catch (err) {
      console.error('Credit debit error:', err.message);
      return res.status(500).json({ ok: false, error: 'Credit system error — please try again.' });
    }
    if (remaining < 0) {
      return res.status(402).json({ ok: false, error: 'Out of AI credits.', code: 'INSUFFICIENT_CREDITS' });
    }
    // If the handler ends up erroring (>=400), give the credits back.
    res.on('finish', () => {
      if (res.statusCode >= 400) {
        refundCredits(brandId, cost, feature).catch((e) => console.error('Refund error:', e.message));
      }
    });
    req.aiCredits = { brandId, cost, remaining };
    return next();
  };
}

// Every metered AI endpoint requires a valid signed-in user. Always registered
// (fail closed): if auth isn't configured, requireAuth returns a clear 500
// rather than letting requests through unauthenticated.
app.use(AI_PATHS, requireAuth);

const MODEL_NAME = "gemini-flash-lite-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

function cleanAIJSON(text) {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}

function verifyShopifySignature(rawBody, hmacHeader) {
  if (!rawBody || !hmacHeader) return false;
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_CLIENT_SECRET)
    .update(rawBody)
    .digest('base64');
  return hash === hmacHeader;
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

// Pixazo's gateway to Stable Diffusion — used only for text-to-image
// generation of a standalone new element (a logo, an icon, a pattern swatch)
// with nothing to composite against, which is all its SD models can do
// (no image-input parameter exists on SD 3.5/3.0/XL/XL-Lightning — only
// their separate mask-based Inpainting endpoint takes an image, and that's
// not what "generate a new isolated graphic" needs). Use base SDXL here:
// Pixazo currently rejects the Lightning route for this account with an
// insufficient-balance 403, while base SDXL succeeds with the same key.
const PIXAZO_SDXL_URL = 'https://gateway.pixazo.ai/getImage/v1/getSDXLImage';

async function callPixazoElement(prompt, extraNegative = '') {
  if (!process.env.PIXAZO_API_KEY) {
    throw new Error('PIXAZO_API_KEY is not set in api/.env — get one at api-console.pixazo.ai.');
  }
  const fullPrompt = `${prompt}. Flat graphic/icon style, centered, isolated on a plain solid white background, no shadow, no scene, no mockup, no photo — just the graphic itself.`;

  const response = await fetch(PIXAZO_SDXL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Ocp-Apim-Subscription-Key': process.env.PIXAZO_API_KEY },
    body: JSON.stringify({
      prompt: fullPrompt,
      negativePrompt: `photo, photorealistic, background scene, shadow, gradient background, texture background, watermark, text, frame, border${extraNegative ? ', ' + extraNegative : ''}`,
      height: 1024,
      width: 1024,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("❌ Pixazo API Error:", JSON.stringify(data, null, 2));
    throw new Error(data.error?.message || data.message || `Pixazo Error: ${response.status}`);
  }
  const imageUrl = data.imageUrl || data.output || data.url;
  if (!imageUrl) throw new Error('Pixazo did not return an image URL.');

  // Fetch the generated PNG/WebP and punch the near-white background out to
  // real alpha transparency — SD has no native transparency output, so a
  // solid white background (per the prompt above) is the practical way to
  // get something that behaves like a layer instead of a flat rectangle
  // when it's added to the canvas.
  const imgRes = await fetch(imageUrl);
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  const { data: pixels, info } = await sharp(imgBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  floodFillTransparentBackground(pixels, info.width, info.height);
  const pngBuffer = await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return { base64: pngBuffer.toString('base64'), mimeType: 'image/png' };
}

// A flat per-pixel "near-white → transparent" threshold (the first attempt
// at this) punches out ANY light pixel in the image, including enclosed
// white regions that are actually part of the subject — a shoe's light
// leather panels, a logo's white negative space, a sketch's unshaded
// highlights. Flood-filling from the image border instead only removes
// background that's actually connected to the edge, leaving anything
// enclosed by darker linework untouched.
//
// A *fixed* whiteness cutoff still isn't enough on its own, though — Pixazo's
// SD backend frequently ignores "plain white background" and returns a
// light-gray one instead (seen as low as rgb(226,228,227), comfortably
// below a naive >240 cutoff), which left the entire image opaque: a solid
// pale rectangle with the real artwork lost inside it, not a transparent
// layer. Sampling the actual border color per-generation and flood-filling
// by color distance from THAT, rather than assuming pure white, adapts to
// whatever background shade this particular generation actually came back
// with.
function floodFillTransparentBackground(pixels, width, height, tolerance = 28) {
  let rSum = 0, gSum = 0, bSum = 0, n = 0;
  const sampleBorder = (x, y) => {
    const i = (y * width + x) * 4;
    rSum += pixels[i]; gSum += pixels[i + 1]; bSum += pixels[i + 2]; n++;
  };
  for (let x = 0; x < width; x += 4) { sampleBorder(x, 0); sampleBorder(x, height - 1); }
  for (let y = 0; y < height; y += 4) { sampleBorder(0, y); sampleBorder(width - 1, y); }
  const bgR = rSum / n, bgG = gSum / n, bgB = bSum / n;

  const isBackgroundColor = (pixelIdx) => {
    const i = pixelIdx * 4;
    const dr = pixels[i] - bgR, dg = pixels[i + 1] - bgG, db = pixels[i + 2] - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db) < tolerance;
  };

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let qHead = 0, qTail = 0;

  const seed = (x, y) => {
    const p = y * width + x;
    if (visited[p] || !isBackgroundColor(p)) return;
    visited[p] = 1;
    queue[qTail++] = p;
  };

  for (let x = 0; x < width; x++) { seed(x, 0); seed(x, height - 1); }
  for (let y = 0; y < height; y++) { seed(0, y); seed(width - 1, y); }

  while (qHead < qTail) {
    const p = queue[qHead++];
    const x = p % width;
    const y = (p - x) / width;
    pixels[p * 4 + 3] = 0;

    if (x + 1 < width) seed(x + 1, y);
    if (x - 1 >= 0) seed(x - 1, y);
    if (y + 1 < height) seed(x, y + 1);
    if (y - 1 >= 0) seed(x, y - 1);
  }
}

// ---------------------------------------------------------
// 1. DESIGN & TECH PACK ENDPOINTS
// ---------------------------------------------------------

app.post('/api/analyze-design', metered('analyze-design'), async (req, res) => {
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

app.post('/api/generate-tech-pack', metered('generate-tech-pack'), async (req, res) => {
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

// Full tech pack generation — takes whatever the founder filled in on the
// intake questionnaire (any field can be blank) plus an optional canvas
// image, and asks Gemini to produce a complete, industry-standard tech pack:
// fills gaps sensibly from the garment category/image, but never overwrites
// anything the founder actually typed. The frontend always shows an
// accuracy warning on AI-filled fields regardless of how confident this
// prompt sounds — there's no way to verify factory-specific details (exact
// supplier names, real cost data) without a human who actually knows them.
app.post('/api/generate-tech-pack-full', metered('generate-tech-pack-full'), async (req, res) => {
  console.log("📥 Received full tech pack generation request...");
  try {
    const { imageBase64, category, answers } = req.body;
    const a = answers || {};

    const prompt = `You are an expert fashion technical designer producing a complete tech pack for a garment: "${category || 'garment'}".

The founder answered an intake questionnaire — anything they left blank, fill in with a sensible industry-standard default for this garment type; anything they filled in, use exactly as given (don't contradict it). Their answers:
${JSON.stringify(a, null, 2)}
${a.other ? `\nThe founder specifically asked for this to be included/handled: "${a.other}" — make sure it's reflected somewhere in the output (as a BOM line, a construction note, a print placement, etc., whichever section fits).` : ''}

Return a JSON object with exactly this structure (every array can be empty if genuinely not applicable, but prefer a reasonable default over leaving something empty):
{
  "bom": [ { "id": "bom-1", "material": "string", "supplier": "string", "qtyPerUnit": "string", "unitCost": "string" } ],
  "measurements": [ { "id": "meas-1", "size": "S", "chest": "string", "length": "string", "sleeve": "string" } ],
  "construction": [ { "id": "con-1", "section": "e.g. Side seam", "stitchType": "e.g. 5-thread overlock", "notes": "string" } ],
  "printPlacements": [ { "id": "pp-1", "name": "e.g. Chest logo", "placement": "e.g. 3in below collar, centered", "size": "e.g. 4in x 4in", "technique": "e.g. screen print", "notes": "string" } ],
  "trims": [ { "id": "trim-1", "name": "e.g. YKK zipper", "supplier": "string", "quantity": "string", "unitCost": "string", "notes": "string" } ],
  "labels": [ { "id": "label-1", "type": "e.g. Main label, Care label, Size label", "placement": "string", "content": "string" } ],
  "packaging": [ { "id": "pack-1", "item": "e.g. Poly bag", "spec": "string", "notes": "string" } ],
  "materialUsage": [ { "id": "mu-1", "material": "string", "consumptionPerUnit": "string", "unit": "e.g. yards", "wastagePercent": "string" } ],
  "manufacturingNotes": "string — general instructions to the factory",
  "complianceNotes": "string — certifications, safety, labeling regulations relevant to this garment/market"
}`;

    const techPackData = await callGemini(prompt, imageBase64 || null);
    console.log("✅ Full tech pack generation successful");
    res.json({ ok: true, techPackData });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});


// ---------------------------------------------------------
// 2. VENDOR SOURCING & OUTREACH ENDPOINTS
// ---------------------------------------------------------

app.post('/api/parse-vendor', metered('parse-vendor'), async (req, res) => {
  console.log("📥 Received vendor parse request...");
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ ok: false, error: 'No text provided' });

    const prompt = `You are helping a fashion brand founder import a vendor into their sourcing tool.
They pasted the following link, forwarded email, or notes about a manufacturer/vendor:
"""
${text}
"""
Extract whatever you can reasonably infer. Do not invent specifics you can't support from the text (leave a field as an empty string, null, or an empty array instead of guessing).
Return a JSON object with exactly this structure:
{
  "name": "string",
  "category": "string (e.g. Denim, Knitwear, Outerwear, Headwear, Bags)",
  "location": "string (city, country if known)",
  "specialties": ["short phrase", "short phrase"],
  "moq": <number or null>,
  "leadTime": "string or null (e.g. '45 days')",
  "certifications": ["string, e.g. GOTS, OEKO-TEX, WRAP, Fair Trade — only ones actually mentioned"],
  "capabilities": ["short phrase, e.g. in-house printing, small-batch sampling, cut-and-sew, dyeing"],
  "priceRange": "string or null (e.g. '$8-$12/unit FOB') — only if a price is actually mentioned, never estimated"
}`;

    const parsed = await callGemini(prompt);
    console.log("✅ Vendor parse successful");
    res.json({ ok: true, vendor: parsed });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/draft-vendor-email', metered('draft-vendor-email'), async (req, res) => {
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

app.post('/api/search-vendors', metered('search-vendors'), async (req, res) => {
  console.log("📥 Received vendor search request...");
  try {
    const { keywords, category, location, quantity, moq, targetPrice, certifications, imageBase64 } = req.body;
    const criteria = { keywords, category, location, quantity, moq, targetPrice, certifications };
    if (!Object.values(criteria).some(v => v != null && String(v).trim())) {
      return res.status(400).json({ ok: false, error: 'Give at least one search field — keywords, category, or location.' });
    }
    if (!process.env.TAVILY_API_KEY || process.env.TAVILY_API_KEY.startsWith('get_a_free_key')) {
      return res.status(400).json({ ok: false, error: 'TAVILY_API_KEY is not set in api/.env — get a free key at tavily.com' });
    }

    // Build a sharper query from structured fields instead of trusting one
    // free-text box to carry material + MOQ + price + location on its own —
    // each constraint gets folded in explicitly so Tavily sees it clearly.
    const coreParts = [keywords, category].filter(v => v && String(v).trim());
    const tightParts = [...coreParts, 'manufacturer'];
    if (location) tightParts.push(`in ${location}`);
    if (moq) tightParts.push(`MOQ under ${moq} units`);
    if (targetPrice) tightParts.push(`target price $${targetPrice}/unit`);
    if (certifications) tightParts.push(`${certifications} certified`);
    const tightQuery = tightParts.join(' ');
    const broadQuery = [...coreParts, 'manufacturer', location].filter(Boolean).join(' ') || tightQuery;

    const MFG_BIAS = 'private label OR white label OR OEM ODM OR contract manufacturer OR wholesale factory -shop -"our collection"';
    const [tightRes, broadRes] = await Promise.all([
      fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: `${tightQuery} ${MFG_BIAS}`,
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

    const criteriaLines = [
      keywords && `Material/style keywords: ${keywords}`,
      category && `Category: ${category}`,
      location && `Preferred location: ${location}`,
      quantity && `Quantity needed: ${quantity} units`,
      moq && `Max acceptable MOQ: ${moq} units`,
      targetPrice && `Target unit price: $${targetPrice}`,
      certifications && `Certifications wanted: ${certifications}`,
    ].filter(Boolean).join('\n');

    const prompt = `A fashion brand founder searched for a MANUFACTURER with this request:
${criteriaLines}
${imageBase64 ? '\nAn image of the founder\'s own product design is attached — use it only to judge what garment category, fabric weight, and construction complexity this vendor would need to handle (does their stated specialty plausibly cover it?). The image shows the FOUNDER\'S product, not anything belonging to the vendor — never attribute the image itself to a vendor.' : ''}

Here are real web search results (some from a tightly-matched search, some from a broader category search, mixed together):
${results.map((r, i) => `[${i}] ${r.title}\nURL: ${r.url}\n${(r.content || '').slice(0, 900)}`).join('\n\n')}

CRITICAL FILTER — apply this before anything else:
The founder needs a company that will MANUFACTURE GARMENTS FOR THEM based on a design/tech pack they send in — private label, white label, OEM/ODM, contract manufacturing, cut-make-trim, "start your own clothing line" production partners.
EXCLUDE any company that is itself a clothing BRAND selling finished products under its own name directly to end consumers — even if it mentions organic cotton, sustainable materials, or "manufactured ethically." A brand talking about how ITS OWN products are made is not a match.
Signals a result IS a manufacturer-for-hire (include): "private label," "white label," "wholesale," "MOQ for your brand," "start your clothing line," "we manufacture for brands," "contract manufacturing," "OEM/ODM," "sample and bulk production," "sourcing agent," "factory partner," pricing/MOQ framed around a business customer.
Signals a result is a retail BRAND instead (exclude): online shop / storefront language, "shop now," "add to cart," "our collection," a founder's personal story about their own product line, sizing charts for individual customers, no mention of producing for other businesses.
If you are not reasonably confident a result is a manufacturer-for-hire rather than a retail brand, LEAVE IT OUT — do not guess, and do not include it "just in case." Precision matters more than volume here.

After applying that filter, split what's left into two groups:
- "recommended": manufacturers that match essentially everything specific the founder gave above (location, MOQ, target price, certifications, category — whichever fields were actually filled in).
- "broader": manufacturers that match the general category but miss one or more of the specific fields the founder filled in — still include these, don't drop them, since "recommended" can be wrong and the founder should see other real options.
If the founder only gave vague/generic fields, most results likely belong in "broader" since there's nothing specific to fully match yet.
It's completely fine for a group to be empty if nothing qualifies — an empty list beats a wrong one.

For each manufacturer, figure out the source carefully:
- If the result IS the manufacturer's own website/page (domain matches the company, or it's their official site/contact page), set "sourceType": "vendor" and "sourceUrl" to that link.
- If the result is actually a THIRD PARTY talking about the manufacturer (an Instagram account that reviews manufacturers, a blog post, a directory listing, a marketplace aggregator page) rather than their own presence, set "sourceType": "review". If the snippet text itself mentions the manufacturer's own website, email, or handle, put THAT as "sourceUrl" and put the original review/mention link as "reviewUrl". If no direct link can be found anywhere, "sourceUrl" should be the review link itself (still set "sourceType": "review").

Also extract, if the text supports it (leave null/empty/empty-array rather than guessing):
- specialties: short phrases describing what they specialize in (materials, garment types, techniques)
- moq: minimum order quantity as a number
- leadTime: e.g. "45 days"
- certifications: e.g. GOTS, OEKO-TEX, WRAP, Fair Trade, ISO — only ones actually named in the text
- capabilities: short phrases on factory capabilities, e.g. "in-house printing", "small-batch sampling", "cut-and-sew", "dyeing", "embroidery"
- priceRange: a string like "$8-$12/unit" ONLY if the text actually states a price — never estimate one

Do not invent details not supported by the text. Return a JSON object with exactly this structure:
{
  "recommended": [
    { "name": "string", "category": "string", "location": "string or empty", "description": "one sentence on why this matches", "sourceUrl": "string", "sourceType": "vendor" | "review", "reviewUrl": "string or null", "specialties": ["string"], "moq": <number or null>, "leadTime": "string or null", "certifications": ["string"], "capabilities": ["string"], "priceRange": "string or null" }
  ],
  "broader": [ same shape as above ]
}`;

    const parsed = await callGemini(prompt, imageBase64 || null);

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

app.post('/api/analyze-vendor-fit', metered('analyze-vendor-fit'), async (req, res) => {
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

// One-time credit-pack purchase (Phase 2 top-ups). The price is looked up
// server-side by pack id — never taken from the client — and the credit amount
// is stamped into metadata so the checkout.session.completed webhook can grant
// it on successful payment.
app.post('/api/create-topup-session', requireAuth, async (req, res) => {
  if (!requireStripe(res)) return;
  try {
    const { packId, brandId, brandEmail } = req.body;
    if (!brandId) return res.status(400).json({ ok: false, error: 'No brand provided' });
    const access = await verifyBrandAccess(req.user && req.user.id, brandId);
    if (!access) return res.status(403).json({ ok: false, error: 'You do not have access to this brand.' });
    const pack = getPack(packId);
    if (!pack) return res.status(400).json({ ok: false, error: `Unknown credit pack: ${packId}` });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: pack.cents,
          product_data: { name: `Atelier AI credits — ${pack.label}` },
        },
      }],
      customer_email: brandEmail || undefined,
      client_reference_id: brandId,
      metadata: { brandId, credits: String(pack.credits), packId: pack.id, kind: 'ai_topup' },
      success_url: `${APP_URL}/settings?topup=success`,
      cancel_url: `${APP_URL}/settings?topup=cancelled`,
    });
    res.json({ ok: true, url: session.url });
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
// OAUTH HANDOFF HELPER — shared by every platform integration below
// (Shopify, WooCommerce validation, Etsy, Instagram, TikTok, YouTube,
// Pinterest). Two problems with a plain redirect-based OAuth flow:
//   1. `state` was just the raw brandId — anyone could construct a
//      callback URL themselves and satisfy the frontend's post-hoc check.
//      Signing it closes that CSRF gap without needing server-side session
//      storage.
//   2. The access token used to travel in the browser's URL bar (visible
//      in history, referrer headers, server logs) on its way back to the
//      frontend, which is the only thing with an RLS-scoped Supabase
//      client able to persist it (this backend has no DB access itself —
//      see the architecture note above). A short-lived, single-use code
//      swap keeps that handoff out of the URL/history entirely.
// ---------------------------------------------------------
const oauthHandoffStore = new Map(); // code -> { payload, expiresAt }
const OAUTH_HANDOFF_TTL_MS = 2 * 60 * 1000;

function signOAuthState(brandId) {
  const nonce = crypto.randomBytes(12).toString('hex');
  const payload = `${brandId}.${nonce}`;
  const secret = process.env.OAUTH_STATE_SECRET || 'dev-only-insecure-oauth-state-secret';
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyOAuthState(state) {
  if (!state) return null;
  const parts = state.split('.');
  if (parts.length !== 3) return null;
  const [brandId, nonce, sig] = parts;
  const secret = process.env.OAUTH_STATE_SECRET || 'dev-only-insecure-oauth-state-secret';
  const expected = crypto.createHmac('sha256', secret).update(`${brandId}.${nonce}`).digest('hex');
  const sigBuf = Buffer.from(sig || '', 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  return brandId;
}

function createOAuthHandoff(payload) {
  const code = crypto.randomBytes(20).toString('hex');
  oauthHandoffStore.set(code, { payload, expiresAt: Date.now() + OAUTH_HANDOFF_TTL_MS });
  return code;
}

app.get('/api/oauth/consume', (req, res) => {
  const { code } = req.query;
  const entry = code && oauthHandoffStore.get(code);
  oauthHandoffStore.delete(code); // single-use regardless of outcome
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(410).json({ ok: false, error: 'This connection link has expired or was already used — try connecting again.' });
  }
  res.json({ ok: true, ...entry.payload });
});

app.post('/api/stripe/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    console.warn("⚠️ STRIPE_WEBHOOK_SECRET missing in .env");
    return res.status(400).send('Webhook secret missing');
  }

  let event;
  try {
    // Stripe requires the raw, unparsed body buffer to cryptographically verify the signature
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('❌ Stripe Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle subscription cancellation
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const customerId = subscription.customer;

    if (supabase) {
      try {
        const { error } = await supabase
          .from('brands')
          .update({ plan_tier: 'free' })
          .eq('stripe_customer_id', customerId);
          
        if (error) throw error;
        // Zero the AI credit grant for the brand(s) on this customer.
        const { data: brands } = await supabase.from('brands').select('id').eq('stripe_customer_id', customerId);
        for (const b of brands || []) {
          await supabase.rpc('grant_subscription_credits', { p_brand_id: b.id, p_amount: 0, p_reset_at: null });
        }
        console.log(`✅ Automatically downgraded canceled Stripe customer ${customerId} to Free plan.`);
      } catch (err) {
        console.error("❌ Failed to downgrade brand in Supabase:", err.message);
        return res.status(500).send('Database error');
      }
    }
  }

  // One-time credit-pack purchase completed → add topup credits. Idempotent:
  // top-ups ADD (unlike grants which SET), so guard against Stripe retries by
  // checking the ledger for this session id before crediting.
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (supabase && session.mode === 'payment' && session.payment_status === 'paid'
        && session.metadata && session.metadata.kind === 'ai_topup') {
      const brandId = session.metadata.brandId;
      const credits = parseInt(session.metadata.credits, 10);
      if (brandId && credits > 0) {
        try {
          const { data: seen } = await supabase.from('ai_credit_ledger')
            .select('id').eq('stripe_ref', session.id).eq('type', 'topup').maybeSingle();
          if (!seen) {
            await supabase.rpc('add_topup_credits', { p_brand_id: brandId, p_amount: credits, p_stripe_ref: session.id });
            console.log(`✅ Added ${credits} top-up credits to brand ${brandId} (${session.id}).`);
          }
        } catch (err) {
          console.error('❌ Failed to add top-up credits:', err.message);
          return res.status(500).send('Top-up credit error');
        }
      }
    }
  }

  // Subscription paid (initial + every renewal) → grant that cycle's AI credits.
  // Uses SET semantics (grant_subscription_credits), so Stripe retries are
  // idempotent — the balance is set to the tier allowance, never stacked.
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object;
    const customerId = invoice.customer;
    const line = (invoice.lines && invoice.lines.data && invoice.lines.data[0]) || null;
    const priceId = line && line.price ? line.price.id : null;
    const tier = priceId ? (Object.entries(PRICE_IDS).find(([, id]) => id === priceId) || [])[0] : null;

    if (supabase && customerId && tier) {
      try {
        const amount = tierCredits(tier);
        // Period end from the invoice line (unix seconds) → the next reset.
        const periodEnd = line && line.period && line.period.end
          ? new Date(line.period.end * 1000).toISOString()
          : null;
        const { data: brands } = await supabase.from('brands').select('id').eq('stripe_customer_id', customerId);
        for (const b of brands || []) {
          await supabase.rpc('grant_subscription_credits', { p_brand_id: b.id, p_amount: amount, p_reset_at: periodEnd });
        }
        console.log(`✅ Granted ${amount} AI credits (${tier}) to Stripe customer ${customerId}.`);
      } catch (err) {
        console.error('❌ Failed to grant AI credits:', err.message);
        return res.status(500).send('Credit grant error');
      }
    }
  }

  res.status(200).json({ received: true });
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
  const state = signOAuthState(brandId);
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_CLIENT_ID}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;

  res.redirect(installUrl);
});

app.get('/api/shopify/callback', async (req, res) => {
  const { shop, code, state } = req.query;
  const brandId = verifyOAuthState(state);
  if (!shop || !code || !brandId) return res.status(400).send('Missing or invalid parameters');

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

    const handoffCode = createOAuthHandoff({ platform: 'shopify', shop, accessToken: data.access_token, brandId });
    res.redirect(`${APP_URL}/sales?shopify_success=true&handoff=${handoffCode}&brandId=${brandId}`);
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

// Mandatory Shopify App Uninstalled Webhook
app.post('/api/shopify/webhooks/app_uninstalled', async (req, res) => {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const shopDomain = req.headers['x-shopify-shop-domain'];

  console.log(`📥 Received Shopify Uninstall Webhook for ${shopDomain}`);

  // 1. Verify the signature is genuinely from Shopify
  if (!verifyShopifySignature(req.rawBody, hmacHeader)) {
    console.warn("⚠️ Unauthorized Shopify Webhook Attempt");
    return res.status(401).send('Unauthorized');
  }

  if (!supabase) {
    console.error("❌ Supabase client not initialized on backend.");
    return res.status(500).send('Database connection error');
  }

  try {
    // 2. Locate the existing connection
    const { data: conn, error: findError } = await supabase
      .from('store_connections')
      .select('id')
      .eq('shop_domain', shopDomain)
      .eq('platform', 'shopify')
      .maybeSingle();

    if (findError) throw findError;

    if (conn) {
      // 3. Delete the connection (Cascades automatically to sales_data)
      const { error: deleteError } = await supabase
        .from('store_connections')
        .delete()
        .eq('id', conn.id);

      if (deleteError) throw deleteError;
      console.log(`✅ Successfully disconnected Shopify store: ${shopDomain}`);
    } else {
      console.log(`ℹ️ No connection found for store: ${shopDomain}`);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error("❌ Failed to process uninstall webhook:", err.message);
    res.status(500).send('Internal Server Error');
  }
});

// Read-only stock levels, for the Analytics Inventory tab's "what your
// storefront reports" comparison — already covered by the existing
// read_products scope, no reconnect needed. Not the same as the README's
// long-standing "no inventory endpoint" note, which was about a live
// write-back sync; this only reads.
app.post('/api/shopify/fetch-inventory', async (req, res) => {
  const { shop, token } = req.body;
  if (!shop || !token) return res.status(400).json({ ok: false, error: 'Missing shop or token' });
  try {
    const response = await fetch(`https://${shop}/admin/api/2024-01/products.json?limit=250`, {
      headers: { 'X-Shopify-Access-Token': token }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.errors || 'Failed to fetch products');
    const products = (data.products || []).flatMap(p => (p.variants || []).map(v => ({ sku: v.sku, stock_quantity: v.inventory_quantity })));
    res.json({ ok: true, products });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------
// 4B. WOOCOMMERCE INTEGRATION
// ---------------------------------------------------------
// WooCommerce's REST API is plain Basic Auth over HTTPS with a Consumer
// Key/Secret the founder generates themselves in wp-admin (WooCommerce >
// Settings > Advanced > REST API) — no OAuth app, no platform review,
// unlike every other integration in this batch. This validates those
// credentials with a real call before the frontend persists them.

function wooAuthHeader(consumerKey, consumerSecret) {
  return 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
}

function normalizeStoreUrl(url) {
  return url.replace(/\/+$/, '');
}

app.post('/api/woocommerce/validate', async (req, res) => {
  const { storeUrl, consumerKey, consumerSecret } = req.body;
  if (!storeUrl || !consumerKey || !consumerSecret) return res.status(400).json({ ok: false, error: 'Missing store URL or credentials' });
  try {
    const base = normalizeStoreUrl(storeUrl);
    const response = await fetch(`${base}/wp-json/wc/v3/system_status`, {
      headers: { Authorization: wooAuthHeader(consumerKey, consumerSecret) }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(response.status === 401 ? 'Invalid Consumer Key/Secret' : `Store responded with ${response.status}: ${text.slice(0, 200)}`);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/woocommerce/fetch-orders', async (req, res) => {
  const { storeUrl, consumerKey, consumerSecret } = req.body;
  if (!storeUrl || !consumerKey || !consumerSecret) return res.status(400).json({ ok: false, error: 'Missing store URL or credentials' });
  try {
    const base = normalizeStoreUrl(storeUrl);
    const response = await fetch(`${base}/wp-json/wc/v3/orders?per_page=100&status=any`, {
      headers: { Authorization: wooAuthHeader(consumerKey, consumerSecret) }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to fetch orders');
    res.json({ ok: true, orders: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/woocommerce/fetch-inventory', async (req, res) => {
  const { storeUrl, consumerKey, consumerSecret } = req.body;
  if (!storeUrl || !consumerKey || !consumerSecret) return res.status(400).json({ ok: false, error: 'Missing store URL or credentials' });
  try {
    const base = normalizeStoreUrl(storeUrl);
    const response = await fetch(`${base}/wp-json/wc/v3/products?per_page=100`, {
      headers: { Authorization: wooAuthHeader(consumerKey, consumerSecret) }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to fetch products');
    res.json({ ok: true, products: (data || []).map(p => ({ sku: p.sku, stock_quantity: p.stock_quantity })) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Creates a real, live product on the connected store — only ever called
// after the founder has explicitly confirmed a preview in the UI, never
// automatically. Requires the connected Consumer Key to actually have
// write access (WooCommerce keys are read-only by default).
app.post('/api/woocommerce/publish-product', async (req, res) => {
  const { storeUrl, consumerKey, consumerSecret, name, description, price, sku, imageUrl } = req.body;
  if (!storeUrl || !consumerKey || !consumerSecret || !name || !price) return res.status(400).json({ ok: false, error: 'Missing required fields' });
  try {
    const base = normalizeStoreUrl(storeUrl);
    const response = await fetch(`${base}/wp-json/wc/v3/products`, {
      method: 'POST',
      headers: { Authorization: wooAuthHeader(consumerKey, consumerSecret), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, type: 'simple', regular_price: String(price), description: description || '', sku: sku || undefined,
        images: imageUrl ? [{ src: imageUrl }] : undefined,
        status: 'draft', // safer default — the founder reviews and publishes live in WooCommerce themselves
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to create product');
    res.json({ ok: true, externalId: String(data.id), externalUrl: data.permalink });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------
// 4C. ETSY INTEGRATION
// ---------------------------------------------------------
// Etsy Open API v3 requires OAuth 2.0 with PKCE (mandatory, not optional
// like most providers) — the client generates a random code_verifier,
// sends its SHA-256 hash (code_challenge) with the auth request, then
// proves it knew the original by sending code_verifier back at token
// exchange. PKCE verifiers are short-lived and single-use per attempt, so
// they're kept in the same in-memory pattern as the OAuth handoff store
// above (this backend has no database of its own).
const etsyPkceStore = new Map(); // state -> { verifier, expiresAt }
const PKCE_TTL_MS = 10 * 60 * 1000; // Etsy's own consent screen can take a few minutes

function base64url(buffer) {
  return buffer.toString('base64url');
}

app.get('/api/etsy/auth', (req, res) => {
  const { brandId } = req.query;
  if (!brandId) return res.status(400).send('Missing brandId');
  if (!process.env.ETSY_KEYSTRING) return res.status(400).send('ETSY_KEYSTRING is missing from api/.env.');

  const state = signOAuthState(brandId);
  const verifier = base64url(crypto.randomBytes(32));
  etsyPkceStore.set(state, { verifier, expiresAt: Date.now() + PKCE_TTL_MS });
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());

  const redirectUri = `${API_URL}/api/etsy/callback`;
  const scopes = 'transactions_r listings_r listings_w shops_r'; // listings_w: needed for Product Publishing
  const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&client_id=${process.env.ETSY_KEYSTRING}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
  res.redirect(authUrl);
});

app.get('/api/etsy/callback', async (req, res) => {
  const { code, state } = req.query;
  const brandId = verifyOAuthState(state);
  const pkce = state && etsyPkceStore.get(state);
  etsyPkceStore.delete(state);

  if (!code || !brandId || !pkce || pkce.expiresAt < Date.now()) {
    return res.redirect(`${APP_URL}/sales?etsy_error=true`);
  }

  try {
    const redirectUri = `${API_URL}/api/etsy/callback`;
    const tokenRes = await fetch('https://api.etsy.com/v3/public/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.ETSY_KEYSTRING,
        redirect_uri: redirectUri,
        code,
        code_verifier: pkce.verifier,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Failed to get token');

    // Etsy access tokens are formatted "{numeric_user_id}.{token}" — the
    // user id is needed to look up which shop they own.
    const userId = tokenData.access_token.split('.')[0];
    const shopsRes = await fetch(`https://openapi.etsy.com/v3/application/users/${userId}/shops`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'x-api-key': process.env.ETSY_KEYSTRING },
    });
    const shopsData = await shopsRes.json();
    if (!shopsRes.ok || !shopsData.shop_id) throw new Error('Could not find an Etsy shop for this account');

    const handoffCode = createOAuthHandoff({
      platform: 'etsy',
      shopId: String(shopsData.shop_id),
      shopName: shopsData.shop_name,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      brandId,
    });
    res.redirect(`${APP_URL}/sales?etsy_success=true&handoff=${handoffCode}&brandId=${brandId}`);
  } catch (err) {
    console.error('Etsy OAuth Error:', err);
    res.redirect(`${APP_URL}/sales?etsy_error=true`);
  }
});

app.post('/api/etsy/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ ok: false, error: 'Missing refresh token' });
  try {
    const tokenRes = await fetch('https://api.etsy.com/v3/public/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', client_id: process.env.ETSY_KEYSTRING, refresh_token: refreshToken }),
    });
    const data = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(data.error_description || 'Failed to refresh token');
    res.json({ ok: true, accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Etsy prices come back as Money objects ({amount, divisor, currency_code}
// — real value is amount/divisor) and each receipt's line items live in
// a nested `transactions` array — normalized here, server-side, so the
// frontend adapter gets the same flat { created_at, total_price,
// line_items } shape every other platform already produces.
function etsyMoney(m) {
  return m ? m.amount / m.divisor : 0;
}

app.post('/api/etsy/fetch-orders', async (req, res) => {
  const { shopId, accessToken } = req.body;
  if (!shopId || !accessToken) return res.status(400).json({ ok: false, error: 'Missing shopId or accessToken' });
  try {
    const response = await fetch(`https://openapi.etsy.com/v3/application/shops/${shopId}/receipts?limit=100`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'x-api-key': process.env.ETSY_KEYSTRING },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to fetch receipts');
    const receipts = (data.results || []).map(r => ({
      created_at: new Date(r.created_timestamp * 1000).toISOString(),
      total_price: etsyMoney(r.grandtotal),
      line_items: (r.transactions || []).map(t => ({ sku: t.sku, price: etsyMoney(t.price), quantity: t.quantity })),
    }));
    res.json({ ok: true, receipts });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/etsy/fetch-inventory', async (req, res) => {
  const { shopId, accessToken } = req.body;
  if (!shopId || !accessToken) return res.status(400).json({ ok: false, error: 'Missing shopId or accessToken' });
  try {
    const response = await fetch(`https://openapi.etsy.com/v3/application/shops/${shopId}/listings?limit=100`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'x-api-key': process.env.ETSY_KEYSTRING },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to fetch listings');
    res.json({ ok: true, listings: (data.results || []).map(l => ({ sku: (l.skus || [])[0], stock_quantity: l.quantity })) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Creates a real, live (draft or active, per `state`) listing — only
// ever called after the founder has explicitly confirmed a preview in
// the UI. Etsy requires a numeric taxonomy_id (its category system) on
// every listing and there's no safe default across garment types, so
// the founder has to supply one (see README) rather than this guessing
// wrong and miscategorizing a real listing. Etsy image upload is a
// separate multipart endpoint this doesn't call — the listing is created
// text-only; photos get added directly in Etsy afterward.
app.post('/api/etsy/publish-listing', async (req, res) => {
  const { shopId, accessToken, title, description, price, quantity, taxonomyId, sku } = req.body;
  if (!shopId || !accessToken || !title || !price || !taxonomyId) return res.status(400).json({ ok: false, error: 'Missing required fields (title, price, and an Etsy taxonomy ID are all required)' });
  try {
    const response = await fetch(`https://openapi.etsy.com/v3/application/shops/${shopId}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'x-api-key': process.env.ETSY_KEYSTRING, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quantity: quantity || 1, title, description: description || '', price: Number(price),
        who_made: 'i_did', when_made: 'made_to_order', taxonomy_id: Number(taxonomyId),
        sku: sku ? [sku] : undefined, state: 'draft',
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to create listing');
    res.json({ ok: true, externalId: String(data.listing_id), externalUrl: data.url });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------
// 4D. TIKTOK SHOP — honest stub, not a real connection
// ---------------------------------------------------------
// Unlike Shopify/WooCommerce/Etsy, TikTok Shop's Partner API isn't
// self-serve — a developer app alone doesn't grant access; TikTok has to
// approve the seller/partner relationship first, and the exact OAuth
// shape varies by API version and region in ways not confidently
// verifiable without an approved account to test against. Rather than
// guess at an auth URL that might be wrong, this always returns a clear
// "not available yet" response instead of attempting a redirect —
// honest about what it is, consistent with how this app already handles
// the Shopify connection while its own App Store review is pending.
app.get('/api/tiktokshop/auth', (req, res) => {
  res.status(400).json({ ok: false, error: 'TikTok Shop requires an approved TikTok Shop Partner Center account, not just a developer app — this connection is not available yet.' });
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
        <h2>You've been invited to Atelier!</h2>
        <p><strong>${inviterName || 'A teammate'}</strong> has invited you to join the <strong>${brandName}</strong> workspace as an ${role}.</p>
        <p>Atelier is a production operating system for fashion brands.</p>
        <a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; background: #211D18; color: #fff; text-decoration: none; border-radius: 8px; margin-top: 10px;">
          Join Workspace
        </a>
      </div>
    `;

    const data = await resend.emails.send({
      from: 'Atelier <onboarding@resend.dev>',
      to: email, 
      subject: `Join ${brandName} on Atelier`,
      html: htmlBody,
    });

    res.json({ ok: true, data });
  } catch (error) {
    console.error('❌ Email Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Real send via Resend, one call per recipient (Resend's batch endpoint caps
// at 100 and this app has no queue/retry infra, so a simple sequential loop
// with per-recipient error capture is the honest choice over pretending a
// bulk-send guarantee this doesn't have). Only ever called after the founder
// explicitly confirms in the UI — this can email real people.
app.post('/api/send-campaign', async (req, res) => {
  console.log("📥 Received campaign send request...");
  if (!resend) {
    return res.status(400).json({ ok: false, error: 'RESEND_API_KEY is missing from api/.env — no campaign can be sent without it.' });
  }
  try {
    const { subject, body, recipients } = req.body;
    if (!subject || !body || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ ok: false, error: 'Missing subject, body, or recipients' });
    }

    let sent = 0;
    const failures = [];
    for (const email of recipients) {
      try {
        await resend.emails.send({ from: 'Atelier <onboarding@resend.dev>', to: email, subject, html: body });
        sent++;
      } catch (err) {
        failures.push({ email, error: err.message });
      }
    }

    console.log(`✅ Campaign sent: ${sent}/${recipients.length}`);
    res.json({ ok: true, sent, failed: failures.length, failures });
  } catch (error) {
    console.error('❌ Campaign Send Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ---------------------------------------------------------
// 5. DASHBOARD AI SUGGESTIONS
// ---------------------------------------------------------
const SUGGESTION_CATEGORIES = ['readiness', 'deadline', 'vendor', 'budget', 'team', 'billing', 'design', 'general'];

app.post('/api/dashboard-suggestions', metered('dashboard-suggestions'), async (req, res) => {
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
// One endpoint, many "modes" — every tool here needs to see and faithfully
// edit the founder's *actual* existing design (recolor, fabric-swap, etc.),
// which is why these stay on Gemini's image model: it's the one that takes
// a reference image and returns a genuinely edited version of it. Pixazo's
// Stable Diffusion endpoints below are text-to-image only, so they handle
// the opposite kind of tool — generating a brand new, isolated element to
// *add* to the design rather than editing the design itself. See "7." below.
const IMAGE_MODE_PROMPTS = {
  'sketch-to-design': (p) => `You are a fashion technical illustrator. Take this rough sketch and render it as a clean, professional garment design image — polished linework, realistic fabric drape and shading, on a plain white background, single garment only, no model.${p ? ` Style direction: ${p}.` : ''} Keep the same silhouette and proportions as the sketch — you're rendering it, not redesigning it.`,
  'ai-edit': (p) => `You are editing this garment design image. Apply exactly this change, keeping everything else about the garment identical: ${p || 'make a small refinement'}. Keep the same camera angle, background, and overall composition.`,
  'bg-remove': () => `Remove the background from this image completely, replacing it with a plain solid white background. Keep the garment itself pixel-identical — do not alter its color, shape, or details.`,
  'recolor': (p) => `Recolor the garment in this image to ${p || 'a different color'}, preserving all fabric texture, shading, folds, and construction details exactly as they are — only the color changes.`,
  'fabric-swap': (p) => `Change the fabric of the garment in this image to ${p || 'a different fabric'}, updating texture and drape to realistically reflect that fabric while keeping the exact same garment silhouette, cut, and design details.`,
  'mockup': (p) => `Create a professional product photography mockup of this garment design: ${p || 'worn by a model in a studio setting with clean, even lighting'}. Keep the garment's design, color, and details exactly as shown in the reference image.`,
  'flat-sketch': () => `Convert this garment image into a clean technical flat sketch — precise black linework on a white background, no shading or color, front view, the kind used in a professional tech pack.`,
  'view': (p) => `Generate the ${p || 'back'} view of this exact same garment — same color, fabric, and design details as the reference image, just shown from a different angle.`,
  'variant': (p) => `Create a design variation of this garment: ${p || 'a stylistic variation'}. Keep it recognizably related to the original but with this specific change applied.`,
};

app.post('/api/design/ai-image', metered('design-ai-image'), async (req, res) => {
  console.log("📥 Received AI image request...");
  try {
    const { mode, prompt, images } = req.body;
    const builder = IMAGE_MODE_PROMPTS[mode];
    if (!builder) return res.status(400).json({ ok: false, error: 'Unknown AI image mode: ' + mode });
    if (!images || images.length === 0) {
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

// ---------------------------------------------------------
// 7. AI DESIGN STUDIO — new element generation (Stable Diffusion / Pixazo)
// ---------------------------------------------------------
// Generates a standalone graphic (a logo/icon, or a pattern swatch) with no
// input image — this is what feeds the frontend's "add as a new layer"
// action (PhotopeaEditor.addLayer) instead of the Gemini modes above, which
// replace the whole canvas. Kept as a separate endpoint/provider rather than
// folded into /api/design/ai-image since it's a genuinely different
// capability (isolated-asset generation vs. whole-image editing), not just
// another prompt template.
const ELEMENT_MODE_PROMPTS = {
  'add-element': (p) => p || 'a simple minimalist icon',
  'pattern': (p) => `a seamless, tileable, repeating textile pattern: ${p || 'an abstract pattern'}`,
  // Used for Design.jsx's "Generate silhouette" (custom garment types outside
  // the 9 hand-drawn presets). An earlier version had Gemini guess raw SVG
  // path coordinates for this, which is a spatial-reasoning task text models
  // are bad at blind — results were unrecognizable for anything but the
  // simplest shapes. An actual image model reasons in pixel space, so it's
  // structurally better suited to rendering a coherent garment outline.
  'silhouette': (p) => `a technical fashion flat sketch of a ${p || 'garment'}, laid flat, front view, symmetric, black ink line drawing only, thin uniform line weight, spec-sheet CAD illustration style`,
};

const ELEMENT_MODE_EXTRA_NEGATIVE = {
  'silhouette': 'color, fabric texture, painting, 3d render, photorealistic render, model, mannequin, shading, gradient, sketch shading, cross-hatching',
};

app.post('/api/design/generate-element', metered('design-generate-element'), async (req, res) => {
  console.log("📥 Received element generation request...");
  try {
    const { mode, prompt } = req.body;
    const builder = ELEMENT_MODE_PROMPTS[mode];
    if (!builder) return res.status(400).json({ ok: false, error: 'Unknown element mode: ' + mode });
    const result = await callPixazoElement(builder(prompt), ELEMENT_MODE_EXTRA_NEGATIVE[mode] || '');
    console.log("✅ Element generation successful:", mode);
    res.json({ ok: true, imageBase64: result.base64, mimeType: result.mimeType });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/design/color-palette', metered('design-color-palette'), async (req, res) => {
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

app.post('/api/design/trend-inspiration', metered('design-trend-inspiration'), async (req, res) => {
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

// ---------------------------------------------------------
// 8. SOCIAL MEDIA OAUTH (Instagram, TikTok, YouTube, Pinterest)
// ---------------------------------------------------------
// Rebuilt on the same shared OAuth handoff helper Shopify/Etsy use
// (signed state, single-use handoff code instead of a raw token in the
// URL) — the previous version here had two real bugs: `state` was just
// the bare brandId (no CSRF protection, same gap Shopify had), and
// ContentContext.jsx's connectAccount() never actually read the `token`
// query param at all, so every "connected" account had no real access
// token behind it — the OAuth handshake ran for nothing. Both fixed now.
const SOCIAL_OAUTH = {
  instagram: {
    envId: 'INSTAGRAM_CLIENT_ID', envSecret: 'INSTAGRAM_CLIENT_SECRET',
    authUrl: (redirectUri, state) => `https://api.instagram.com/oauth/authorize?client_id=${process.env.INSTAGRAM_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user_profile,user_media&response_type=code&state=${state}`,
    getToken: async (code, redirectUri) => {
      const form = new URLSearchParams({ client_id: process.env.INSTAGRAM_CLIENT_ID, client_secret: process.env.INSTAGRAM_CLIENT_SECRET, grant_type: 'authorization_code', redirect_uri: redirectUri, code });
      const response = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error_message || 'Instagram token exchange failed');
      return { accessToken: data.access_token };
    },
    getHandle: async ({ accessToken }) => {
      const response = await fetch(`https://graph.instagram.com/me?fields=username&access_token=${accessToken}`);
      const data = await response.json();
      return data.username || 'Connected';
    },
  },
  tiktok: {
    envId: 'TIKTOK_CLIENT_KEY', envSecret: 'TIKTOK_CLIENT_SECRET',
    authUrl: (redirectUri, state) => `https://www.tiktok.com/v2/auth/authorize/?client_key=${process.env.TIKTOK_CLIENT_KEY}&response_type=code&scope=user.info.basic&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
    getToken: async (code, redirectUri) => {
      const form = new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: redirectUri });
      const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' }, body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'TikTok token exchange failed');
      return { accessToken: data.access_token };
    },
    getHandle: async ({ accessToken }) => {
      const response = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name', { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await response.json();
      return data.data?.user?.display_name || 'Connected';
    },
  },
  youtube: {
    envId: 'YOUTUBE_CLIENT_ID', envSecret: 'YOUTUBE_CLIENT_SECRET',
    authUrl: (redirectUri, state) => `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.YOUTUBE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&prompt=consent&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload')}&state=${state}`,
    getToken: async (code, redirectUri) => {
      const form = new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: redirectUri });
      const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error_description || 'YouTube token exchange failed');
      return { accessToken: data.access_token, refreshToken: data.refresh_token };
    },
    getHandle: async ({ accessToken }) => {
      const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await response.json();
      return data.items?.[0]?.snippet?.title || 'Connected';
    },
  },
  pinterest: {
    envId: 'PINTEREST_CLIENT_ID', envSecret: 'PINTEREST_CLIENT_SECRET',
    authUrl: (redirectUri, state) => `https://www.pinterest.com/oauth/?client_id=${process.env.PINTEREST_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('boards:read,pins:read,pins:write')}&state=${state}`,
    getToken: async (code, redirectUri) => {
      const basic = Buffer.from(`${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`).toString('base64');
      const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
      const response = await fetch('https://api.pinterest.com/v5/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` }, body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Pinterest token exchange failed');
      return { accessToken: data.access_token, refreshToken: data.refresh_token };
    },
    getHandle: async ({ accessToken }) => {
      const response = await fetch('https://api.pinterest.com/v5/user_account', { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await response.json();
      return data.username || 'Connected';
    },
  },
};

app.get('/api/social/auth/:platform', (req, res) => {
  const { platform } = req.params;
  const { brandId } = req.query;
  const cfg = SOCIAL_OAUTH[platform];
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  if (!brandId) return res.status(400).send('Missing brandId');
  if (!cfg) return res.status(400).send('Unsupported platform');
  if (!process.env[cfg.envId]) return res.redirect(`${appUrl}/content?social_error=missing_keys`);

  const apiUrl = process.env.API_URL || 'http://localhost:3001';
  const redirectUri = `${apiUrl}/api/social/callback/${platform}`;
  const state = signOAuthState(brandId);
  res.redirect(cfg.authUrl(redirectUri, state));
});

app.get('/api/social/callback/:platform', async (req, res) => {
  const { platform } = req.params;
  const { code, state } = req.query;
  const cfg = SOCIAL_OAUTH[platform];
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const apiUrl = process.env.API_URL || 'http://localhost:3001';
  const brandId = verifyOAuthState(state);

  if (!code || !brandId || !cfg) return res.redirect(`${appUrl}/content?social_error=missing_params`);

  try {
    const redirectUri = `${apiUrl}/api/social/callback/${platform}`;
    const tokenData = await cfg.getToken(code, redirectUri);
    const handle = await cfg.getHandle(tokenData).catch(() => 'Connected');

    const handoffCode = createOAuthHandoff({ platform, handle, accessToken: tokenData.accessToken, refreshToken: tokenData.refreshToken || null, brandId });
    res.redirect(`${appUrl}/content?social_success=true&platform=${platform}&handoff=${handoffCode}&brandId=${brandId}`);
  } catch (err) {
    console.error(`${platform} OAuth Error:`, err);
    res.redirect(`${appUrl}/content?social_error=true`);
  }
});

// Real publish attempt — only Pinterest's connect flow actually requested a
// write scope (pins:write, granted at OAuth time). Instagram/TikTok were
// connected with read-only scopes (user_profile/user_media, user.info.basic)
// on purpose — real content-publish permissions on both platforms require a
// separate business-verified app review this integration doesn't have, so
// attempting the call would just fail in a confusing way. Rather than build
// a call guaranteed to fail, this says so plainly. YouTube did request an
// upload scope, but content_posts only stores an image_url — there's no
// video file to upload, so there's genuinely nothing to publish yet.
app.post('/api/social/publish/:platform', async (req, res) => {
  const { platform } = req.params;
  const { accessToken, caption, imageUrl, boardId } = req.body;

  if (platform === 'pinterest') {
    if (!accessToken || !imageUrl) return res.status(400).json({ ok: false, error: 'Missing accessToken or imageUrl' });
    if (!boardId) return res.status(400).json({ ok: false, error: 'Pinterest requires a board ID to pin to — add one in the post composer.' });
    try {
      const response = await fetch('https://api.pinterest.com/v5/pins', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ board_id: boardId, title: (caption || '').slice(0, 100), description: caption || '', media_source: { source_type: 'image_url', url: imageUrl } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Pinterest rejected the pin');
      res.json({ ok: true, externalUrl: `https://www.pinterest.com/pin/${data.id}/` });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
    return;
  }

  if (platform === 'instagram') {
    return res.status(400).json({ ok: false, error: "This Instagram connection only has read-only access (user_profile, user_media) — publishing needs Instagram's separate Business Login flow with a content-publish scope, which requires Meta App Review. Not attempted." });
  }
  if (platform === 'tiktok') {
    return res.status(400).json({ ok: false, error: "This TikTok connection only has read-only access (user.info.basic) — TikTok's Content Posting API needs video.publish/photo.publish scopes, which require an audited app. Not attempted." });
  }
  if (platform === 'youtube') {
    return res.status(400).json({ ok: false, error: 'This YouTube connection has upload access, but Content Hub only stores an image per post — there\'s no video file to upload yet, so there\'s nothing to publish.' });
  }

  res.status(400).json({ ok: false, error: 'Unsupported platform' });
});

// ---------------------------------------------------------
// 9. CHAT ASSISTANT
// ---------------------------------------------------------
// The frontend gathers a text summary of the brand's own products/vendors/
// etc. from its already-loaded contexts (same "client assembles context,
// server just prompts" shape as /api/dashboard-suggestions) and posts it
// here alongside the message and a short prior-turn transcript. callGemini
// always asks for JSON back, so a conversational reply gets wrapped in a
// single { "reply": "..." } object rather than returned as raw text.
app.post('/api/chat-reply', metered('chat-reply'), async (req, res) => {
  console.log("📥 Received chat message...");
  try {
    const { message, history, brandContext } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ ok: false, error: 'No message provided' });

    const transcript = (history || [])
      .slice(-20)
      .map(h => `${h.senderType === 'ai' ? 'Assistant' : 'Founder'}: ${h.body}`)
      .join('\n');

    const prompt = `You are a helpful assistant embedded inside Atelier, a tool an independent clothing brand founder uses to manage design, tech packs, vendors, and production. Answer the founder's question using ONLY the brand data given below plus general apparel-industry knowledge — never invent specific numbers, vendor names, or product details that aren't in the data given to you.

Brand data:
${brandContext || 'No brand data available.'}
${transcript ? `\nConversation so far:\n${transcript}\n` : ''}
Founder's new message: "${message}"

Be concise and direct — a couple of short paragraphs or a short list at most, not an essay. If the brand data doesn't contain what's needed to answer confidently, say so plainly instead of guessing.

Return a JSON object with exactly this structure:
{ "reply": "string, plain text, use \\n for line breaks, no markdown headers or bullet asterisks" }`;

    const result = await callGemini(prompt);
    console.log("✅ Chat reply successful");
    res.json({ ok: true, reply: result.reply });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ---------------------------------------------------------
// 10. RFQ & QUOTE ECONOMICS
// ---------------------------------------------------------
// Fixed set of common apparel cost levers for the AI Cost Simulator — a
// curated list rather than something AI invents per-call, so the UI can show
// a stable set of toggles ("like configuring a car") instead of a different
// random list every time.
const COST_LEVERS = [
  {
    id: 'gsm', label: 'Fabric weight (GSM)', type: 'choice',
    options: [
      { id: 'gsm-220', label: '~220 GSM (lightweight)' },
      { id: 'gsm-320', label: '~320 GSM (midweight)' },
      { id: 'gsm-380', label: '~380 GSM (standard heavyweight)' },
      { id: 'gsm-450', label: '~450 GSM (heavy)' },
      { id: 'gsm-550', label: '~550 GSM (heaviest)' },
    ],
  },
  { id: 'add-embroidery', label: 'Add embroidery or a printed detail', type: 'toggle', hint: 'one placement, standard size' },
  { id: 'organic-cotton', label: 'Switch to organic/premium cotton', type: 'toggle', hint: 'vs. standard cotton blend' },
  { id: 'move-region', label: 'Move production to a higher-cost region', type: 'toggle', hint: 'e.g. Portugal/EU instead of current sourcing' },
  { id: 'smaller-moq', label: 'Cut order quantity to a smaller MOQ tier', type: 'toggle', hint: 'per-unit cost typically rises' },
  { id: 'premium-trim', label: 'Add a premium trim (woven label, metal hardware)', type: 'toggle', hint: '' },
];

app.post('/api/quote-economics', metered('quote-economics'), async (req, res) => {
  console.log("📥 Received quote economics request...");
  try {
    const { vendor, product, quote, bom } = req.body;
    if (!quote || quote.amount == null) return res.status(400).json({ ok: false, error: 'This quote needs an amount before economics can be estimated.' });

    const totalAmount = Number(quote.amount);
    const fabricCost = (bom || []).reduce((sum, b) => sum + ((parseFloat(b.qtyPerUnit) || 0) * (parseFloat(b.unitCost) || 0)), 0);
    const fabricPercent = totalAmount > 0 ? Math.min(100, (fabricCost / totalAmount) * 100) : 0;
    const remainingPercent = Math.max(0, 100 - fabricPercent);

    const prompt = `You are a costing analyst helping an independent clothing brand founder understand where their per-unit quoted price actually goes.

Product: ${product?.name || 'unknown'} (${product?.category || 'unspecified category'})
Vendor: ${vendor?.name || 'unknown'}, location: ${vendor?.location || 'unknown'}
Quoted unit price: $${totalAmount.toFixed(2)}
Real bill-of-materials fabric/trim cost (already computed, do not change it): $${fabricCost.toFixed(2)} (${fabricPercent.toFixed(1)}% of the quoted price)
Order quantity: ${quote?.preferences?.quantity || 'unspecified'}

The fabric percentage above is fixed and real — your job is only to split the REMAINING ${remainingPercent.toFixed(1)}% of the quoted price across Labor, Shipping, Packaging, and Profit (margin the vendor is likely keeping), based on typical cut-and-sew economics for this kind of garment, vendor location, and order size. These four numbers must sum to exactly ${remainingPercent.toFixed(1)}.

Also give a rough shipping cost estimate per unit (freight from ${vendor?.location || 'the vendor'} to the brand, for this order size) and a rough import duty rate estimate (as a percent, based on general HS-code ballparks for this garment category) — both clearly framed as rough planning estimates, not customs or tax advice.

Return a JSON object with exactly this structure:
{
  "laborPercent": <number>,
  "shippingPercent": <number>,
  "packagingPercent": <number>,
  "profitPercent": <number>,
  "shippingEstimatePerUnit": <number>,
  "shippingNote": "one short sentence",
  "dutyRatePercent": <number>,
  "dutyNote": "one short sentence, including a reminder this isn't customs/tax advice"
}`;

    const result = await callGemini(prompt);
    console.log("✅ Quote economics successful");
    res.json({
      ok: true,
      breakdown: {
        fabricCost, fabricPercent,
        laborPercent: result.laborPercent, shippingPercent: result.shippingPercent,
        packagingPercent: result.packagingPercent, profitPercent: result.profitPercent,
      },
      shippingEstimatePerUnit: result.shippingEstimatePerUnit,
      shippingNote: result.shippingNote,
      dutyRatePercent: result.dutyRatePercent,
      dutyNote: result.dutyNote,
    });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/cost-simulator', metered('cost-simulator'), async (req, res) => {
  console.log("📥 Received cost simulator request...");
  try {
    const { vendor, product, quote, bom } = req.body;

    const prompt = `You are a costing analyst helping an independent clothing brand founder understand how specific changes would move their per-unit production cost — like a car configurator showing the price impact of each option.

Product: ${product?.name || 'unknown'} (${product?.category || 'unspecified category'})
Vendor: ${vendor?.name || 'unknown'}, location: ${vendor?.location || 'unknown'}
Current quoted unit price: ${quote?.amount != null ? `$${Number(quote.amount).toFixed(2)}` : 'not yet quoted — estimate from typical costs for this category'}
Current bill of materials: ${bom && bom.length ? bom.map(b => `${b.material} (${b.qtyPerUnit || '?'}/unit, ~$${b.unitCost || '?'})`).join(', ') : 'none on file'}

For EACH of the following possible changes, estimate the per-unit cost delta in dollars (positive = more expensive, can be negative if plausible) versus the current quoted price, if this single change were made on its own, holding everything else constant:
${COST_LEVERS.map(l => l.type === 'choice'
    ? `- id "${l.id}" (${l.label}) has MULTIPLE mutually-exclusive options — estimate a separate delta for EACH: ${l.options.map(o => `"${o.id}" (${o.label})`).join(', ')}`
    : `- id "${l.id}": ${l.label}${l.hint ? ` (${l.hint})` : ''}`
  ).join('\n')}

Return a JSON object with exactly this structure:
{
  "levers": [
    { "id": "a toggle lever id from above", "deltaPerUnit": <number, dollars>, "note": "under 12 words explaining why" }
  ],
  "choiceLevers": [
    { "id": "a choice lever id from above (e.g. gsm)", "options": [ { "id": "the option id, e.g. gsm-450", "deltaPerUnit": <number, dollars>, "note": "under 10 words" } ] }
  ]
}
Include one "levers" entry for every non-choice id, and one "choiceLevers" entry (with every one of its listed option ids) for every choice id.`;

    const result = await callGemini(prompt);
    console.log("✅ Cost simulator successful");
    res.json({ ok: true, levers: result.levers || [], choiceLevers: result.choiceLevers || [] });
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ---------------------------------------------------------
// 9. HEALTH CHECK (For Railway)
// ---------------------------------------------------------
app.get('/', (req, res) => {
  res.status(200).json({ ok: true, message: 'Atelier API is running successfully.' });
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});


// ---------------------------------------------------------
// 10. SHOPIFY MANDATORY GDPR WEBHOOKS (Required for App Store Review)
// ---------------------------------------------------------
// These endpoints are legally mandated by Shopify. They do not need complex 
// database logic for your app, but they MUST respond with a 200 OK to pass 
// the automated Shopify App Store submission linter.

app.post('/api/shopify/webhooks/customers/data_request', (req, res) => {
  console.log("📥 Shopify GDPR Webhook: Customer Data Request");
  res.status(200).send('OK');
});

app.post('/api/shopify/webhooks/customers/redact', (req, res) => {
  console.log("📥 Shopify GDPR Webhook: Customer Redact");
  res.status(200).send('OK');
});

app.post('/api/shopify/webhooks/shop/redact', (req, res) => {
  console.log("📥 Shopify GDPR Webhook: Shop Redact");
  res.status(200).send('OK');
});



// Unknown route → generic 404 (no framework/route details leaked).
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Last-resort error handler: log the real error server-side, return a generic
// message to the client so stack traces / internal details never leak.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  const status = err && err.status ? err.status : 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : (err.message || 'Error') });
});

const PORT = process.env.PORT || 3001;
// Explicitly bind to '0.0.0.0' so Railway's proxy can route traffic to it
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🧠 Backend running on port ${PORT}`);
});
