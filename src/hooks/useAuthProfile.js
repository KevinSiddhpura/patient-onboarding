import { useEffect, useState } from "react";
import { AUTH_STATUS } from "../constants.js";
import { resolveProfileStatus } from "../profileStatus.js";
import { currentUserId, watchAuthState } from "../services/auth.js";
import { fetchUserProfile } from "../services/users.js";

const LOADING_STATE = { status: AUTH_STATUS.LOADING, user: null, profile: null };

export function useAuthProfile() {
  const [state, setState] = useState(LOADING_STATE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const unsubscribe = watchAuthState(async (user) => {
      if (!user) {
        setState({ status: AUTH_STATUS.SIGNED_OUT, user: null, profile: null });
        return;
      }

      setState({ status: AUTH_STATUS.LOADING, user, profile: null });

      let nextState;
      try {
        const profile = await fetchUserProfile(user.uid);
        nextState = { status: resolveProfileStatus(profile), user, profile };
      } catch (error) {
        console.error("Failed to load user profile:", error);
        nextState = { status: AUTH_STATUS.PROFILE_ERROR, user, profile: null };
      }

      // The user may have signed out while the profile was loading.
      if (currentUserId() === user.uid) {
        setState(nextState);
      }
    });

    return unsubscribe;
  }, [attempt]);

  const retry = () => {
    setState(LOADING_STATE);
    setAttempt((count) => count + 1);
  };

  return { ...state, retry };
}
