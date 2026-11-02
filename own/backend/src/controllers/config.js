import { getFlag } from "../services/config.js";

export function getConfig(req, res) {
  res.json({ show_delete_button: getFlag(req.app.locals.db) });
}
