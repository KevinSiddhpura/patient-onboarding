// Covers a missing or malformed timestamp.
export function formatTimestamp(timestamp) {
  if (typeof timestamp?.toDate !== "function") {
    return "Pending…";
  }
  return timestamp.toDate().toLocaleString();
}
