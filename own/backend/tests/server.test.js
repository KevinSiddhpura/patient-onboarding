import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, test } from "node:test";
import { openDb } from "../src/config/db.js";
import { findUserByEmail } from "../src/services/users.js";

const SERVER = resolve("src/server.js");

let dataDir;
let children;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "own-server-"));
  children = [];
});

afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
  }
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

function runNode(script, env = {}, cwd = undefined) {
  const child = spawn(process.execPath, [script], {
    cwd,
    env: { ...process.env, NODE_ENV: "test", DATA_DIR: dataDir, PORT: "", SERVER_PORT: "", ...env },
  });
  children.push(child);

  const state = { child, stdout: "", stderr: "" };
  child.stdout.on("data", (chunk) => {
    state.stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    state.stderr += chunk;
  });
  state.exited = new Promise((resolve) => child.once("exit", (code) => resolve(code)));
  return state;
}

async function until(check, label) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (check()) {
      return;
    }
    await delay(10);
  }
  assert.fail(`Timed out waiting for ${label}`);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startServer(env = {}) {
  const port = env.PORT || env.SERVER_PORT ? null : await freePort();
  const state = runNode("src/server.js", port ? { PORT: String(port), ...env } : env);
  await until(() => state.stdout.includes("Listening") || state.child.exitCode !== null, "the server");
  return state;
}

const isUp = async (port) => (await fetch(`http://127.0.0.1:${port}/api/auth/me`)).status === 200;
const portOf = (state) => Number(state.stdout.match(/Listening on port (\d+)/)[1]);

describe("server", () => {
  test("reads settings from a .env file in the working directory", async () => {
    const port = await freePort();
    writeFileSync(join(dataDir, ".env"), "NODE_ENV=production\n");

    const state = runNode(SERVER, { NODE_ENV: undefined, PORT: String(port) }, dataDir);
    await until(() => state.stdout.includes("Listening") || state.child.exitCode !== null, "the server");

    assert.equal(await isUp(port), true);
    assert.doesNotMatch(state.stderr, /not production/i);
  });

  test("warns when it is not running in production mode", async () => {
    const state = await startServer();
    assert.match(state.stderr, /not production/i);
  });

  test("does not warn in production mode", async () => {
    const state = await startServer({ NODE_ENV: "production" });
    assert.doesNotMatch(state.stderr, /not production/i);
  });

  test("a port already in use reports EADDRINUSE", async () => {
    const blocker = createServer();
    await new Promise((resolve) => blocker.listen(0, "0.0.0.0", resolve));
    try {
      const state = runNode(SERVER, { PORT: String(blocker.address().port) });

      assert.notEqual(await state.exited, 0);
      assert.match(state.stderr, /EADDRINUSE/);
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });

  test("uses PORT ahead of SERVER_PORT", async () => {
    const [port, other] = [await freePort(), await freePort()];
    const state = await startServer({ PORT: String(port), SERVER_PORT: String(other) });
    assert.equal(portOf(state), port);
    assert.equal(await isUp(port), true);
  });

  test("falls back to SERVER_PORT", async () => {
    const port = await freePort();
    const state = await startServer({ SERVER_PORT: String(port) });
    assert.equal(portOf(state), port);
  });

  test("a command on stdin takes effect", async () => {
    const state = await startServer();

    state.child.stdin.write("flag on\nflag\n");

    await until(() => state.stdout.includes("show_delete_button: on"), "the flag output");
  });

  test("a bad command leaves the server up", async () => {
    const state = await startServer();

    state.child.stdin.write("nonsense\nuser add\n");

    await until(() => /commands/i.test(state.stdout), "the usage output");
    assert.equal(await isUp(portOf(state)), true);
  });

  test("closed stdin does not stop the server", async () => {
    const state = await startServer();

    state.child.stdin.end();
    await delay(100);

    assert.equal(state.child.exitCode, null);
    assert.equal(await isUp(portOf(state)), true);
  });

  test("SIGTERM exits cleanly", { skip: process.platform === "win32" }, async () => {
    const state = await startServer();

    state.child.kill("SIGTERM");

    assert.equal(await state.exited, 0);
  });
});

describe("seed", () => {
  test("refuses to run with NODE_ENV=production", async () => {
    const state = runNode("scripts/seed.js", { NODE_ENV: "production" });

    assert.equal(await state.exited, 1);
    const db = openDb(join(dataDir, "app.db"));
    assert.equal(findUserByEmail(db, "doctor@example.test"), undefined);
    db.close();
  });

  test("refuses to run when a .env file sets production", async () => {
    writeFileSync(join(dataDir, ".env"), "NODE_ENV=production\n");

    const state = runNode(resolve("scripts/seed.js"), { NODE_ENV: undefined }, dataDir);

    assert.equal(await state.exited, 1);
  });

  test("creates both accounts, prints the password, and can run twice", async () => {
    const first = runNode("scripts/seed.js");
    assert.equal(await first.exited, 0);
    const second = runNode("scripts/seed.js");
    assert.equal(await second.exited, 0);

    const db = openDb(join(dataDir, "app.db"));
    assert.equal(findUserByEmail(db, "doctor@example.test").role, "doctor");
    assert.equal(findUserByEmail(db, "receptionist@example.test").role, "receptionist");
    db.close();
    assert.match(first.stdout, /[Pp]assword/);
  });
});

describe("user-hash script", () => {
  const PASSWORD = "a-long-secret-password";

  function runHashScript(lines) {
    const state = runNode("scripts/user-hash.js");
    state.child.stdin.end(`${lines.join("\n")}\n`);
    return state;
  }

  test("prints a user add line and never the password", async () => {
    const state = runHashScript(["doc@example.test", "doctor", "Asha Rao", PASSWORD, PASSWORD]);

    assert.equal(await state.exited, 0);
    assert.match(state.stdout, /user add doc@example\.test doctor scrypt\$[0-9a-f$]+ Asha Rao/);
    assert.equal(state.stdout.includes(PASSWORD), false);
    assert.equal(state.stderr.includes(PASSWORD), false);
  });

  for (const [label, lines] of [
    ["an invalid email", ["nope", "doctor", "Asha", PASSWORD, PASSWORD]],
    ["a bad role", ["doc@example.test", "admin", "Asha", PASSWORD, PASSWORD]],
    ["an empty name", ["doc@example.test", "doctor", "", PASSWORD, PASSWORD]],
    ["a short password", ["doc@example.test", "doctor", "Asha", "short", "short"]],
    ["mismatched passwords", ["doc@example.test", "doctor", "Asha", PASSWORD, "different-password"]],
  ]) {
    test(`exits 1 on ${label}`, async () => {
      const state = runHashScript(lines);

      assert.equal(await state.exited, 1);
      assert.equal(state.stdout.includes("user add"), false);
    });
  }
});
