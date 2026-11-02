import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getFlag, setFlag } from "./services/config.js";
import { isPasswordHash } from "./services/passwords.js";
import { insertUser, isValidEmail, listUsers, removeUser, VALID_ROLES } from "./services/users.js";

const HELP = `Commands:
  flag                                          show the delete button flag
  flag on | flag off                            set the delete button flag
  user add <email> <role> <hash> <name...>      add a user (make the line with npm run user:hash)
  user remove <email>                           remove a user and their sessions
  user list                                     list users
  backup                                        write a copy of the database to data/backups
  help                                          show this list`;

const USER_ADD_USAGE = "Usage: user add <email> <role> <hash> <name...>";

function runFlag(db, [value], print) {
  if (value === undefined) {
    print(`show_delete_button: ${getFlag(db) ? "on" : "off"}`);
  } else if (value === "on" || value === "off") {
    setFlag(db, value === "on");
    print(`show_delete_button: ${value}`);
  } else {
    print("Usage: flag [on|off]");
  }
}

function runUserAdd(db, [email, role, passwordHash, ...nameParts], print) {
  if (nameParts.length === 0) {
    print(USER_ADD_USAGE);
  } else if (!isValidEmail(email)) {
    print("Invalid email.");
  } else if (!VALID_ROLES.includes(role)) {
    print(`Invalid role. Use one of: ${VALID_ROLES.join(", ")}.`);
  } else if (!isPasswordHash(passwordHash)) {
    // The value is not echoed, in case someone pasted a real password here.
    print("Invalid password hash. Make the line with npm run user:hash.");
  } else {
    try {
      insertUser(db, { email, role, passwordHash, name: nameParts.join(" ") });
      print(`Added ${email.toLowerCase()}.`);
    } catch (error) {
      if (error.code !== "SQLITE_CONSTRAINT_UNIQUE") {
        throw error;
      }
      print(`A user with email ${email.toLowerCase()} already exists.`);
    }
  }
}

function runUserRemove(db, [email], events, print) {
  if (email === undefined) {
    print("Usage: user remove <email>");
  } else if (removeUser(db, email)) {
    // The browser reconnects, gets a 401 and signs out, instead of staying on the patient list.
    events?.closeUser(email.toLowerCase());
    print(`Removed ${email.toLowerCase()}.`);
  } else {
    print(`No user with email ${email.toLowerCase()}.`);
  }
}

function runUserList(db, print) {
  const users = listUsers(db);
  if (users.length === 0) {
    print("No users.");
  }
  for (const { email, name, role } of users) {
    print(`${email}  ${role}  ${name}`);
  }
}

async function runBackup(db, dataDir, print) {
  const folder = join(dataDir, "backups");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(folder, `app-${stamp}.db`);
  try {
    mkdirSync(folder, { recursive: true });
    await db.backup(path);
    print(`Backup written to ${path}`);
  } catch (error) {
    print(`Backup failed: ${error.message}`);
  }
}

export async function runCommand(db, line, print, { dataDir, events }) {
  const [command, ...args] = line.trim().split(/\s+/);

  try {
    if (command === "") {
      return;
    } else if (command === "flag") {
      runFlag(db, args, print);
    } else if (command === "user" && args[0] === "add") {
      runUserAdd(db, args.slice(1), print);
    } else if (command === "user" && args[0] === "remove") {
      runUserRemove(db, args.slice(1), events, print);
    } else if (command === "user" && args[0] === "list") {
      runUserList(db, print);
    } else if (command === "backup") {
      await runBackup(db, dataDir, print);
    } else {
      print(HELP);
    }
  } catch (error) {
    print(`Command failed: ${error.message}`);
  }
}

export function formatUserAddCommand({ email, role, name, passwordHash }) {
  return `user add ${email} ${role} ${passwordHash} ${name}`;
}
