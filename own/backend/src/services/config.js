export function getFlag(db) {
  const { value } = db.prepare("SELECT value FROM config WHERE key = 'show_delete_button'").get();
  return value === "true";
}

export function setFlag(db, enabled) {
  db.prepare("UPDATE config SET value = ? WHERE key = 'show_delete_button'").run(String(enabled));
}
