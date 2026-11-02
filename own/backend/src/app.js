import { resolve } from "node:path";
import express from "express";
import { errorHandler } from "./middlewares/errorHandler.js";
import authRoutes from "./routes/auth.js";
import configRoutes from "./routes/config.js";
import eventRoutes from "./routes/events.js";
import patientRoutes from "./routes/patients.js";
import userRoutes from "./routes/users.js";
import { createEventHub } from "./services/events.js";
import { ApiError } from "./utils/ApiError.js";

export function createApp({
  db,
  production = false,
  staticDir = null,
  events = createEventHub(),
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.locals.db = db;
  app.locals.production = production;
  app.locals.events = events;

  const api = express.Router();
  api.use(express.json({ limit: "10kb" }));
  api.use("/auth", authRoutes);
  api.use("/users", userRoutes);
  api.use("/patients", patientRoutes);
  api.use("/config", configRoutes);
  api.use("/events", eventRoutes);

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
