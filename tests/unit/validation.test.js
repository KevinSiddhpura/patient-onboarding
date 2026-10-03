import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePatient } from "../../src/validation.js";

test("trims values and accepts valid input", () => {
  const result = validatePatient({ name: "  Asha Rao ", phone: " +91 0123 ", condition: " Fever " });
  assert.equal(result.isValid, true);
  assert.deepEqual(result.values, { name: "Asha Rao", phone: "+91 0123", condition: "Fever" });
  assert.deepEqual(result.errors, {});
});

test("keeps leading zeros and plus sign in phone", () => {
  const result = validatePatient({ name: "A", phone: "+0012", condition: "C" });
  assert.equal(result.values.phone, "+0012");
});

test("reports each empty or whitespace-only field", () => {
  const result = validatePatient({ name: "", phone: "   ", condition: undefined });
  assert.equal(result.isValid, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ["condition", "name", "phone"]);
  assert.equal(result.errors.name, "Name is required.");
});

test("reports fields over the length limit", () => {
  const result = validatePatient({ name: "a".repeat(101), phone: "1".repeat(21), condition: "a".repeat(501) });
  assert.equal(result.errors.name, "Name must be 100 characters or fewer.");
  assert.equal(result.errors.phone, "Phone must be 20 characters or fewer.");
  assert.equal(result.errors.condition, "Condition must be 500 characters or fewer.");
});

test("accepts fields exactly at the limit", () => {
  const result = validatePatient({ name: "a".repeat(100), phone: "1".repeat(20), condition: "a".repeat(500) });
  assert.equal(result.isValid, true);
});
