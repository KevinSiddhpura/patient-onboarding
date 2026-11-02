import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { COLLECTIONS, PATIENT_LIST_LIMIT } from "../constants.js";
import { db } from "../firebase.js";

const patientsCollection = collection(db, COLLECTIONS.PATIENTS);

export async function createPatient({ name, phone, condition }) {
  // Reserve the ID first so it can be stored inside the document as well.
  const patientRef = doc(patientsCollection);

  await setDoc(patientRef, {
    patientId: patientRef.id,
    name,
    phone,
    condition,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return patientRef.id;
}

export function updatePatient(patientId, { name, phone, condition }) {
  return updateDoc(doc(patientsCollection, patientId), {
    name,
    phone,
    condition,
    updatedAt: serverTimestamp(),
  });
}

export function deletePatient(patientId) {
  return deleteDoc(doc(patientsCollection, patientId));
}

export function subscribeToPatients(onChange, onError) {
  const recentPatients = query(
    patientsCollection,
    orderBy("createdAt", "desc"),
    limit(PATIENT_LIST_LIMIT),
  );

  return onSnapshot(
    recentPatients,
    (snapshot) => {
      // "estimate" fills server timestamps the server has not confirmed yet.
      const patients = snapshot.docs.map((patientDoc) => ({
        id: patientDoc.id,
        ...patientDoc.data({ serverTimestamps: "estimate" }),
      }));
      onChange(patients);
    },
    onError,
  );
}
