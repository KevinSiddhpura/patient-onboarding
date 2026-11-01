import { SHOW_DELETE_BUTTON_KEY } from "../constants.js";
import { apiRequest } from "./api.js";

let showDeleteButton = false;

export async function refreshConfig() {
  const config = await apiRequest("/config");
  showDeleteButton = config[SHOW_DELETE_BUTTON_KEY];
}

export function readShowDeleteButton() {
  return showDeleteButton;
}
