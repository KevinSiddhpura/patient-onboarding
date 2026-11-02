import { randomUUID } from "node:crypto";

const PATIENT_LIST_LIMIT = 50;

function toPatient(row) {
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

export function listPatients(db) {
  const rows = db
    .prepare("SELECT * FROM patients ORDER BY created_at DESC, rowid DESC LIMIT ?")
    .all(PATIENT_LIST_LIMIT);
  return rows.map(toPatient);
}

export function createPatient(db, { name, phone, condition }) {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO patients (patient_id, name, phone, condition, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, name, phone, condition, now, now);

  return id;
}

export function updatePatient(db, id, { name, phone, condition }) {
  const { changes } = db
    .prepare(
      `UPDATE patients SET name = ?, phone = ?, condition = ?, updated_at = ?
       WHERE patient_id = ?`,
    )
    .run(name, phone, condition, new Date().toISOString(), id);
  return changes > 0;
}

export function deletePatient(db, id) {
  const { changes } = db.prepare("DELETE FROM patients WHERE patient_id = ?").run(id);
  return changes > 0;
}
