import express from "express";
import { streamEvents } from "../controllers/events.js";
import { requireSession, requireStaff } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", requireSession, requireStaff, streamEvents);

export default router;
