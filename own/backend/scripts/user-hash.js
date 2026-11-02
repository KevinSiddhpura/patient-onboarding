import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { formatUserAddCommand } from "../src/commands.js";
import { hashPassword } from "../src/services/passwords.js";
import { isValidEmail, VALID_ROLES } from "../src/services/users.js";

const MIN_PASSWORD_LENGTH = 8;

let hideTyping = false;
const terminalOutput = new Writable({
  write(chunk, encoding, done) {
    if (!hideTyping) {
      process.stdout.write(chunk);
    }
    done();
  },
});

const reader = createInterface({
  input: process.stdin,
  output: terminalOutput,
  terminal: Boolean(process.stdin.isTTY),
});
const lines = reader[Symbol.asyncIterator]();

async function ask(label, { hidden = false } = {}) {
  process.stdout.write(`${label}: `);
  hideTyping = hidden;
  const { value = "" } = await lines.next();
  hideTyping = false;
  if (hidden) {
    process.stdout.write("\n");
  }
  return value;
}

function stop(message) {
  console.error(message);
  process.exit(1);
}

const email = (await ask("Email")).trim();
if (!isValidEmail(email)) {
  stop("Invalid email.");
}

const role = (await ask(`Role (${VALID_ROLES.join(" or ")})`)).trim();
if (!VALID_ROLES.includes(role)) {
  stop("Invalid role.");
}

const name = (await ask("Name")).trim().replace(/\s+/g, " ");
if (!name) {
  stop("Name is required.");
}

const password = await ask("Password", { hidden: true });
if (password.length < MIN_PASSWORD_LENGTH) {
  stop(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
}

const confirmation = await ask("Password again", { hidden: true });
if (password !== confirmation) {
  stop("Passwords do not match.");
}

const passwordHash = await hashPassword(password);
reader.close();

console.log("\nPaste this line into the panel console:\n");
console.log(formatUserAddCommand({ email, role, name, passwordHash }));
