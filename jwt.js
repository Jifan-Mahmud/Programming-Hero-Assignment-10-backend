const { SignJWT, jwtVerify } = require("jose-cjs");

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

// Sign JWT token
async function createToken(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

// Verify JWT token
async function verifyTokenString(token) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch (err) {
    return null;
  }
}

// Express middleware to verify token from HTTPOnly cookie or Authorization header
async function verifyToken(req, res, next) {
  const token =
    req.cookies?.pulseforge_token ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const payload = await verifyTokenString(token);
  if (!payload) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  req.user = payload;
  next();
}

// Optional token middleware (populates req.user if token present, but doesn't block)
async function optionalToken(req, res, next) {
  const token =
    req.cookies?.pulseforge_token ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (token) {
    const payload = await verifyTokenString(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}

module.exports = {
  createToken,
  verifyTokenString,
  verifyToken,
  optionalToken,
};
