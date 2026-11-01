import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { setFlag } from "../src/routes/config.js";
import { api, signIn, startTestApp } from "./helpers.js";

const EXISTING = "existing-patient";
const OLD_TIME = "2026-01-01T00:00:00.000Z";
const VALID = { name: "Ravi Kumar", phone: "0987654321", condition: "Cough" };

let ctx;
let doctor;
let receptionist;

beforeEach(async () => {
  ctx = await startTestApp();
  doctor = (await signIn(ctx, { role: "doctor" })).cookie;
  receptionist = (await signIn(ctx, { role: "receptionist" })).cookie;
  insertPatient(EXISTING, OLD_TIME);
});

afterEach(async () => {
  await ctx.close();
});

function insertPatient(id, time) {
  ctx.db
    .prepare(
      `INSERT INTO patients (patient_id, name, phone, condition, created_at, updated_at)
       VALUES (?, 'Asha Rao', '+91 0123456789', 'Fever', ?, ?)`,
    )
    .run(id, time, time);
}

const list = (cookie) => api(ctx.baseUrl, "/api/patients", { cookie });
const create = (cookie, body = VALID) =>
  api(ctx.baseUrl, "/api/patients", { method: "POST", body, cookie });
const update = (cookie, body = VALID, id = EXISTING) =>
  api(ctx.baseUrl, `/api/patients/${id}`, { method: "PUT", body, cookie });
const remove = (cookie, id = EXISTING) =>
  api(ctx.baseUrl, `/api/patients/${id}`, { method: "DELETE", cookie });
const config = (cookie) => api(ctx.baseUrl, "/api/config", { cookie });

function assertDenied(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.json.error.code, code);
}

describe("roles", () => {
  test("signed out: every patient route returns 401", async () => {
    for (const response of [await list(), await create(), await update(), await remove()]) {
      assertDenied(response, 401, "unauthenticated");
    }
  });

  test("receptionist can create and list", async () => {
    assert.equal((await create(receptionist)).status, 201);
    assert.equal((await list(receptionist)).status, 200);
  });

  test("receptionist gets 403 on PUT and DELETE", async () => {
    assertDenied(await update(receptionist), 403, "permission-denied");
    assertDenied(await remove(receptionist), 403, "permission-denied");
    const { json } = await list(receptionist);
    assert.equal(json.find((patient) => patient.id === EXISTING).condition, "Fever");
  });

  test("doctor can list, edit and delete", async () => {
    assert.equal((await list(doctor)).status, 200);
    assert.equal((await update(doctor)).status, 200);
    assert.equal((await remove(doctor)).status, 204);
  });

  test("doctor gets 403 on POST", async () => {
    assertDenied(await create(doctor), 403, "permission-denied");
  });

  for (const role of ["admin", "Doctor", null]) {
    test(`role ${role}: 403 on list, create, edit, delete and config`, async () => {
      const { cookie } = await signIn(ctx, { role });
      for (const response of [
        await list(cookie),
        await create(cookie),
        await update(cookie),
        await remove(cookie),
        await config(cookie),
      ]) {
        assertDenied(response, 403, "permission-denied");
      }
    });
  }
});

describe("validation", () => {
  const badBodies = [
    ["an extra key", { ...VALID, notes: "extra" }],
    ["a missing key", { name: "Ravi", phone: "1" }],
    ["a non-string field", { ...VALID, phone: 987654321 }],
    ["empty text", { ...VALID, name: "" }],
    ["whitespace-only text", { ...VALID, condition: "   " }],
    ["untrimmed text", { ...VALID, name: " Ravi " }],
    ["a name over 100", { ...VALID, name: "a".repeat(101) }],
    ["a phone over 20", { ...VALID, phone: "1".repeat(21) }],
    ["a condition over 500", { ...VALID, condition: "a".repeat(501) }],
    ["an array body", []],
  ];

  for (const [label, body] of badBodies) {
    test(`POST rejects ${label}`, async () => {
      assertDenied(await create(receptionist, body), 400, "invalid-argument");
    });

    test(`PUT rejects ${label}`, async () => {
      assertDenied(await update(doctor, body), 400, "invalid-argument");
    });
  }

  test("accepts values exactly at the limits", async () => {
    const atLimit = { name: "a".repeat(100), phone: "1".repeat(20), condition: "a".repeat(500) };
    assert.equal((await create(receptionist, atLimit)).status, 201);
    assert.equal((await update(doctor, atLimit)).status, 200);
  });

  test("counts 100 Gujarati characters as 100 and rejects 101", async () => {
    assert.equal((await create(receptionist, { ...VALID, name: "આ".repeat(100) })).status, 201);
    assertDenied(await create(receptionist, { ...VALID, name: "આ".repeat(101) }), 400, "invalid-argument");
  });
});

