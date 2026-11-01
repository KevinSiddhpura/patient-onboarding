import express from "express";
import { requireRole, requireSession } from "../middleware.js";

export function getFlag(db) {
  const { value } = db.prepare("SELECT value FROM config WHERE key = 'show_delete_button'").get();
  return value === "true";
}

export function setFlag(db, enabled) {
  db.prepare("UPDATE config SET value = ? WHERE key = 'show_delete_button'").run(String(enabled));
}

export function createConfigRouter() {
  const router = express.Router();

  router.get("/", requireSession, requireRole("receptionist", "doctor"), (req, res) => {
    res.json({ show_delete_button: getFlag(req.app.locals.db) });
  });

  return router;
}
