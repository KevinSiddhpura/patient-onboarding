import { useState } from "react";
import { logOut } from "../services/auth.js";

const LOGOUT_FAILED = "Could not log out, so you are still signed in. Check your connection and try again.";

export function useLogout() {
  const [error, setError] = useState("");

  const handleLogout = async () => {
    setError("");
    try {
      await logOut();
    } catch (logoutError) {
      console.error("Logout failed:", logoutError);
      setError(LOGOUT_FAILED);
    }
  };

  return { logOut: handleLogout, error };
}
