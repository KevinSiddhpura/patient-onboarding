import { randomBytes } from "node:crypto";

export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export function createSession(db, uid) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS).toISOString();
  db.prepare("INSERT INTO sessions (token, uid, expires_at) VALUES (?, ?, ?)").run(
    token,
    uid,
    expiresAt,
  );
  return token;
}

export function findSession(db, token) {
  const user = db
    .prepare(
      `SELECT users.uid, users.email, users.name, users.role
       FROM sessions JOIN users ON users.uid = sessions.uid
       WHERE sessions.token = ? AND sessions.expires_at > ?`,
    )
    .get(token, new Date().toISOString());
  return user ? { token, user } : null;
}

export function deleteSession(db, token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function deleteExpiredSessions(db) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
}
