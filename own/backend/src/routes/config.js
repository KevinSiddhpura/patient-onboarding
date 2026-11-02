import express from "express";
import { getConfig } from "../controllers/config.js";
import { requireSession, requireStaff } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", requireSession, requireStaff, getConfig);

export default router;
