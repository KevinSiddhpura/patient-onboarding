import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";

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
