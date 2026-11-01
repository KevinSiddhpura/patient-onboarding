import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createEventHub } from "../src/events.js";
import { api, signIn, startTestApp } from "./helpers.js";

const PATIENT = { name: "Ravi Kumar", phone: "0987654321", condition: "Cough" };

let ctx;
let doctor;
let receptionist;
const openStreams = [];

beforeEach(async () => {
  ctx = await startTestApp();
  doctor = (await signIn(ctx, { role: "doctor" })).cookie;
  receptionist = (await signIn(ctx, { role: "receptionist" })).cookie;
});

afterEach(async () => {
  for (const stream of openStreams.splice(0)) {
    stream.abort();
  }
  await ctx.close();
});

async function until(check, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) {
      return;
    }
    await delay(5);
  }
  assert.fail(`Timed out waiting for ${label}`);
}

async function openStream(cookie, target = ctx) {
  const controller = new AbortController();
  const response = await fetch(`${target.baseUrl}/api/events`, {
    headers: { Cookie: cookie },
    signal: controller.signal,
  });

  const stream = {
    response,
    text: "",
    ended: false,
    abort: () => controller.abort(),
  };
  openStreams.push(stream);

  (async () => {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of response.body) {
        stream.text += decoder.decode(chunk, { stream: true });
      }
    } catch {
      // Aborting the request rejects the read, which is how tests hang up.
    }
    stream.ended = true;
  })();

  return stream;
}

const changedCount = (stream) => stream.text.split("event: changed").length - 1;

describe("access", () => {
  test("signed out returns 401", async () => {
    const response = await api(ctx.baseUrl, "/api/events");
    assert.equal(response.status, 401);
    assert.equal(response.json.error.code, "unauthenticated");
  });

  test("an invalid role returns 403", async () => {
    const { cookie } = await signIn(ctx, { role: "admin" });
    const response = await api(ctx.baseUrl, "/api/events", { cookie });
    assert.equal(response.status, 403);
    assert.equal(response.json.error.code, "permission-denied");
  });
});

describe("stream", () => {
  test("has text/event-stream, Cache-Control no-cache and X-Accel-Buffering no", async () => {
    const { response } = await openStream(doctor);

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/event-stream/);
    assert.equal(response.headers.get("cache-control"), "no-cache");
    assert.equal(response.headers.get("x-accel-buffering"), "no");
  });

  test("create, edit and delete each send event: changed", async () => {
    const stream = await openStream(doctor);

    const { json } = await api(ctx.baseUrl, "/api/patients", {
      method: "POST",
      body: PATIENT,
      cookie: receptionist,
    });
    await until(() => changedCount(stream) === 1, "create event");

    await api(ctx.baseUrl, `/api/patients/${json.id}`, { method: "PUT", body: PATIENT, cookie: doctor });
    await until(() => changedCount(stream) === 2, "edit event");

    await api(ctx.baseUrl, `/api/patients/${json.id}`, { method: "DELETE", cookie: doctor });
    await until(() => changedCount(stream) === 3, "delete event");
  });

  test("a failed write sends nothing", async () => {
    const stream = await openStream(doctor);

    await api(ctx.baseUrl, "/api/patients", { method: "POST", body: { name: "" }, cookie: receptionist });
    await api(ctx.baseUrl, "/api/patients/missing", { method: "PUT", body: PATIENT, cookie: doctor });
    await api(ctx.baseUrl, "/api/patients/missing", { method: "DELETE", cookie: doctor });
    await delay(50);

    assert.equal(changedCount(stream), 0);
  });

  test("the event carries no patient data", async () => {
    const stream = await openStream(doctor);

    const { json } = await api(ctx.baseUrl, "/api/patients", {
      method: "POST",
      body: PATIENT,
      cookie: receptionist,
    });
    await until(() => changedCount(stream) === 1, "event");

    assert.equal(stream.text.includes(PATIENT.name), false);
    assert.equal(stream.text.includes(json.id), false);
  });

  test("heartbeat comments are sent", async () => {
    const quick = await startTestApp({ events: createEventHub({ heartbeatMs: 20 }) });
    try {
      const { cookie } = await signIn(quick, { role: "doctor" });
      const stream = await openStream(cookie, quick);
      await until(() => stream.text.includes(": ping"), "heartbeat");
      stream.abort();
    } finally {
      await quick.close();
    }
  });
});

describe("lifecycle", () => {
  test("logout closes that session's streams and leaves others open", async () => {
    const mine = await openStream(doctor);
    const theirs = await openStream(receptionist);

    await api(ctx.baseUrl, "/api/auth/logout", { method: "POST", cookie: doctor });

    await until(() => mine.ended, "the logged-out stream to end");
    assert.equal(theirs.ended, false);
    assert.equal(ctx.app.locals.events.size(), 1);
  });

  test("a disconnected client is removed", async () => {
    const stream = await openStream(doctor);
    assert.equal(ctx.app.locals.events.size(), 1);

    stream.abort();

    await until(() => ctx.app.locals.events.size() === 0, "the client to be removed");
  });

  test("closeAll ends every stream", async () => {
    const stream = await openStream(doctor);

    ctx.app.locals.events.closeAll();

    await until(() => stream.ended, "the stream to end");
    assert.equal(ctx.app.locals.events.size(), 0);
  });
});
