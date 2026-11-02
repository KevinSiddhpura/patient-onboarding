import { randomUUID } from "node:crypto";
import { verifyPassword } from "./passwords.js";

export const VALID_ROLES = ["receptionist", "doctor"];

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export function isValidEmail(value) {
  return typeof value === "string" && value.length <= MAX_EMAIL_LENGTH && EMAIL_FORMAT.test(value);
}

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

export async function checkLogin(db, email, password) {
  const user = findUserByEmail(db, email);
  if (user && (await verifyPassword(password, user.password_hash))) {
    return user;
  }
  return null;
}
