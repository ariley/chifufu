const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
const JWT_EXPIRES_IN = '30d';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

module.exports = { signToken, verifyToken, extractToken };
