export const ROLES = {
  RECEPTIONIST: "receptionist",
  DOCTOR: "doctor",
};

export const COLLECTIONS = {
  USERS: "users",
  PATIENTS: "patients",
};

// Keep in step with isValidText() limits in firestore.rules.
export const FIELD_LIMITS = {
  name: 100,
  phone: 20,
  condition: 500,
};

export const PATIENT_LIST_LIMIT = 50;

export const AUTH_STATUS = {
  LOADING: "loading",
  SIGNED_OUT: "signedOut",
  PROFILE_MISSING: "profileMissing",
  ROLE_UNKNOWN: "roleUnknown",
  PROFILE_ERROR: "profileError",
  READY: "ready",
};

export const SHOW_DELETE_BUTTON_KEY = "show_delete_button";
