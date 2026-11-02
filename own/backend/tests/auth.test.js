import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { hashPassword, isPasswordHash, verifyPassword } from "../src/services/passwords.js";
import { insertUser, removeUser } from "../src/services/users.js";
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

  test("an email over 254 characters returns 400 auth/invalid-email", async () => {
    const response = await login(`${"a".repeat(250)}@example.test`, TEST_PASSWORD);
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
