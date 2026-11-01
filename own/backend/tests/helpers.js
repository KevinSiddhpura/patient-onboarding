import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { hashPassword } from "../src/passwords.js";
import { insertUser } from "../src/users.js";

export const TEST_PASSWORD = "test-password-123";

let testPasswordHash;
let userCount = 0;

// Rows go in directly because the app has no API for creating users.
export async function signIn(ctx, { email, role, name = "Test User" }) {
  testPasswordHash ??= await hashPassword(TEST_PASSWORD);
  userCount += 1;
  const userEmail = email ?? `user${userCount}@example.test`;
  const uid = insertUser(ctx.db, { email: userEmail, name, role, passwordHash: testPasswordHash });

  const response = await api(ctx.baseUrl, "/api/auth/login", {
    method: "POST",
    body: { email: userEmail, password: TEST_PASSWORD },
  });
  return { uid, cookie: response.setCookie.split(";")[0] };
}

export async function startTestApp(options = {}) {
  const db = options.db ?? openDb(":memory:");
  const app = createApp({ db, ...options });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    db,
    app,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      db.close();
    },
  };
}

export async function api(baseUrl, path, { method = "GET", body, raw, cookie, headers = {} } = {}) {
  const allHeaders = { ...headers };
  if (method !== "GET" && !("Content-Type" in allHeaders)) {
    allHeaders["Content-Type"] = "application/json";
  }
  if (cookie) {
    allHeaders.Cookie = cookie;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: allHeaders,
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await response.text();

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Static files and empty responses are not JSON.
  }

  return { status: response.status, json, text, setCookie: response.headers.get("set-cookie") };
}
