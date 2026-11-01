import express from "express";
import { ApiError } from "../errors.js";
import { loadSession, requireSession, SESSION_COOKIE } from "../middleware.js";
import { burnPasswordCheck, verifyPassword } from "../passwords.js";
import { createSession, deleteExpiredSessions, deleteSession } from "../sessions.js";
import { findUserByEmail } from "../users.js";

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: req.app.locals.production,
  };
}

export function createAuthRouter({ loginLimiter }) {
  const router = express.Router();

  router.post("/login", async (req, res) => {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || !EMAIL_FORMAT.test(email)) {
      throw new ApiError(400, "auth/invalid-email");
    }

    const limitKey = `${email.toLowerCase()}|${req.ip}`;
    if (loginLimiter.isBlocked(limitKey)) {
      throw new ApiError(429, "auth/too-many-requests");
    }

    const { db } = req.app.locals;
    const user = findUserByEmail(db, email);
    let passwordMatches = false;
    if (typeof password === "string" && password.length > 0) {
      if (user) {
        passwordMatches = await verifyPassword(password, user.password_hash);
      } else {
        await burnPasswordCheck(password);
      }
    }

    if (!passwordMatches) {
      loginLimiter.recordFailure(limitKey);
      throw new ApiError(401, "auth/invalid-credential");
    }

    loginLimiter.clear(limitKey);
    deleteExpiredSessions(db);
    res.cookie(SESSION_COOKIE, createSession(db, user.uid), {
      ...cookieOptions(req),
      maxAge: SESSION_MAX_AGE_MS,
    });
    res.json({ uid: user.uid, email: user.email });
  });

  router.post("/logout", requireSession, (req, res) => {
    deleteSession(req.app.locals.db, req.session.tokenHash);
    req.app.locals.events?.closeSession(req.session.tokenHash);
    res.clearCookie(SESSION_COOKIE, cookieOptions(req));
    res.status(204).end();
  });

  router.get("/me", (req, res) => {
    const user = loadSession(req)?.user;
    res.json({ user: user ? { uid: user.uid, email: user.email } : null });
  });

  return router;
}