describe("server-owned fields", () => {
  for (const key of ["patientId", "createdAt", "updatedAt"]) {
    test(`client-sent ${key} is rejected`, async () => {
      assertDenied(await create(receptionist, { ...VALID, [key]: "forged" }), 400, "invalid-argument");
      assertDenied(await update(doctor, { ...VALID, [key]: "forged" }), 400, "invalid-argument");
    });
  }

  test("POST returns the id and stores the patient with server timestamps", async () => {
    const before = Date.now();
    const { status, json } = await create(receptionist);
    const stored = (await list(receptionist)).json.find((patient) => patient.id === json.id);

    assert.equal(status, 201);
    assert.equal(stored.patientId, json.id);
    assert.equal(stored.name, VALID.name);
    assert.equal(stored.phone, VALID.phone);
    assert.equal(stored.condition, VALID.condition);
    assert.equal(stored.createdAt, stored.updatedAt);
    assert.equal(new Date(stored.createdAt).toISOString(), stored.createdAt);
    assert.ok(new Date(stored.createdAt).getTime() >= before);
  });

  test("PUT changes updatedAt and text but leaves patientId and createdAt alone", async () => {
    await update(doctor, { ...VALID, condition: "Recovered" });
    const { json } = await list(doctor);
    const patient = json.find((row) => row.id === EXISTING);

    assert.equal(patient.condition, "Recovered");
    assert.equal(patient.patientId, EXISTING);
    assert.equal(patient.createdAt, OLD_TIME);
    assert.ok(new Date(patient.updatedAt) > new Date(OLD_TIME));
  });
});

describe("other behaviour", () => {
  test("list is newest first and capped at 50", async () => {
    for (let index = 0; index < 51; index += 1) {
      const minute = String(index).padStart(2, "0");
      insertPatient(`p${index}`, `2026-02-01T${index < 26 ? "00" : "01"}:${minute}:00.000Z`);
    }

    const { json } = await list(doctor);

    assert.equal(json.length, 50);
    assert.equal(json[0].id, "p50");
    assert.equal(json.some((patient) => patient.id === EXISTING), false);
    const times = json.map((patient) => patient.createdAt);
    assert.deepEqual(times, [...times].sort().reverse());
  });

  test("patients created in the same millisecond keep a stable newest-first order", async () => {
    insertPatient("first", "2026-03-01T00:00:00.000Z");
    insertPatient("second", "2026-03-01T00:00:00.000Z");

    const { json } = await list(doctor);

    assert.deepEqual(json.slice(0, 2).map((patient) => patient.id), ["second", "first"]);
  });

  test("PUT on a missing patient returns 404 not-found", async () => {
    assertDenied(await update(doctor, VALID, "missing"), 404, "not-found");
  });

  test("DELETE on a missing patient returns 204", async () => {
    assert.equal((await remove(doctor, "missing")).status, 204);
  });

  test("config returns the flag to both roles", async () => {
    assert.deepEqual((await config(doctor)).json, { show_delete_button: false });
    setFlag(ctx.db, true);
    assert.deepEqual((await config(receptionist)).json, { show_delete_button: true });
  });

  test("config returns 401 when signed out", async () => {
    assertDenied(await config(), 401, "unauthenticated");
  });

  test("flag off does not block a doctor's direct DELETE", async () => {
    setFlag(ctx.db, false);
    assert.equal((await remove(doctor)).status, 204);
    const { json } = await list(doctor);
    assert.equal(json.some((patient) => patient.id === EXISTING), false);
  });
});
