import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTimestamp } from "../../src/formatters.js";

test("formats a Firestore-style timestamp", () => {
  const date = new Date("2026-10-03T10:00:00Z");
  assert.equal(formatTimestamp({ toDate: () => date }), date.toLocaleString());
});

test("shows a placeholder for pending or absent timestamps", () => {
  for (const value of [null, undefined, {}, "2026-10-03"]) {
    assert.equal(formatTimestamp(value), "Pending…");
  }
});
