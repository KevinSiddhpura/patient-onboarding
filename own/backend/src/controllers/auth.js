import { loadSession, SESSION_COOKIE } from "../middlewares/auth.js";
import {
  createSession,
  deleteExpiredSessions,
  deleteSession,
  SESSION_LIFETIME_MS,
} from "../services/sessions.js";
import { checkLogin, isValidEmail } from "../services/users.js";
import { ApiError } from "../utils/ApiError.js";

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: req.app.locals.production,
  };
}

export async function login(req, res) {
  const { email, password } = req.body ?? {};

  if (!isValidEmail(email)) {
    throw new ApiError(400, "auth/invalid-email");
  }

  if (typeof password !== "string" || password.length === 0) {
    throw new ApiError(401, "auth/invalid-credential");
  }

  const { db } = req.app.locals;
  const user = await checkLogin(db, email, password);
  if (!user) {
    throw new ApiError(401, "auth/invalid-credential");
  }

  deleteExpiredSessions(db);
  res.cookie(SESSION_COOKIE, createSession(db, user.uid), {
    ...cookieOptions(req),
    maxAge: SESSION_LIFETIME_MS,
  });
  res.json({ uid: user.uid, email: user.email });
}

export function logout(req, res) {
  deleteSession(req.app.locals.db, req.session.token);
  req.app.locals.events.closeSession(req.session.token);
  res.clearCookie(SESSION_COOKIE, cookieOptions(req));
  res.status(204).end();
}

export function me(req, res) {
  const user = loadSession(req)?.user;
  res.json({ user: user ? { uid: user.uid, email: user.email } : null });
}
