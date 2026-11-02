import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
} from "firebase/firestore";

setLogLevel("error");

const RECEPTIONIST = "receptionist-uid";
const DOCTOR = "doctor-uid";
const NO_PROFILE = "no-profile-uid";
const BAD_ROLE = "bad-role-uid";
const WRONG_CASE_ROLE = "wrong-case-uid";
const EXISTING_PATIENT = "existing-patient";

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-patient-onboarding",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

after(async () => {
  await testEnv.cleanup();
});

// Seeding bypasses rules on purpose. Every assertion below uses a client identity.
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users", RECEPTIONIST), { name: "Test Receptionist", role: "receptionist" });
    await setDoc(doc(db, "users", DOCTOR), { name: "Test Doctor", role: "doctor" });
    await setDoc(doc(db, "users", BAD_ROLE), { name: "Intruder", role: "admin" });
    await setDoc(doc(db, "users", WRONG_CASE_ROLE), { name: "Typo", role: "Doctor" });
    await setDoc(doc(db, "patients", EXISTING_PATIENT), {
      patientId: EXISTING_PATIENT,
      name: "Asha Rao",
      phone: "+91 0123456789",
      condition: "Fever",
      createdAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
      updatedAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
    });
  });
});

const dbAs = (uid) => testEnv.authenticatedContext(uid).firestore();
const signedOutDb = () => testEnv.unauthenticatedContext().firestore();

