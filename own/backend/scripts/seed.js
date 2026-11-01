import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/db.js";
import { hashPassword } from "../src/passwords.js";
import { findUserByEmail, insertUser } from "../src/users.js";

const PASSWORD = "local-demo-password";
const ACCOUNTS = [
  { email: "receptionist@example.test", name: "Demo Receptionist", role: "receptionist" },
  { email: "doctor@example.test", name: "Demo Doctor", role: "doctor" },
];

if (process.env.NODE_ENV === "production") {
  console.error("Seed is for local development only.");
  process.exit(1);
}

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const db = openDb(join(resolve(backendRoot, process.env.DATA_DIR || "data"), "app.db"));
const passwordHash = await hashPassword(PASSWORD);

for (const account of ACCOUNTS) {
  if (!findUserByEmail(db, account.email)) {
    insertUser(db, { ...account, passwordHash });
  }
  console.log(`${account.email} (${account.role})`);
}
console.log(`Password: ${PASSWORD}`);

db.close();
