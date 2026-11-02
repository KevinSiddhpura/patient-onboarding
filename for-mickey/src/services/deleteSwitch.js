import { doc, onSnapshot } from "firebase/firestore";
import { COLLECTIONS } from "../constants.js";
import { db } from "../firebase.js";

export function subscribeToDeleteEnabled(onChange) {
  return onSnapshot(
    doc(db, COLLECTIONS.CONFIG, "flags"),
    (snapshot) => onChange(snapshot.get("delete_enabled") === true),
    (error) => {
      console.error("Reading the delete switch failed:", error);
      onChange(false);
    },
  );
}
