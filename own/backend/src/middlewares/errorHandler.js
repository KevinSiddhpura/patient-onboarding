import { ApiError } from "../utils/ApiError.js";

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code } });
    return;
  }

  if (error.status >= 400 && error.status < 500) {
    res.status(400).json({ error: { code: "invalid-argument" } });
    return;
  }

  console.error("Unexpected error:", error);
  res.status(500).json({ error: { code: "internal" } });
}
