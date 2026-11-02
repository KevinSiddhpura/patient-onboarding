import { ApiError } from "../utils/ApiError.js";

export function getProfile(req, res) {
  if (req.params.uid !== req.user.uid) {
    throw new ApiError(403, "permission-denied");
  }
  // A user with no role has no profile, which the frontend shows as "profile missing".
  const { name, role } = req.user;
  res.json(role === null ? null : { name, role });
}
