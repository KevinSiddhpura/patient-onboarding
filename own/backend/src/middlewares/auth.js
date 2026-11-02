import { findSession } from "../services/sessions.js";
import { VALID_ROLES } from "../services/users.js";
import { ApiError } from "../utils/ApiError.js";

export const SESSION_COOKIE = "session";

function readSessionToken(req) {
  for (const part of (req.get("cookie") ?? "").split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === SESSION_COOKIE && value) {
      return value;
    }
  }
  return null;
}

export function loadSession(req) {
  const token = readSessionToken(req);
  return token ? findSession(req.app.locals.db, token) : null;
}

export function requireSession(req, res, next) {
  const session = loadSession(req);
  if (!session) {
    throw new ApiError(401, "unauthenticated");
  }
  req.session = session;
  req.user = session.user;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, "permission-denied");
    }
    next();
  };
}

export const requireStaff = requireRole(...VALID_ROLES);
