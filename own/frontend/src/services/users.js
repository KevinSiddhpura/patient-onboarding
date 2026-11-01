import { apiRequest } from "./api.js";

export function fetchUserProfile(uid) {
  return apiRequest(`/users/${encodeURIComponent(uid)}`);
}
