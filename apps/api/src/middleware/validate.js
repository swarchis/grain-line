// ── Input validation middleware ────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate UUID path params */
function validateUUID(...paramNames) {
  return (req, res, next) => {
    for (const name of paramNames) {
      const val = req.params[name];
      if (val && !UUID_RE.test(val)) {
        return res.status(400).json({ ok:false, error:`Invalid ${name}: must be a UUID`, code:400 });
      }
    }
    next();
  };
}

/** Strip unknown keys and enforce max lengths on string fields */
function sanitizeBody(allowedKeys, maxLengths = {}) {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') return next();
    const cleaned = {};
    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        let val = req.body[key];
        // Enforce max length on strings
        if (typeof val === 'string' && maxLengths[key]) {
          val = val.slice(0, maxLengths[key]);
        }
        cleaned[key] = val;
      }
    }
    req.body = cleaned;
    next();
  };
}

/** Reject payloads over a custom size (for non-scan endpoints) */
function limitBodySize(maxKb) {
  return (req, res, next) => {
    const len = parseInt(req.headers['content-length'] || '0');
    if (len > maxKb * 1024) {
      return res.status(413).json({ ok:false, error:`Request too large (max ${maxKb}KB)`, code:413 });
    }
    next();
  };
}

module.exports = { validateUUID, sanitizeBody, limitBodySize };
