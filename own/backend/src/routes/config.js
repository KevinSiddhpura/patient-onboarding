import express from "express";
import { getFlag } from "../db.js";
import { requireSession, requireStaff } from "../middleware.js";

export function createConfigRouter() {
  const router = express.Router();

  router.get("/", requireSession, requireStaff, (req, res) => {
    res.json({ show_delete_button: getFlag(req.app.locals.db) });
  });

  return router;
}
