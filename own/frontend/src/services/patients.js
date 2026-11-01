import { apiRequest } from "./api.js";

const RECONNECT_DELAY_MS = 5000;

// Identifies this tab, so the server doesn't send it events for its own writes.
const clientId = crypto.randomUUID();
const CLIENT_HEADERS = { "X-Client-Id": clientId };

let activeSubscription = null;

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

async function loadPatients(subscription) {
  // Responses can arrive out of order, so only the newest request may update the list.
  subscription.lastRequest += 1;
  const request = subscription.lastRequest;
  const isStale = () => subscription.closed || request !== subscription.lastRequest;

  try {
    const rows = await apiRequest("/patients");
    if (!isStale()) {
      subscription.patients = rows.map(toPatient);
      subscription.loaded = true;
      subscription.onChange(subscription.patients);
    }
  } catch (error) {
    if (isStale()) {
      return;
    }
    // Once there is a list on screen, keep showing it. The next event fetches it again.
    if (subscription.loaded) {
      console.error("Could not refresh patients:", error);
    } else {
      subscription.onError(error);
    }
  }
}

function openEvents(subscription) {
  const source = new EventSource(`/api/events?client=${clientId}`);
  subscription.source = source;

  source.addEventListener("changed", () => loadPatients(subscription));
  source.addEventListener("open", () => loadPatients(subscription));
  source.addEventListener("error", () => {
    // The browser retries network drops itself, but gives up for good on a 401 or a 502.
    if (source.readyState === EventSource.CLOSED) {
      loadPatients(subscription);
      subscription.reconnectTimer = setTimeout(() => openEvents(subscription), RECONNECT_DELAY_MS);
    } else if (!subscription.loaded) {
      loadPatients(subscription);
    }
  });
}

export async function createPatient({ name, phone, condition }) {
  const { id } = await apiRequest("/patients", {
    method: "POST",
    headers: CLIENT_HEADERS,
    body: { name, phone, condition },
  });
  if (activeSubscription) {
    await loadPatients(activeSubscription);
  }
  return id;
}

export async function updatePatient(patientId, { name, phone, condition }) {
  await apiRequest(`/patients/${encodeURIComponent(patientId)}`, {
    method: "PUT",
    headers: CLIENT_HEADERS,
    body: { name, phone, condition },
  });
  if (activeSubscription) {
    await loadPatients(activeSubscription);
  }
}

export async function deletePatient(patientId) {
  await apiRequest(`/patients/${encodeURIComponent(patientId)}`, { method: "DELETE", headers: CLIENT_HEADERS });
  if (activeSubscription) {
    // PatientRow stays on "Deleting…" until its row goes, so don't depend on the refresh working.
    activeSubscription.patients = activeSubscription.patients.filter((patient) => patient.id !== patientId);
    activeSubscription.onChange(activeSubscription.patients);
    await loadPatients(activeSubscription);
  }
}

export function subscribeToPatients(onChange, onError) {
  const subscription = {
    onChange,
    onError,
    patients: [],
    loaded: false,
    closed: false,
    lastRequest: 0,
    source: null,
    reconnectTimer: null,
  };
  activeSubscription = subscription;

  // The first load happens once the stream is open, so no change can fall between the two.
  openEvents(subscription);

  return () => {
    subscription.closed = true;
    subscription.source.close();
    clearTimeout(subscription.reconnectTimer);
    if (activeSubscription === subscription) {
      activeSubscription = null;
    }
  };
}
