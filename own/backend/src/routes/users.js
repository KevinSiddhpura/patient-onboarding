import express from "express";
import { ApiError } from "../errors.js";
import { requireSession } from "../middleware.js";

export function createUsersRouter() {
  const router = express.Router();

  router.get("/:uid", requireSession, (req, res) => {
    if (req.params.uid !== req.user.uid) {
      throw new ApiError(403, "permission-denied");
    }
    // A user with no role has no profile, which the frontend shows as "profile missing".
    const { name, role } = req.user;
    res.json(role === null ? null : { name, role });
  });

  return router;
}
