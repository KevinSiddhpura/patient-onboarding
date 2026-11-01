import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createLoginLimiter } from "../src/loginLimiter.js";
import { hashPassword, isPasswordHash, verifyPassword } from "../src/passwords.js";
import { insertUser, removeUser } from "../src/users.js";
import { api, signIn, startTestApp, TEST_PASSWORD } from "./helpers.js";

let ctx;

beforeEach(async () => {
  ctx = await startTestApp();
});

afterEach(async () => {
  await ctx.close();
});

const login = (email, password, options = {}) =>
  api(ctx.baseUrl, "/api/auth/login", { method: "POST", body: { email, password }, ...options });

async function addUser(email = "doc@example.test", role = "doctor") {
  return insertUser(ctx.db, {
    email,
    name: "Test User",
    role,
    passwordHash: await hashPassword(TEST_PASSWORD),
  });
}

const cookieFrom = (response) => response.setCookie.split(";")[0];

describe("passwords", () => {
  test("hashes are salted and verify only the right password", async () => {
    const first = await hashPassword("correct horse");
    const second = await hashPassword("correct horse");

    assert.notEqual(first, second);
    assert.equal(isPasswordHash(first), true);
    assert.equal(await verifyPassword("correct horse", first), true);
    assert.equal(await verifyPassword("wrong horse", first), false);
  });

  test("isPasswordHash rejects other strings", () => {
    for (const value of ["", "plain", "scrypt$zz$zz", "scrypt$abc", "md5$00$00"]) {
      assert.equal(isPasswordHash(value), false, value);
    }
  });
});

describe("login", () => {
  test("returns { uid, email } and sets the session cookie", async () => {
    const uid = await addUser();
    const response = await login("doc@example.test", TEST_PASSWORD);

    assert.equal(response.status, 200);
    assert.deepEqual(response.json, { uid, email: "doc@example.test" });
    assert.match(response.setCookie, /^session=/);
  });

  test("is case-insensitive on email", async () => {
    await addUser();
    const response = await login("DOC@Example.TEST", TEST_PASSWORD);
    assert.equal(response.status, 200);
  });

  test("unknown email and wrong password give identical 401 auth/invalid-credential bodies", async () => {
    await addUser();
    const unknown = await login("nobody@example.test", TEST_PASSWORD);
    const wrong = await login("doc@example.test", "wrong password");

    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(unknown.json.error.code, "auth/invalid-credential");
    assert.equal(unknown.text, wrong.text);
  });

  for (const email of ["nope", 42, null, {}]) {
    test(`email ${JSON.stringify(email)} returns 400 auth/invalid-email`, async () => {
      const response = await login(email, TEST_PASSWORD);
      assert.equal(response.status, 400);
      assert.equal(response.json.error.code, "auth/invalid-email");
    });
  }

  for (const password of [42, null, [], ""]) {
    test(`password ${JSON.stringify(password)} returns 401 auth/invalid-credential`, async () => {
      await addUser();
      const response = await login("doc@example.test", password);
      assert.equal(response.status, 401);
      assert.equal(response.json.error.code, "auth/invalid-credential");
    });
  }

  test("a non-object body returns 400 auth/invalid-email", async () => {
    const response = await api(ctx.baseUrl, "/api/auth/login", { method: "POST", raw: "[]" });
    assert.equal(response.status, 400);
    assert.equal(response.json.error.code, "auth/invalid-email");
  });
});

