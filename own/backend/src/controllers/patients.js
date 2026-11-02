import * as patients from "../services/patients.js";
import { ApiError } from "../utils/ApiError.js";
import { parsePatient } from "../validators/patient.js";

function broadcastChanged(req) {
  req.app.locals.events.broadcastChanged(req.get("x-client-id"));
}

export function listPatients(req, res) {
  res.json(patients.listPatients(req.app.locals.db));
}

export function createPatient(req, res) {
  const id = patients.createPatient(req.app.locals.db, parsePatient(req.body));
  broadcastChanged(req);
  res.status(201).json({ id });
}

export function updatePatient(req, res) {
  const updated = patients.updatePatient(req.app.locals.db, req.params.id, parsePatient(req.body));
  if (!updated) {
    throw new ApiError(404, "not-found");
  }
  broadcastChanged(req);
  res.json({ id: req.params.id });
}

export function deletePatient(req, res) {
  if (patients.deletePatient(req.app.locals.db, req.params.id)) {
    broadcastChanged(req);
  }
  res.status(204).end();
}
