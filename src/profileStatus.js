import { AUTH_STATUS, ROLES } from "./constants.js";

const KNOWN_ROLES = Object.values(ROLES);

export function resolveProfileStatus(profile) {
  if (!profile) {
    return AUTH_STATUS.PROFILE_MISSING;
  }
  if (!KNOWN_ROLES.includes(profile.role)) {
    return AUTH_STATUS.ROLE_UNKNOWN;
  }
  return AUTH_STATUS.READY;
}
