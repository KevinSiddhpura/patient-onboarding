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
    // The cookie can only be cleared by the server, so a failed logout means still signed in.
    if (error.code !== "unauthenticated") {
      console.error("Logout failed:", error);
    }
  }
}

export function watchAuthState(callback) {
  let active = true;
  watchers.add(callback);

  apiRequest("/auth/me")
    .then(({ user }) => user)
    .catch(() => null)
    .then((user) => {
      if (active) {
        currentUser = user;
        callback(user);
      }
    });

  return () => {
    active = false;
    watchers.delete(callback);
  };
}

export function currentUserId() {
  return currentUser?.uid ?? null;
}
