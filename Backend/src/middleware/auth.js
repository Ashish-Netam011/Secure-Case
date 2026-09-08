import bcrypt from "bcryptjs";
import { configDotenv } from "dotenv";
import jwt from "jsonwebtoken";

configDotenv();
const jwtSecret = process.env.JWT_SECRET;
const sessionDurationSeconds = 30 * 60;

if (process.env.NODE_ENV === "production" && (!jwtSecret || jwtSecret.length < 32)) {
  throw new Error("JWT_SECRET must be set to at least 32 characters in production.");
}

if (
  process.env.NODE_ENV === "production" &&
  ["IO_PIN_HASH", "LO_PIN_HASH", "ADMIN_PIN_HASH"].some((key) => !process.env[key])
) {
  throw new Error("All production PIN hashes must be configured.");
}

const demoUsers = [
  {
    id: "IO-001",
    name: "Investigating Officer",
    role: "Investigating Officer",
    clearance: "L3",
    pinHash: process.env.IO_PIN_HASH,
  },
  {
    id: "LO-001",
    name: "Legal Officer",
    role: "Legal Officer",
    clearance: "L2",
    pinHash: process.env.LO_PIN_HASH,
  },
  {
    id: "ADMIN-001",
    name: "System Administrator",
    role: "Administrator",
    clearance: "L4",
    pinHash: process.env.ADMIN_PIN_HASH,
  },
];

export async function authenticatePin(pin) {
  for (const user of demoUsers) {
    if (user.pinHash && await bcrypt.compare(pin, user.pinHash)) return user;
  }
  return null;
}

export function signUser(user) {
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not configured.");
  }
  return jwt.sign(
    { sub: user.id, name: user.name, role: user.role, clearance: user.clearance },
    jwtSecret,
    { expiresIn: sessionDurationSeconds },
  );
}

export function requireAuth(req, res, next) {
  const header = req.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: "Authentication required." });

  try {
    const payload = jwt.verify(token, jwtSecret);
    if (payload.iat && payload.exp - payload.iat > sessionDurationSeconds) {
      return res.status(401).json({ success: false, message: "Invalid or expired authentication token." });
    }
    req.user = { ...payload, id: payload.sub };
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired authentication token." });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: "Insufficient permissions." });
    }
    next();
  };
}