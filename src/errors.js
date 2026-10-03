const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

const MESSAGES_BY_CODE = {
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/user-not-found": "Incorrect email or password.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
  "auth/network-request-failed": "Network problem. Check your connection and try again.",
  "permission-denied": "You do not have permission to do that.",
  "unauthenticated": "Your session has expired. Please log in again.",
  "unavailable": "Cannot reach the server. Check your connection and try again.",
};

export function describeError(error, fallback = DEFAULT_MESSAGE) {
  return MESSAGES_BY_CODE[error?.code] ?? fallback;
}