describe("session cookie", () => {
  test("has HttpOnly, SameSite=Strict and Path=/, without Secure in development", async () => {
    await addUser();
    const { setCookie } = await login("doc@example.test", TEST_PASSWORD);

    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.match(setCookie, /Path=\//i);
    assert.doesNotMatch(setCookie, /Secure/i);
  });

  test("has Secure when production is true", async () => {
    const production = await startTestApp({ production: true });
    try {
      await insertUser(production.db, {
        email: "doc@example.test",
        name: "Test User",
        role: "doctor",
        passwordHash: await hashPassword(TEST_PASSWORD),
      });
      const { setCookie } = await api(production.baseUrl, "/api/auth/login", {
        method: "POST",
        body: { email: "doc@example.test", password: TEST_PASSWORD },
      });
      assert.match(setCookie, /Secure/i);
    } finally {
      await production.close();
    }
  });

  test("database stores the token's hash, not the token", async () => {
    await addUser();
    const response = await login("doc@example.test", TEST_PASSWORD);
    const token = cookieFrom(response).split("=")[1];

    const { token_hash: stored } = ctx.db.prepare("SELECT token_hash FROM sessions").get();

    assert.ok(token.length > 0);
    assert.notEqual(stored, token);
  });

  test("session lasts 7 days", async () => {
    await addUser();
    await login("doc@example.test", TEST_PASSWORD);

    const { expires_at: expiresAt } = ctx.db.prepare("SELECT expires_at FROM sessions").get();
    const expected = Date.now() + 7 * 24 * 60 * 60 * 1000;

    assert.ok(Math.abs(new Date(expiresAt).getTime() - expected) < 60_000);
  });
});

describe("/auth/me and logout", () => {
  test("/auth/me returns { user } with a session", async () => {
    const { uid, cookie } = await signIn(ctx, { role: "doctor", email: "doc@example.test" });
    const response = await api(ctx.baseUrl, "/api/auth/me", { cookie });

    assert.equal(response.status, 200);
    assert.deepEqual(response.json, { user: { uid, email: "doc@example.test" } });
  });

  test("/auth/me returns { user: null } without a session", async () => {
    const response = await api(ctx.baseUrl, "/api/auth/me");
    assert.equal(response.status, 200);
    assert.deepEqual(response.json, { user: null });
  });

  test("a made-up session cookie is treated as no session", async () => {
    const response = await api(ctx.baseUrl, "/api/auth/me", { cookie: "session=made-up" });
    assert.deepEqual(response.json, { user: null });
  });

  test("logout invalidates the session and clears the cookie", async () => {
    const { cookie } = await signIn(ctx, { role: "doctor" });
    const response = await api(ctx.baseUrl, "/api/auth/logout", { method: "POST", cookie });

    assert.equal(response.status, 204);
    assert.match(response.setCookie, /^session=;/);
    const after = await api(ctx.baseUrl, "/api/auth/me", { cookie });
    assert.deepEqual(after.json, { user: null });
  });

  test("logout without a session returns 401 unauthenticated", async () => {
    const response = await api(ctx.baseUrl, "/api/auth/logout", { method: "POST" });
    assert.equal(response.status, 401);
    assert.equal(response.json.error.code, "unauthenticated");
  });

  test("expired session is rejected", async () => {
    const { uid, cookie } = await signIn(ctx, { role: "doctor" });
    ctx.db.prepare("UPDATE sessions SET expires_at = ?").run(new Date(Date.now() - 1000).toISOString());

    const profile = await api(ctx.baseUrl, `/api/users/${uid}`, { cookie });

    assert.equal(profile.status, 401);
    assert.equal(profile.json.error.code, "unauthenticated");
  });

  test("login removes expired rows", async () => {
    await signIn(ctx, { role: "doctor" });
    ctx.db.prepare("UPDATE sessions SET expires_at = ?").run(new Date(Date.now() - 1000).toISOString());

    await signIn(ctx, { role: "receptionist", email: "rec@example.test" });

    const { count } = ctx.db.prepare("SELECT COUNT(*) AS count FROM sessions").get();
    assert.equal(count, 1);
  });

  test("removing a user ends their session immediately", async () => {
    const { uid, cookie } = await signIn(ctx, { role: "doctor", email: "doc@example.test" });

    assert.equal(removeUser(ctx.db, "doc@example.test"), true);

    const response = await api(ctx.baseUrl, `/api/users/${uid}`, { cookie });
    assert.equal(response.status, 401);
  });
});

describe("login limit", () => {
  async function failTenTimes(options) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await login("doc@example.test", "wrong password", options);
    }
  }

  test("11th attempt after 10 failures returns 429, even with the right password", async () => {
    await addUser();
    await failTenTimes();

    const response = await login("doc@example.test", TEST_PASSWORD);

    assert.equal(response.status, 429);
    assert.equal(response.json.error.code, "auth/too-many-requests");
  });

  test("success clears the failure count", async () => {
    await addUser();
    for (let attempt = 0; attempt < 9; attempt += 1) {
      await login("doc@example.test", "wrong password");
    }
    await login("doc@example.test", TEST_PASSWORD);
    for (let attempt = 0; attempt < 9; attempt += 1) {
      await login("doc@example.test", "wrong password");
    }

    const response = await login("doc@example.test", TEST_PASSWORD);
    assert.equal(response.status, 200);
  });

  test("parallel wrong guesses cannot get past the limit", async () => {
    await addUser();

    const responses = await Promise.all(
      Array.from({ length: 30 }, () => login("doc@example.test", "wrong password")),
    );

    const checked = responses.filter((response) => response.status === 401);
    const blocked = responses.filter((response) => response.status === 429);
    assert.equal(checked.length, 10);
    assert.equal(blocked.length, 20);
  });

  test("a malformed password does not use up an attempt", async () => {
    await addUser();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await login("doc@example.test", "");
    }

    const response = await login("doc@example.test", TEST_PASSWORD);
    assert.equal(response.status, 200);
  });

  test("an email over 254 characters returns 400 auth/invalid-email", async () => {
    const response = await login(`${"a".repeat(250)}@example.test`, TEST_PASSWORD);
    assert.equal(response.status, 400);
    assert.equal(response.json.error.code, "auth/invalid-email");
  });

  test("limiter refuses after max attempts and unblocks after the window", () => {
    let time = 0;
    const limiter = createLoginLimiter({ max: 2, windowMs: 1000, now: () => time });

    assert.equal(limiter.tryAcquire("key"), true);
    assert.equal(limiter.tryAcquire("key"), true);
    assert.equal(limiter.tryAcquire("key"), false);

    time = 1001;
    assert.equal(limiter.tryAcquire("key"), true);
  });

  test("limiter forgets expired keys so memory does not grow forever", () => {
    let time = 0;
    const limiter = createLoginLimiter({ max: 2, windowMs: 1000, now: () => time });

    limiter.tryAcquire("old");
    time = 1001;
    limiter.tryAcquire("new");

    assert.equal(limiter.size(), 1);
  });

  test("limiter keeps at most maxKeys entries, dropping the oldest", () => {
    const limiter = createLoginLimiter({ max: 1, maxKeys: 2 });

    limiter.tryAcquire("first");
    limiter.tryAcquire("second");
    limiter.tryAcquire("third");

    assert.equal(limiter.size(), 2);
    assert.equal(limiter.tryAcquire("third"), false);
    assert.equal(limiter.tryAcquire("first"), true);
  });

  test("with proxySecret, different X-Forwarded-For values count separately", async () => {
    const proxied = await startTestApp({ proxySecret: "s3cret" });
    const send = (ip, password) =>
      api(proxied.baseUrl, "/api/auth/login", {
        method: "POST",
        body: { email: "doc@example.test", password },
        headers: { "X-Proxy-Secret": "s3cret", "X-Forwarded-For": ip },
      });
    try {
      await insertUser(proxied.db, {
        email: "doc@example.test",
        name: "Test User",
        role: "doctor",
        passwordHash: await hashPassword(TEST_PASSWORD),
      });
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await send("203.0.113.1", "wrong password");
      }

      assert.equal((await send("203.0.113.1", TEST_PASSWORD)).status, 429);
      assert.equal((await send("203.0.113.2", TEST_PASSWORD)).status, 200);
    } finally {
      await proxied.close();
    }
  });
});

