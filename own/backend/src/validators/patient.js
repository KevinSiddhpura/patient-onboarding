import { ApiError } from "../utils/ApiError.js";

const FIELD_LIMITS = {
  name: 100,
  phone: 20,
  condition: 500,
};

function isValidText(value, maxLength) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim()
  );
}

export function parsePatient(body) {
  const invalid = new ApiError(400, "invalid-argument");

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw invalid;
  }

  const fields = Object.keys(FIELD_LIMITS);
  if (Object.keys(body).length !== fields.length) {
    throw invalid;
  }

  for (const field of fields) {
    if (!isValidText(body[field], FIELD_LIMITS[field])) {
      throw invalid;
    }
  }

  return { name: body.name, phone: body.phone, condition: body.condition };
}
