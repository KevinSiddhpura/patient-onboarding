import {
  ensureInitialized,
  fetchAndActivate,
  getRemoteConfig,
  getValue,
} from "firebase/remote-config";
import { SHOW_DELETE_BUTTON_KEY } from "../constants.js";
import app from "../firebase.js";

const DEV_FETCH_INTERVAL_SECONDS = 10;
const PRODUCTION_FETCH_INTERVAL_SECONDS = 12 * 60 * 60;

// The SDK serves cached values until this interval has passed, and the server
// throttles clients that fetch too often. Short is for demos only.
function fetchIntervalSeconds() {
  const override = Number(import.meta.env.VITE_RC_FETCH_INTERVAL_SECONDS);
  if (override > 0) {
    return override;
  }
  return import.meta.env.DEV
    ? DEV_FETCH_INTERVAL_SECONDS
    : PRODUCTION_FETCH_INTERVAL_SECONDS;
}

const remoteConfig = getRemoteConfig(app);
remoteConfig.settings.minimumFetchIntervalMillis = fetchIntervalSeconds() * 1000;
remoteConfig.defaultConfig = { [SHOW_DELETE_BUTTON_KEY]: false };

export async function refreshRemoteConfig() {
  await ensureInitialized(remoteConfig);
  await fetchAndActivate(remoteConfig);
}

export function readShowDeleteButton() {
  return getValue(remoteConfig, SHOW_DELETE_BUTTON_KEY).asBoolean();
}
