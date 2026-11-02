import express from "express";
import { createPatient, deletePatient, listPatients, updatePatient } from "../controllers/patients.js";
import { requireRole, requireSession, requireStaff } from "../middlewares/auth.js";

const router = express.Router();

router.use(requireSession);

router.get("/", requireStaff, listPatients);
router.post("/", requireRole("receptionist"), createPatient);
router.put("/:id", requireRole("doctor"), updatePatient);
router.delete("/:id", requireRole("doctor"), deletePatient);

export default router;
