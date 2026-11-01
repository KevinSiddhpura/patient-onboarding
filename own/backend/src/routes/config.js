import express from "express";
import { getFlag } from "../db.js";
import { requireRole, requireSession } from "../middleware.js";

export function createConfigRouter() {
  const router = express.Router();

  router.get("/", requireSession, requireRole("receptionist", "doctor"), (req, res) => {
    res.json({ show_delete_button: getFlag(req.app.locals.db) });
  });

  return router;
}
