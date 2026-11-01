import express from "express";
import { ApiError } from "../errors.js";
import { loadSession, requireSession, SESSION_COOKIE } from "../middleware.js";
import { burnPasswordCheck, verifyPassword } from "../passwords.js";
import { createSession, deleteExpiredSessions, deleteSession, SESSION_LIFETIME_MS } from "../sessions.js";
import { findUserByEmail, isValidEmail } from "../users.js";

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: req.app.locals.production,
  };
}

export function createAuthRouter({ loginLimiter, ipLimiter }) {
  const router = express.Router();

  router.post("/login", async (req, res) => {
    const { email, password } = req.body ?? {};

    if (!isValidEmail(email)) {
      throw new ApiError(400, "auth/invalid-email");
    }

    if (typeof password !== "string" || password.length === 0) {
      throw new ApiError(401, "auth/invalid-credential");
    }

    // Without a per-IP cap, trying many emails avoids the per-email limit and pushes old entries out of it.
    const limitKey = `${email.toLowerCase()}|${req.ip}`;
    if (!ipLimiter.tryAcquire(req.ip) || !loginLimiter.tryAcquire(limitKey)) {
      throw new ApiError(429, "auth/too-many-requests");
    }

    const { db } = req.app.locals;
    const user = findUserByEmail(db, email);
    let passwordMatches = false;
    if (user) {
      passwordMatches = await verifyPassword(password, user.password_hash);
    } else {
      await burnPasswordCheck(password);
    }

    if (!passwordMatches) {
      throw new ApiError(401, "auth/invalid-credential");
    }

    loginLimiter.clear(limitKey);
    deleteExpiredSessions(db);
    res.cookie(SESSION_COOKIE, createSession(db, user.uid), {
      ...cookieOptions(req),
      maxAge: SESSION_LIFETIME_MS,
    });
    res.json({ uid: user.uid, email: user.email });
  });

  router.post("/logout", requireSession, (req, res) => {
    deleteSession(req.app.locals.db, req.session.tokenHash);
    req.app.locals.events.closeSession(req.session.tokenHash);
    res.clearCookie(SESSION_COOKIE, cookieOptions(req));
    res.status(204).end();
  });

  router.get("/me", (req, res) => {
    const user = loadSession(req)?.user;
    res.json({ user: user ? { uid: user.uid, email: user.email } : null });
  });

  return router;
}
