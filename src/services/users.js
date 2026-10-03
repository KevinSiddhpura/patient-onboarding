import { doc, getDoc } from "firebase/firestore";
import { COLLECTIONS } from "../constants.js";
import { db } from "../firebase.js";

export async function fetchUserProfile(uid) {
  const snapshot = await getDoc(doc(db, COLLECTIONS.USERS, uid));
  return snapshot.exists() ? snapshot.data() : null;
}