function newPatient(id, overrides = {}) {
  return {
    patientId: id,
    name: "Ravi Kumar",
    phone: "0987654321",
    condition: "Cough",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

const createAs = (uid, id, overrides) =>
  setDoc(doc(dbAs(uid), "patients", id), newPatient(id, overrides));

const updateAs = (uid, changes) =>
  updateDoc(doc(dbAs(uid), "patients", EXISTING_PATIENT), changes);

const validEdit = { condition: "Recovered", updatedAt: serverTimestamp() };

const listPatients = (db) =>
  getDocs(query(collection(db, "patients"), orderBy("createdAt", "desc"), limit(50)));

describe("signed-out users", () => {
  test("cannot read patients", async () => {
    await assertFails(listPatients(signedOutDb()));
    await assertFails(getDoc(doc(signedOutDb(), "patients", EXISTING_PATIENT)));
  });

  test("cannot write patients", async () => {
    const db = signedOutDb();
    await assertFails(setDoc(doc(db, "patients", "p1"), newPatient("p1")));
    await assertFails(updateDoc(doc(db, "patients", EXISTING_PATIENT), validEdit));
    await assertFails(deleteDoc(doc(db, "patients", EXISTING_PATIENT)));
  });
});

describe("receptionist", () => {
  test("can create a patient", async () => {
    await assertSucceeds(createAs(RECEPTIONIST, "p1"));
  });

  test("can read the patient list", async () => {
    await assertSucceeds(listPatients(dbAs(RECEPTIONIST)));
  });

  test("cannot edit a patient", async () => {
    await assertFails(updateAs(RECEPTIONIST, validEdit));
  });

  test("cannot delete a patient", async () => {
    await assertFails(deleteDoc(doc(dbAs(RECEPTIONIST), "patients", EXISTING_PATIENT)));
  });
});

describe("doctor", () => {
  test("can read the patient list", async () => {
    await assertSucceeds(listPatients(dbAs(DOCTOR)));
  });

  test("can edit name, phone and condition", async () => {
    await assertSucceeds(
      updateAs(DOCTOR, {
        name: "Asha R. Rao",
        phone: "+91 1112223334",
        condition: "Recovered",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  test("can delete a patient", async () => {
    await assertSucceeds(deleteDoc(doc(dbAs(DOCTOR), "patients", EXISTING_PATIENT)));
  });

  test("cannot create a patient (documented policy)", async () => {
    await assertFails(createAs(DOCTOR, "p1"));
  });
});

describe("users without a valid role", () => {
  for (const [label, uid] of [
    ["no profile", NO_PROFILE],
    ["unknown role", BAD_ROLE],
    ["wrong-case role", WRONG_CASE_ROLE],
  ]) {
    test(`${label}: cannot read or write patients`, async () => {
      await assertFails(listPatients(dbAs(uid)));
      await assertFails(createAs(uid, "p1"));
      await assertFails(updateAs(uid, validEdit));
      await assertFails(deleteDoc(doc(dbAs(uid), "patients", EXISTING_PATIENT)));
    });
  }
});

describe("patient create validation", () => {
  test("rejects an extra key", async () => {
    await assertFails(createAs(RECEPTIONIST, "p1", { notes: "extra" }));
  });

  test("rejects a missing key", async () => {
    const patient = newPatient("p1");
    delete patient.condition;
    await assertFails(setDoc(doc(dbAs(RECEPTIONIST), "patients", "p1"), patient));
  });

  test("rejects a non-string field", async () => {
    await assertFails(createAs(RECEPTIONIST, "p1", { phone: 987654321 }));
  });

  test("rejects empty and whitespace-only text", async () => {
    await assertFails(createAs(RECEPTIONIST, "p1", { name: "" }));
    await assertFails(createAs(RECEPTIONIST, "p2", { condition: "   " }));
  });

  test("rejects untrimmed text", async () => {
    await assertFails(createAs(RECEPTIONIST, "p1", { name: " Ravi " }));
  });

  test("rejects text over the length limit", async () => {
    await assertFails(createAs(RECEPTIONIST, "p1", { name: "a".repeat(101) }));
    await assertFails(createAs(RECEPTIONIST, "p2", { phone: "1".repeat(21) }));
    await assertFails(createAs(RECEPTIONIST, "p3", { condition: "a".repeat(501) }));
  });

  test("accepts text exactly at the length limit", async () => {
    await assertSucceeds(
      createAs(RECEPTIONIST, "p1", {
        name: "a".repeat(100),
        phone: "1".repeat(20),
        condition: "a".repeat(500),
      }),
    );
  });

  test("counts characters, not bytes, for non-ASCII text", async () => {
    await assertSucceeds(createAs(RECEPTIONIST, "p1", { name: "આ".repeat(100) }));
    await assertFails(createAs(RECEPTIONIST, "p2", { name: "આ".repeat(101) }));
  });

  test("rejects a patientId that differs from the document ID", async () => {
    await assertFails(createAs(RECEPTIONIST, "p1", { patientId: "someone-else" }));
  });

  test("rejects forged timestamps", async () => {
    const forged = Timestamp.fromDate(new Date("2020-01-01T00:00:00Z"));
    await assertFails(createAs(RECEPTIONIST, "p1", { createdAt: forged }));
    await assertFails(createAs(RECEPTIONIST, "p2", { updatedAt: forged }));
  });
});

describe("patient update validation", () => {
  test("rejects a change to createdAt", async () => {
    await assertFails(updateAs(DOCTOR, { ...validEdit, createdAt: serverTimestamp() }));
  });

  test("rejects a change to patientId", async () => {
    await assertFails(updateAs(DOCTOR, { ...validEdit, patientId: "other" }));
  });

  test("rejects an extra key", async () => {
    await assertFails(updateAs(DOCTOR, { ...validEdit, notes: "extra" }));
  });

  test("rejects a forged or missing updatedAt", async () => {
    const forged = Timestamp.fromDate(new Date("2020-01-01T00:00:00Z"));
    await assertFails(updateAs(DOCTOR, { condition: "Recovered", updatedAt: forged }));
    await assertFails(updateAs(DOCTOR, { condition: "Recovered" }));
  });

  test("rejects blank or over-length text", async () => {
    await assertFails(updateAs(DOCTOR, { name: "", updatedAt: serverTimestamp() }));
    await assertFails(updateAs(DOCTOR, { name: "a".repeat(101), updatedAt: serverTimestamp() }));
  });

  test("rejects untrimmed, non-string and over-length values", async () => {
    await assertFails(updateAs(DOCTOR, { name: " Asha ", updatedAt: serverTimestamp() }));
    await assertFails(updateAs(DOCTOR, { phone: 12345, updatedAt: serverTimestamp() }));
    await assertFails(updateAs(DOCTOR, { phone: "1".repeat(21), updatedAt: serverTimestamp() }));
    await assertFails(updateAs(DOCTOR, { condition: "a".repeat(501), updatedAt: serverTimestamp() }));
  });

  test("rejects deleting a field", async () => {
    await assertFails(updateAs(DOCTOR, { condition: deleteField(), updatedAt: serverTimestamp() }));
  });

  test("rejects a full overwrite that omits patientId", async () => {
    await assertFails(
      setDoc(doc(dbAs(DOCTOR), "patients", EXISTING_PATIENT), {
        name: "Asha Rao",
        phone: "+91 0123456789",
        condition: "Fever",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe("user profiles", () => {
  test("a user can read their own profile", async () => {
    await assertSucceeds(getDoc(doc(dbAs(RECEPTIONIST), "users", RECEPTIONIST)));
  });

  test("a user cannot read another profile or list profiles", async () => {
    await assertFails(getDoc(doc(dbAs(RECEPTIONIST), "users", DOCTOR)));
    await assertFails(getDocs(collection(dbAs(RECEPTIONIST), "users")));
  });

  test("a user cannot give themselves a role", async () => {
    await assertFails(setDoc(doc(dbAs(NO_PROFILE), "users", NO_PROFILE), { name: "Me", role: "doctor" }));
    await assertFails(updateDoc(doc(dbAs(RECEPTIONIST), "users", RECEPTIONIST), { role: "doctor" }));
  });

  test("a user cannot delete a profile", async () => {
    await assertFails(deleteDoc(doc(dbAs(DOCTOR), "users", DOCTOR)));
  });

  test("signed-out users cannot read profiles", async () => {
    await assertFails(getDoc(doc(signedOutDb(), "users", DOCTOR)));
  });
});

describe("unspecified collections", () => {
  test("are denied even to a doctor", async () => {
    await assertFails(getDoc(doc(dbAs(DOCTOR), "appointments", "a1")));
    await assertFails(setDoc(doc(dbAs(DOCTOR), "appointments", "a1"), { when: "now" }));
  });
});
