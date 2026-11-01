import { randomUUID } from "node:crypto";
import express from "express";
import { ApiError } from "../errors.js";
import { requireRole, requireSession } from "../middleware.js";
import { parsePatient } from "../validation.js";

const PATIENT_LIST_LIMIT = 50;

function toJson(row) {
  return {
    id: row.patient_id,
    patientId: row.patient_id,
    name: row.name,
    phone: row.phone,
    condition: row.condition,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function notifyClients(req) {
  req.app.locals.events?.broadcastChanged();
}

export function createPatientsRouter() {
  const router = express.Router();
  router.use(requireSession);

  router.get("/", requireRole("receptionist", "doctor"), (req, res) => {
    const rows = req.app.locals.db
      .prepare("SELECT * FROM patients ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(PATIENT_LIST_LIMIT);
    res.json(rows.map(toJson));
  });

  router.post("/", requireRole("receptionist"), (req, res) => {
    const { name, phone, condition } = parsePatient(req.body);
    const id = randomUUID();
    const now = new Date().toISOString();

    req.app.locals.db
      .prepare(
        `INSERT INTO patients (patient_id, name, phone, condition, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, name, phone, condition, now, now);

    notifyClients(req);
    res.status(201).json({ id });
  });

  router.put("/:id", requireRole("doctor"), (req, res) => {
    const { name, phone, condition } = parsePatient(req.body);

    const { changes } = req.app.locals.db
      .prepare(
        `UPDATE patients SET name = ?, phone = ?, condition = ?, updated_at = ?
         WHERE patient_id = ?`,
      )
      .run(name, phone, condition, new Date().toISOString(), req.params.id);

    if (changes === 0) {
      throw new ApiError(404, "not-found");
    }

    notifyClients(req);
    res.json({ id: req.params.id });
  });

  router.delete("/:id", requireRole("doctor"), (req, res) => {
    const { changes } = req.app.locals.db
      .prepare("DELETE FROM patients WHERE patient_id = ?")
      .run(req.params.id);

    if (changes > 0) {
      notifyClients(req);
    }
    res.status(204).end();
  });

  return router;
}
