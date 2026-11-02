import { PATIENT_LIST_LIMIT, ROLES } from "../constants.js";
import { useDeleteEnabled } from "../hooks/useDeleteEnabled.js";
import { usePatients } from "../hooks/usePatients.js";
import { useRemoteConfig } from "../hooks/useRemoteConfig.js";
import { createPatient } from "../services/patients.js";
import ConfigStatus from "./ConfigStatus.jsx";
import PatientForm from "./PatientForm.jsx";
import PatientList from "./PatientList.jsx";

// Controls shown per role are only a convenience; Firestore Rules enforce the same permissions.
export default function PatientsScreen({ role }) {
  const { status, patients, error } = usePatients();
  const config = useRemoteConfig();
  const deleteEnabled = useDeleteEnabled();

  const isReceptionist = role === ROLES.RECEPTIONIST;
  const isDoctor = role === ROLES.DOCTOR;
  const showDeleteButton = config.showDeleteButton && deleteEnabled;

  return (
    <main className="container">
      {isReceptionist && (
        <section className="card">
          <h2>Add Patient</h2>
          <PatientForm
            submitLabel="Add Patient"
            pendingLabel="Adding…"
            onSubmit={createPatient}
            clearOnSuccess
          />
        </section>
      )}

      <section className="card">
        <div className="section-heading">
          <h2>Patients</h2>
          {status === "ready" && (
            <span>
              {patients.length === PATIENT_LIST_LIMIT
                ? `Latest ${PATIENT_LIST_LIMIT}`
                : `${patients.length} total`}
            </span>
          )}
        </div>

        {isDoctor && (
          <ConfigStatus
            showDeleteButton={showDeleteButton}
            status={config.status}
            onRefresh={config.refresh}
          />
        )}

        <PatientList
          status={status}
          patients={patients}
          error={error}
          canEdit={isDoctor}
          canDelete={isDoctor && showDeleteButton}
        />
      </section>
    </main>
  );
}
