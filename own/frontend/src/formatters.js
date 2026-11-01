// Covers a missing or malformed timestamp; pending writes get an estimated time from the listener.
export function formatTimestamp(timestamp) {
  if (typeof timestamp?.toDate !== "function") {
    return "Pending…";
  }
  return timestamp.toDate().toLocaleString();
}
