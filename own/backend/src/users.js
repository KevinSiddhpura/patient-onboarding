import { randomUUID } from "node:crypto";

export function insertUser(db, { email, name, role, passwordHash }) {
  const uid = randomUUID();
  db.prepare(
    "INSERT INTO users (uid, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)",
  ).run(uid, email.toLowerCase(), passwordHash, name, role);
  return uid;
}

export function removeUser(db, email) {
  const { changes } = db.prepare("DELETE FROM users WHERE email = ?").run(email.toLowerCase());
  return changes > 0;
}

export function findUserByEmail(db, email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
}

export function listUsers(db) {
  return db.prepare("SELECT email, name, role FROM users ORDER BY email").all();
}
