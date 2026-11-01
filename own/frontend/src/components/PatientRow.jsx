import { useState } from "react";
import { describeError } from "../errors.js";
import { formatTimestamp } from "../formatters.js";
import { deletePatient, updatePatient } from "../services/patients.js";
import PatientForm from "./PatientForm.jsx";

export default function PatientRow({ patient, canEdit, canDelete }) {
  const [mode, setMode] = useState("view"); // "view" | "editing" | "confirmingDelete"
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const backToView = () => {
    setMode("view");
    setDeleteError("");
  };

  const handleSave = async (values) => {
    await updatePatient(patient.id, values);
    setMode("view");
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await deletePatient(patient.id);
      // On success the listener removes this row, so there is nothing to reset.
    } catch (error) {
      console.error("Deleting patient failed:", error);
      setDeleteError(describeError(error, "Could not delete the patient. Try again."));
      setDeleting(false);
    }
  };

  if (mode === "editing") {
    return (
      <div className="patient-card patient-card-editing">
        <PatientForm
          initialValues={{
            name: patient.name,
            phone: patient.phone,
            condition: patient.condition,
          }}
          submitLabel="Save changes"
          pendingLabel="Saving…"
          onSubmit={handleSave}
          onCancel={backToView}
        />
      </div>
    );
  }

  return (
    <div className="patient-card">
      <div>
        <h3>{patient.name}</h3>
        <p><strong>Phone:</strong> {patient.phone}</p>
        <p><strong>Condition:</strong> {patient.condition}</p>
        <small>
          Added {formatTimestamp(patient.createdAt)} · Updated {formatTimestamp(patient.updatedAt)}
        </small>
        {deleteError && <p className="message message-error" role="alert">{deleteError}</p>}
      </div>

      {mode === "confirmingDelete" && canDelete ? (
        <div className="patient-actions">
          <span>Delete this patient?</span>
          <button type="button" className="delete-button" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Yes, delete"}
          </button>
          <button type="button" className="secondary-button" onClick={backToView} disabled={deleting}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="patient-actions">
          {canEdit && (
            <button type="button" onClick={() => setMode("editing")}>Edit</button>
          )}
          {canDelete && (
            <button type="button" className="delete-button" onClick={() => setMode("confirmingDelete")}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
