import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTH_STATUS } from "../../src/constants.js";
import { resolveProfileStatus } from "../../src/profileStatus.js";

test("missing profile", () => {
  assert.equal(resolveProfileStatus(null), AUTH_STATUS.PROFILE_MISSING);
});

test("known roles are ready", () => {
  assert.equal(resolveProfileStatus({ name: "R", role: "receptionist" }), AUTH_STATUS.READY);
  assert.equal(resolveProfileStatus({ name: "D", role: "doctor" }), AUTH_STATUS.READY);
});

test("unknown, mis-cased, padded or absent roles are rejected", () => {
  for (const role of ["admin", "Doctor", " doctor", "", undefined, 42]) {
    assert.equal(resolveProfileStatus({ name: "X", role }), AUTH_STATUS.ROLE_UNKNOWN);
  }
});
