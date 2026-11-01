import { createHash, randomBytes } from "node:crypto";

const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

// Only the hash is stored, so a copy of the database cannot be used to log in.
export function createSession(db, uid) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS).toISOString();
  db.prepare("INSERT INTO sessions (token_hash, uid, expires_at) VALUES (?, ?, ?)").run(
    hashToken(token),
    uid,
    expiresAt,
  );
  return token;
}

export function findSession(db, token) {
  const tokenHash = hashToken(token);
  const user = db
    .prepare(
      `SELECT users.uid, users.email, users.name, users.role
       FROM sessions JOIN users ON users.uid = sessions.uid
       WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    )
    .get(tokenHash, new Date().toISOString());
  return user ? { tokenHash, user } : null;
}

export function deleteSession(db, tokenHash) {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function deleteExpiredSessions(db) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
}
