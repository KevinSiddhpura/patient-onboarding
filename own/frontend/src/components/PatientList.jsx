import PatientRow from "./PatientRow.jsx";

export default function PatientList({ status, patients, error, canEdit, canDelete }) {
  if (status === "loading") {
    return <p>Loading patients…</p>;
  }
  if (status === "error") {
    return <p className="message message-error" role="alert">{error}</p>;
  }
  if (patients.length === 0) {
    return <p>No patients yet.</p>;
  }

  return (
    <div className="patient-list">
      {patients.map((patient) => (
        <PatientRow
          key={patient.id}
          patient={patient}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      ))}
    </div>
  );
}
