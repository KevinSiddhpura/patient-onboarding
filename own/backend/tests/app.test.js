import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import { openDb } from "../src/db.js";
import { ApiError, errorHandler } from "../src/errors.js";
import { api, startTestApp } from "./helpers.js";

let ctx;
let tempDir;

afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

function tempStaticDir() {
  tempDir = mkdtempSync(join(tmpdir(), "own-static-"));
  writeFileSync(join(tempDir, "index.html"), "<h1>app</h1>");
  writeFileSync(join(tempDir, "style.css"), "body{}");
  return tempDir;
}

function fakeResponse() {
  return {
    headersSent: false,
    status(code) {
      this.sentStatus = code;
      return this;
    },
    json(body) {
      this.sentBody = body;
    },
  };
}

describe("openDb", () => {
  test("seeds the flag off and is idempotent", () => {
    tempDir = mkdtempSync(join(tmpdir(), "own-db-"));
    const path = join(tempDir, "nested", "app.db");

    openDb(path).close();
    const db = openDb(path);
    const rows = db.prepare("SELECT value FROM config WHERE key = 'show_delete_button'").all();
    db.close();

    assert.deepEqual(rows.map((row) => row.value), ["false"]);
  });

  test("keeps a flag that was already changed", () => {
    tempDir = mkdtempSync(join(tmpdir(), "own-db-"));
    const path = join(tempDir, "app.db");

    const first = openDb(path);
    first.prepare("UPDATE config SET value = 'true' WHERE key = 'show_delete_button'").run();
    first.close();

    const db = openDb(path);
    const { value } = db.prepare("SELECT value FROM config WHERE key = 'show_delete_button'").get();
    db.close();

    assert.equal(value, "true");
  });

  test("turns on foreign keys", () => {
    const db = openDb(":memory:");
    assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
    db.close();
  });
});

describe("request handling", () => {
  test("unknown /api route returns JSON 404", async () => {
    ctx = await startTestApp({ staticDir: tempStaticDir() });
    const response = await api(ctx.baseUrl, "/api/nope");
    assert.equal(response.status, 404);
    assert.equal(response.json.error.code, "not-found");
  });

  test("invalid JSON returns 400 invalid-argument", async () => {
    ctx = await startTestApp();
    const response = await api(ctx.baseUrl, "/api/anything", { method: "POST", raw: "{oops" });
    assert.equal(response.status, 400);
    assert.equal(response.json.error.code, "invalid-argument");
  });

  test("JSON null body returns 400 invalid-argument", async () => {
    ctx = await startTestApp();
    const response = await api(ctx.baseUrl, "/api/anything", { method: "POST", raw: "null" });
    assert.equal(response.status, 400);
    assert.equal(response.json.error.code, "invalid-argument");
  });

  test("body over 10 KB returns 400 invalid-argument", async () => {
    ctx = await startTestApp();
    const response = await api(ctx.baseUrl, "/api/anything", {
      method: "POST",
      body: { name: "a".repeat(11 * 1024) },
    });
    assert.equal(response.status, 400);
    assert.equal(response.json.error.code, "invalid-argument");
  });

  test("non-GET without JSON content type returns 400 invalid-argument", async () => {
    ctx = await startTestApp();
    const response = await api(ctx.baseUrl, "/api/anything", {
      method: "POST",
      raw: "name=x",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    assert.equal(response.status, 400);
    assert.equal(response.json.error.code, "invalid-argument");
  });

  test("errorHandler turns an unexpected error into 500 internal with no stack in the body", (t) => {
    t.mock.method(console, "error", () => {});
    const res = fakeResponse();

    errorHandler(new Error("secret detail"), {}, res, () => {});

    assert.equal(res.sentStatus, 500);
    assert.deepEqual(res.sentBody, { error: { code: "internal" } });
  });

  test("errorHandler passes ApiError status and code through", () => {
    const res = fakeResponse();

    errorHandler(new ApiError(403, "permission-denied"), {}, res, () => {});

    assert.equal(res.sentStatus, 403);
    assert.deepEqual(res.sentBody, { error: { code: "permission-denied" } });
  });
});

describe("proxy secret", () => {
  test("a request without the header gets 403 permission-denied", async () => {
    ctx = await startTestApp({ proxySecret: "s3cret" });
    const response = await api(ctx.baseUrl, "/api/nope");
    assert.equal(response.status, 403);
    assert.equal(response.json.error.code, "permission-denied");
  });

  test("a wrong secret gets 403", async () => {
    ctx = await startTestApp({ proxySecret: "s3cret" });
    const response = await api(ctx.baseUrl, "/api/nope", { headers: { "X-Proxy-Secret": "wrong" } });
    assert.equal(response.status, 403);
  });

  test("the right secret passes", async () => {
    ctx = await startTestApp({ proxySecret: "s3cret" });
    const response = await api(ctx.baseUrl, "/api/nope", { headers: { "X-Proxy-Secret": "s3cret" } });
    assert.equal(response.status, 404);
  });

  test("static files are also blocked without the header", async () => {
    ctx = await startTestApp({ proxySecret: "s3cret", staticDir: tempStaticDir() });
    const response = await api(ctx.baseUrl, "/style.css");
    assert.equal(response.status, 403);
    assert.equal(response.text.includes("body{}"), false);
  });

  test("trust proxy is 1 with a secret", async () => {
    ctx = await startTestApp({ proxySecret: "s3cret" });
    assert.equal(ctx.app.get("trust proxy"), 1);
  });

  test("X-Forwarded-For is not trusted without a secret", async () => {
    ctx = await startTestApp();
    assert.equal(ctx.app.get("trust proxy"), false);
  });
});

describe("static files", () => {
  test("serves files from staticDir", async () => {
    ctx = await startTestApp({ staticDir: tempStaticDir() });
    const response = await api(ctx.baseUrl, "/style.css");
    assert.equal(response.status, 200);
    assert.equal(response.text, "body{}");
  });

  test("non-API paths return index.html", async () => {
    ctx = await startTestApp({ staticDir: tempStaticDir() });
    const response = await api(ctx.baseUrl, "/some/page");
    assert.equal(response.status, 200);
    assert.equal(response.text, "<h1>app</h1>");
  });
});
