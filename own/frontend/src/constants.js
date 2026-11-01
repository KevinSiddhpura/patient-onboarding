export const ROLES = {
  RECEPTIONIST: "receptionist",
  DOCTOR: "doctor",
};

// Keep in step with FIELD_LIMITS in the backend's validation.js.
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
  SERVER_ERROR: "serverError",
  READY: "ready",
};

export const SHOW_DELETE_BUTTON_KEY = "show_delete_button";
