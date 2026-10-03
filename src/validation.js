import { FIELD_LIMITS } from "./constants.js";

const FIELD_LABELS = {
  name: "Name",
  phone: "Phone",
  condition: "Condition",
};

// The same limits are enforced again in firestore.rules, because the UI can be bypassed.
export function validatePatient(input) {
  const values = {};
  const errors = {};

  for (const [field, maxLength] of Object.entries(FIELD_LIMITS)) {
    const value = String(input[field] ?? "").trim();
    values[field] = value;

    if (!value) {
      errors[field] = `${FIELD_LABELS[field]} is required.`;
    } else if (value.length > maxLength) {
      errors[field] = `${FIELD_LABELS[field]} must be ${maxLength} characters or fewer.`;
    }
  }

  return { values, errors, isValid: Object.keys(errors).length === 0 };
}
