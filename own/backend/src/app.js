import { createHash, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import express from "express";
import { ApiError, errorHandler } from "./errors.js";

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

export function createApp({ db, production = false, proxySecret = null, staticDir = null } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.locals.db = db;
  app.locals.production = production;

  if (proxySecret) {
    // Only safe with the secret check below, which stops direct callers forging X-Forwarded-For.
    app.set("trust proxy", 1);
    app.use(requireProxySecret(proxySecret));
  }

  const api = express.Router();
  api.use(requireJsonOnWrites);
  api.use(express.json({ limit: "10kb" }));
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