describe("profiles", () => {
  test("GET /users/:uid returns own { name, role }", async () => {
    const { uid, cookie } = await signIn(ctx, { role: "doctor", name: "Dr Rao" });
    const response = await api(ctx.baseUrl, `/api/users/${uid}`, { cookie });

    assert.equal(response.status, 200);
    assert.deepEqual(response.json, { name: "Dr Rao", role: "doctor" });
  });

  test("GET /users/:uid for another uid returns 403 permission-denied", async () => {
    const other = await signIn(ctx, { role: "doctor", email: "other@example.test" });
    const { cookie } = await signIn(ctx, { role: "receptionist", email: "rec@example.test" });

    const response = await api(ctx.baseUrl, `/api/users/${other.uid}`, { cookie });

    assert.equal(response.status, 403);
    assert.equal(response.json.error.code, "permission-denied");
  });

  test("GET /users/:uid signed out returns 401", async () => {
    const { uid } = await signIn(ctx, { role: "doctor" });
    const response = await api(ctx.baseUrl, `/api/users/${uid}`);
    assert.equal(response.status, 401);
  });

  test("null role returns profile null", async () => {
    const { uid, cookie } = await signIn(ctx, { role: null });
    const response = await api(ctx.baseUrl, `/api/users/${uid}`, { cookie });

    assert.equal(response.status, 200);
    assert.equal(response.json, null);
  });

  test("wrong-case role is returned as stored", async () => {
    const { uid, cookie } = await signIn(ctx, { role: "Doctor" });
    const response = await api(ctx.baseUrl, `/api/users/${uid}`, { cookie });
    assert.equal(response.json.role, "Doctor");
  });
});
