import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/config/db.js";
import { hashPassword } from "../src/services/passwords.js";
import { findUserByEmail, insertUser } from "../src/services/users.js";

const PASSWORD = "local-demo-password";
const ACCOUNTS = [
  { email: "receptionist@example.test", name: "Demo Receptionist", role: "receptionist" },
  { email: "doctor@example.test", name: "Demo Doctor", role: "doctor" },
];

// Same settings as the server, so the production check and the database path match it.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

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
