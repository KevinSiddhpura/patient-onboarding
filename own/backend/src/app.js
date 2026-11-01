import { createHash, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import express from "express";
import { ApiError, errorHandler } from "./errors.js";
import { createEventHub, createEventsRouter } from "./events.js";
import { createAuthRouter } from "./routes/auth.js";
import { createConfigRouter } from "./routes/config.js";
import { createPatientsRouter } from "./routes/patients.js";
import { createUsersRouter } from "./routes/users.js";

// timingSafeEqual throws on different lengths, so compare hashes, which are always the same length.
function sha256(value) {
  return createHash("sha256").update(value).digest();
}

function requireProxySecret(proxySecret) {
  const expected = sha256(proxySecret);
  return (req, res, next) => {
    const given = sha256(req.get("x-proxy-secret") ?? "");
    if (!timingSafeEqual(given, expected)) {
      throw new ApiError(403, "permission-denied");
    }
    next();
  };
}

// Part of the CSRF protection: a plain HTML form cannot send this content type.
function requireJsonOnWrites(req, res, next) {
  const isRead = req.method === "GET" || req.method === "HEAD";
  const contentType = req.get("content-type") ?? "";
  if (!isRead && !contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError(400, "invalid-argument");
  }
  next();
}

// Patient data must not stay in the browser's cache after logout.
function noStore(req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

export function createApp({
  db,
  production = false,
  proxySecret = null,
  staticDir = null,
  events = createEventHub(),
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.locals.db = db;
  app.locals.production = production;
  app.locals.events = events;

  if (proxySecret) {
    // Only safe with the secret check below, which stops direct callers forging X-Forwarded-For.
    app.set("trust proxy", 1);
    app.use(requireProxySecret(proxySecret));
  }

  const api = express.Router();
  api.use(noStore);
  api.use(requireJsonOnWrites);
  api.use(express.json({ limit: "10kb" }));
  api.use("/auth", createAuthRouter());
  api.use("/users", createUsersRouter());
  api.use("/patients", createPatientsRouter());
  api.use("/config", createConfigRouter());
  api.use("/events", createEventsRouter());
  api.use(() => {
    throw new ApiError(404, "not-found");
  });
  app.use("/api", api);

  if (staticDir) {
    const root = resolve(staticDir);
    app.use(express.static(root));
    app.get(/.*/, (req, res) => {
      res.sendFile("index.html", { root });
    });
  }

  app.use(errorHandler);
  return app;
}
