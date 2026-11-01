import { useCallback, useEffect, useState } from "react";
import {
  readShowDeleteButton,
  refreshRemoteConfig,
} from "../services/remoteConfig.js";

// A failed fetch is not fatal: the last activated value (or the default) still applies.
async function fetchLatest() {
  try {
    await refreshRemoteConfig();
    return "updated";
  } catch (error) {
    console.error("Remote Config fetch failed:", error);
    return "failed";
  }
}

export function useRemoteConfig() {
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [status, setStatus] = useState("refreshing");

  const applyResult = useCallback((result) => {
    setShowDeleteButton(readShowDeleteButton());
    setStatus(result);
  }, []);

  // State is only set after the fetch settles, never synchronously in the effect.
  useEffect(() => {
    let ignore = false;
    fetchLatest().then((result) => {
      if (!ignore) {
        applyResult(result);
      }
    });
    return () => {
      ignore = true;
    };
  }, [applyResult]);

  const refresh = () => {
    setStatus("refreshing");
    fetchLatest().then(applyResult);
  };

  return { showDeleteButton, status, refresh };
}
