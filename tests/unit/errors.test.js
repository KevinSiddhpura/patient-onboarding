import assert from "node:assert/strict";
import { test } from "node:test";
import { describeError } from "../../src/errors.js";

test("maps known Firebase codes", () => {
  assert.equal(describeError({ code: "auth/invalid-credential" }), "Incorrect email or password.");
  assert.equal(describeError({ code: "auth/wrong-password" }), "Incorrect email or password.");
  assert.equal(describeError({ code: "auth/user-not-found" }), "Incorrect email or password.");
  assert.equal(describeError({ code: "permission-denied" }), "You do not have permission to do that.");
});

test("uses the fallback for unknown codes and non-errors", () => {
  assert.equal(describeError({ code: "weird" }, "Fallback."), "Fallback.");
  assert.equal(describeError(undefined, "Fallback."), "Fallback.");
  assert.equal(describeError(new Error("x")), "Something went wrong. Please try again.");
});
