import assert from "node:assert/strict";
import { test } from "node:test";
import { describeError } from "../../src/errors.js";

test("maps known error codes", () => {
  assert.equal(describeError({ code: "auth/invalid-credential" }), "Incorrect email or password.");
  assert.equal(describeError({ code: "not-found" }), "This patient no longer exists.");
  assert.equal(describeError({ code: "delete-disabled" }), "Deleting patients is turned off right now.");
  assert.equal(describeError({ code: "permission-denied" }), "You do not have permission to do that.");
});

test("uses the fallback for unknown codes and non-errors", () => {
  assert.equal(describeError({ code: "weird" }, "Fallback."), "Fallback.");
  assert.equal(describeError(undefined, "Fallback."), "Fallback.");
  assert.equal(describeError(new Error("x")), "Something went wrong. Please try again.");
});
