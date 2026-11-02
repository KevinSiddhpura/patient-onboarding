import express from "express";
import { getProfile } from "../controllers/users.js";
import { requireSession } from "../middlewares/auth.js";

const router = express.Router();

router.get("/:uid", requireSession, getProfile);

export default router;
