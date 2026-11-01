import { apiRequest } from "./api.js";

const RECONNECT_DELAY_MS = 5000;

let subscription = null;

// formatTimestamp expects objects with toDate().
function toTimestamp(iso) {
  return { toDate: () => new Date(iso) };
}

function toPatient(row) {
  return {
    ...row,
    createdAt: toTimestamp(row.createdAt),
    updatedAt: toTimestamp(row.updatedAt),
  };
}

async function loadPatients(sub) {
  sub.lastRequest += 1;
  const request = sub.lastRequest;
  const isStale = () => sub.closed || request !== sub.lastRequest;

  try {
    const rows = await apiRequest("/patients");
    if (!isStale()) {
      sub.patients = rows.map(toPatient);
      sub.loaded = true;
      sub.onChange(sub.patients);
    }
  } catch (error) {
    if (isStale()) {
      return;
    }
    // Once there is a list on screen, keep showing it. The next event fetches it again.
    if (sub.loaded) {
      console.error("Could not refresh patients:", error);
    } else {
      sub.onError(error);
    }
  }
}

function openEvents(sub) {
  const source = new EventSource("/api/events");
  sub.source = source;

  source.addEventListener("changed", () => loadPatients(sub));
  source.addEventListener("open", () => loadPatients(sub));
  source.addEventListener("error", () => {
    // The browser retries network drops itself, but gives up for good on a 401 or a 502.
    if (source.readyState === EventSource.CLOSED) {
      loadPatients(sub);
      sub.reconnectTimer = setTimeout(() => openEvents(sub), RECONNECT_DELAY_MS);
    }
  });
}

export async function createPatient({ name, phone, condition }) {
  const { id } = await apiRequest("/patients", {
    method: "POST",
    body: { name, phone, condition },
  });
  if (subscription) {
    await loadPatients(subscription);
  }
  return id;
}

export async function updatePatient(patientId, { name, phone, condition }) {
  await apiRequest(`/patients/${encodeURIComponent(patientId)}`, {
    method: "PUT",
    body: { name, phone, condition },
  });
  if (subscription) {
    await loadPatients(subscription);
  }
}

export async function deletePatient(patientId) {
  await apiRequest(`/patients/${encodeURIComponent(patientId)}`, { method: "DELETE" });
  if (subscription) {
    // PatientRow stays on "Deleting…" until its row goes, so don't depend on the refresh working.
    subscription.patients = subscription.patients.filter((patient) => patient.id !== patientId);
    subscription.onChange(subscription.patients);
    await loadPatients(subscription);
  }
}

export function subscribeToPatients(onChange, onError) {
  const sub = {
    onChange,
    onError,
    patients: [],
    loaded: false,
    closed: false,
    lastRequest: 0,
    source: null,
    reconnectTimer: null,
  };
  subscription = sub;

  loadPatients(sub);
  openEvents(sub);

  return () => {
    sub.closed = true;
    sub.source.close();
    clearTimeout(sub.reconnectTimer);
    if (subscription === sub) {
      subscription = null;
    }
  };
}
