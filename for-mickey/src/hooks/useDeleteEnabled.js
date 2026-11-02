import { useEffect, useState } from "react";
import { subscribeToDeleteEnabled } from "../services/deleteSwitch.js";

export function useDeleteEnabled() {
  const [deleteEnabled, setDeleteEnabled] = useState(false);

  useEffect(() => subscribeToDeleteEnabled(setDeleteEnabled), []);

  return deleteEnabled;
}
