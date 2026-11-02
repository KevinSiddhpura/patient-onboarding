import { useEffect, useState } from "react";
import { describeError } from "../errors.js";
import { subscribeToPatients } from "../services/patients.js";

export function usePatients() {
  const [state, setState] = useState({ status: "loading", patients: [], error: "" });

  useEffect(() => {
    const unsubscribe = subscribeToPatients(
      (patients) => setState({ status: "ready", patients, error: "" }),
      (error) => {
        console.error("Patient listener error:", error);
        setState({
          status: "error",
          patients: [],
          error: describeError(error, "Could not load patients."),
        });
      },
    );

    return unsubscribe;
  }, []);

  return state;
}
