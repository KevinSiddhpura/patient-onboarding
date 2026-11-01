import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import Database from "better-sqlite3";
import { formatUserAddCommand, runCommand } from "../src/commands.js";
import { openDb } from "../src/db.js";
import { hashPassword } from "../src/passwords.js";
import { createSession } from "../src/sessions.js";
import { findUserByEmail, insertUser } from "../src/users.js";
import { api, signIn, startTestApp, TEST_PASSWORD } from "./helpers.js";

const VALID_HASH = await hashPassword(TEST_PASSWORD);

let ctx;
let dataDir;
let output;

const run = (line) => runCommand(ctx.db, line, (text) => output.push(text), { dataDir });
const printed = () => output.join("\n");

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "own-commands-"));
  ctx = await startTestApp({ db: openDb(join(dataDir, "app.db")) });
  output = [];
});

afterEach(async () => {
  await ctx.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("flag", () => {
  test("flag prints the state", async () => {
    await run("flag");
    assert.match(printed(), /show_delete_button: off/);
  });

  test("flag on and flag off change what /config reads", async () => {
    const { cookie } = await signIn(ctx, { role: "doctor" });

    await run("flag on");
    assert.equal((await api(ctx.baseUrl, "/api/config", { cookie })).json.show_delete_button, true);

    await run("flag off");
    assert.equal((await api(ctx.baseUrl, "/api/config", { cookie })).json.show_delete_button, false);
  });
});

describe("user add", () => {
  test("creates a working login from a hash", async () => {
    await run(`user add doc@example.test doctor ${VALID_HASH} Asha`);

    const response = await api(ctx.baseUrl, "/api/auth/login", {
      method: "POST",
      body: { email: "doc@example.test", password: TEST_PASSWORD },
    });
    assert.equal(response.status, 200);
  });

  test("keeps a multi-word name", async () => {
    await run(`user add doc@example.test doctor ${VALID_HASH} Asha R. Rao`);
    assert.equal(findUserByEmail(ctx.db, "doc@example.test").name, "Asha R. Rao");
  });

  for (const [label, line] of [
    ["a bad role", `user add doc@example.test admin ${VALID_HASH} Asha`],
    ["a wrong-case role", `user add doc@example.test Doctor ${VALID_HASH} Asha`],
    ["a malformed hash", "user add doc@example.test doctor plaintext-password Asha"],
    ["an invalid email", `user add nope doctor ${VALID_HASH} Asha`],
    ["a missing name", `user add doc@example.test doctor ${VALID_HASH}`],
  ]) {
    test(`rejects ${label} without inserting`, async () => {
      await run(line);

      const { count } = ctx.db.prepare("SELECT COUNT(*) AS count FROM users").get();
      assert.equal(count, 0);
      assert.match(printed(), /usage|invalid/i);
    });
  }

  test("a rejected hash is not printed back", async () => {
    await run("user add doc@example.test doctor plaintext-password Asha");
    assert.equal(printed().includes("plaintext-password"), false);
  });

  test("a duplicate email prints a message", async () => {
    await run(`user add doc@example.test doctor ${VALID_HASH} Asha`);
    await run(`user add DOC@example.test receptionist ${VALID_HASH} Other`);

    assert.match(printed(), /already exists/);
    assert.equal(findUserByEmail(ctx.db, "doc@example.test").role, "doctor");
  });

  test("formatUserAddCommand output round-trips through runCommand", async () => {
    await run(
      formatUserAddCommand({
        email: "rec@example.test",
        role: "receptionist",
        name: "Ravi Kumar",
        passwordHash: VALID_HASH,
      }),
    );

    const user = findUserByEmail(ctx.db, "rec@example.test");
    assert.equal(user.name, "Ravi Kumar");
    assert.equal(user.role, "receptionist");
    assert.equal(user.password_hash, VALID_HASH);
  });
});

describe("user remove and list", () => {
  test("user remove deletes the user and their sessions", async () => {
    const uid = insertUser(ctx.db, {
      email: "doc@example.test",
      name: "Asha",
      role: "doctor",
      passwordHash: VALID_HASH,
    });
    createSession(ctx.db, uid);

    await run("user remove doc@example.test");

    assert.equal(findUserByEmail(ctx.db, "doc@example.test"), undefined);
    const { count } = ctx.db.prepare("SELECT COUNT(*) AS count FROM sessions").get();
    assert.equal(count, 0);
  });

  test("user remove closes that user's live update streams", async () => {
    const closed = [];
    insertUser(ctx.db, {
      email: "doc@example.test",
      name: "Asha",
      role: "doctor",
      passwordHash: VALID_HASH,
    });

    await runCommand(ctx.db, "user remove DOC@example.test", () => {}, {
      dataDir,
      events: { closeUser: (email) => closed.push(email) },
    });

    assert.deepEqual(closed, ["doc@example.test"]);
  });

  test("user remove on an unknown email prints a message", async () => {
    await run("user remove nobody@example.test");
    assert.match(printed(), /no user/i);
  });

  test("user list prints email, name and role but no hash", async () => {
    insertUser(ctx.db, {
      email: "doc@example.test",
      name: "Asha",
      role: "doctor",
      passwordHash: VALID_HASH,
    });

    await run("user list");

    assert.match(printed(), /doc@example\.test/);
    assert.match(printed(), /Asha/);
    assert.match(printed(), /doctor/);
    assert.equal(printed().includes("scrypt$"), false);
  });
});

describe("backup", () => {
  test("writes a readable copy under backups", async () => {
    await run("flag on");
    await run("backup");

    const [file] = readdirSync(join(dataDir, "backups"));
    const copy = new Database(join(dataDir, "backups", file), { readonly: true });
    const { value } = copy.prepare("SELECT value FROM config WHERE key = 'show_delete_button'").get();
    copy.close();

    assert.equal(value, "true");
  });

  test("a failed backup prints a message and does not reject", async () => {
    const memory = openDb(":memory:");
    await runCommand(memory, "backup", (text) => output.push(text), {
      dataDir: join(dataDir, "app.db", "not-a-directory"),
    });
    memory.close();

    assert.match(printed(), /backup failed/i);
  });
});

describe("bad input", () => {
  for (const line of ["nonsense", "flag maybe", "user", "user add", "user remove", "user nonsense"]) {
    test(`"${line}" prints usage and does not reject`, async () => {
      await run(line);
      assert.match(printed(), /usage|commands/i);
    });
  }

  for (const line of ["", "   "]) {
    test(`blank line ${JSON.stringify(line)} is ignored`, async () => {
      await run(line);
      assert.deepEqual(output, []);
    });
  }

  test("help lists the commands", async () => {
    await run("help");
    for (const word of ["flag", "user add", "user remove", "user list", "backup"]) {
      assert.match(printed(), new RegExp(word));
    }
  });

  test("a database error prints a message and does not reject", async () => {
    const closed = openDb(":memory:");
    closed.close();

    await runCommand(closed, "flag", (text) => output.push(text), { dataDir });

    assert.match(printed(), /failed/i);
  });
});
