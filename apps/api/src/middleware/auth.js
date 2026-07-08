// ─── Auth middleware ──────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-CHANGE-IN-PRODUCTION';

/**
 * Validates JWT and attaches decoded payload to req.user.
 * Also sets req.tenantId and req.locationIds for convenience.
 * The tenantId is used by queryForTenant() to set the RLS context.
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Authorization header required', code: 401 });
  }
  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    req.user               = payload;
    req.tenantId           = payload.tenantId;
    req.userId             = payload.userId;
    req.userRole           = payload.role;
    req.locationIds        = payload.locationIds || [];
    req.subscriptionStatus = payload.subscriptionStatus || 'trial'; // empty = access to all locations
    next();
  } catch (err) {
    return res.status(401).json({
      ok:    false,
      error: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
      code:  401,
    });
  }
}

/**
 * Role-based access control middleware.
 * Usage: router.delete('/tenant', requireRole('owner'), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Not authenticated', code: 401 });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        ok:    false,
        error: `Requires role: ${roles.join(' or ')}. Your role: ${req.user.role}`,
        code:  403,
      });
    }
    next();
  };
}

/**
 * Verifies the requesting user has access to the given locationId.
 * Owners access all locations; managers/staff only see their assigned ones.
 */
function requireLocationAccess(req, res, next) {
  const locationId = req.params.locationId || req.query.locationId || req.body.locationId;
  if (!locationId) return next(); // no location param — let route handle it

  if (req.userRole === 'owner') return next(); // owners see all

  if (req.locationIds.length > 0 && !req.locationIds.includes(locationId)) {
    return res.status(403).json({
      ok:    false,
      error: 'Access denied to this location',
      code:  403,
    });
  }
  next();
}

/**
 * Generate a JWT for a user.
 */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

module.exports = { authMiddleware, requireRole, requireLocationAccess, signToken };
