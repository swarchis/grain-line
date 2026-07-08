// ── Claude API helper ──────────────────────────────────────────────────────────
const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Call Claude API with timeout, error handling, and consistent model selection.
 * @param {object} opts
 * @param {string|object[]} opts.content  — string prompt or content array (for multimodal)
 * @param {number}  opts.maxTokens        — default 1000
 * @param {string}  opts.systemPrompt     — optional system prompt
 * @param {number}  opts.timeoutMs        — default 30000
 * @returns {Promise<string>}             — text response
 */
async function callClaude({ content, maxTokens = 1000, systemPrompt, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const model    = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';
  const messages = [{ role: 'user', content }];
  const body     = { model, max_tokens: maxTokens, messages };
  if (systemPrompt) body.system = systemPrompt;

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(CLAUDE_API, {
      method:  'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Claude API timeout after ${timeoutMs}ms`);
    throw new Error(`Claude API network error: ${e.message}`);
  } finally {
    clearTimeout(timeout);
  }

  const json = await res.json();

  if (!res.ok || json.error) {
    const msg = json.error?.message || json.message || `Claude API error (${res.status})`;
    throw new Error(msg);
  }

  if (!json.content?.[0]?.text) {
    throw new Error('Claude returned empty response');
  }

  return json.content[0].text;
}

/**
 * Parse JSON from Claude response, stripping markdown fences.
 */
function parseJSON(text) {
  const clean = text.replace(/```json?|```/g, '').trim();
  try { return JSON.parse(clean); }
  catch (e) { throw new Error(`Claude returned invalid JSON: ${e.message}\nRaw: ${clean.slice(0, 200)}`); }
}

module.exports = { callClaude, parseJSON };
