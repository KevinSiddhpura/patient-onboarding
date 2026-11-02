// Creates two local test users and their role profiles in the running emulators.
// These accounts exist only in the emulator; they are unrelated to the cloud project.

import { readFileSync } from "node:fs";

const AUTH_URL = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FIRESTORE_URL = "http://127.0.0.1:8080/v1";
const LOCAL_PASSWORD = "emulator-only-password";

const projectId = JSON.parse(readFileSync(".firebaserc", "utf8")).projects.default;

const TEST_USERS = [
  { email: "receptionist@example.test", name: "Local Receptionist", role: "receptionist" },
  { email: "doctor@example.test", name: "Local Doctor", role: "doctor" },
];

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: await response.json() };
}

async function ensureAuthUser(email) {
  const credentials = { email, password: LOCAL_PASSWORD, returnSecureToken: true };

  const created = await postJson(`${AUTH_URL}/accounts:signUp?key=local`, credentials);
  if (created.ok) {
    return created.data.localId;
  }

  const existing = await postJson(`${AUTH_URL}/accounts:signInWithPassword?key=local`, credentials);
  if (existing.ok) {
    return existing.data.localId;
  }

  throw new Error(`Could not create ${email}: ${JSON.stringify(created.data)}`);
}

// "Bearer owner" is the emulator's admin token; it bypasses Security Rules.
async function writeProfile(uid, { name, role }) {
  const url = `${FIRESTORE_URL}/projects/${projectId}/databases/(default)/documents/users/${uid}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({
      fields: { name: { stringValue: name }, role: { stringValue: role } },
    }),
  });

  if (!response.ok) {
    throw new Error(`Could not write profile for ${uid}: ${await response.text()}`);
  }
}

try {
  for (const user of TEST_USERS) {
    const uid = await ensureAuthUser(user.email);
    await writeProfile(uid, user);
    console.log(`${user.role}: ${user.email} (uid ${uid})`);
  }
  console.log(`Password for both local accounts: ${LOCAL_PASSWORD}`);
} catch (error) {
  console.error("Seeding failed. Are the emulators running (npm run emulators)?");
  console.error(error.message);
  process.exitCode = 1;
}
