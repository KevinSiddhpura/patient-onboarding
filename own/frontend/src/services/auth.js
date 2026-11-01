import { apiRequest, onUnauthenticated } from "./api.js";

const watchers = new Set();
let currentUser = null;

function setUser(user) {
  currentUser = user;
  for (const watcher of watchers) {
    watcher(user);
  }
}

onUnauthenticated(() => setUser(null));

export async function logIn(email, password) {
  const user = await apiRequest("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  setUser(user);
}

export async function logOut() {
  try {
    await apiRequest("/auth/logout", { method: "POST" });
    setUser(null);
  } catch (error) {
    // A 401 means the session is already gone. Otherwise only the server can clear the cookie.
    if (error.code !== "unauthenticated") {
      throw error;
    }
  }
}

export function watchAuthState(callback, onError) {
  let active = true;
  watchers.add(callback);

  apiRequest("/auth/me").then(
    ({ user }) => {
      if (active) {
        currentUser = user;
        callback(user);
      }
    },
    (error) => {
      if (active) {
        onError(error);
      }
    },
  );

  return () => {
    active = false;
    watchers.delete(callback);
  };
}

export function currentUserId() {
  return currentUser?.uid ?? null;
}
