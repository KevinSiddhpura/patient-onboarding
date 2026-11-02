import express from "express";
import { login, logout, me } from "../controllers/auth.js";
import { requireSession } from "../middlewares/auth.js";

const router = express.Router();

router.post("/login", login);
router.post("/logout", requireSession, logout);
router.get("/me", me);

export default router;
