import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import { openDb } from "../src/config/db.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";
import { ApiError } from "../src/utils/ApiError.js";
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
