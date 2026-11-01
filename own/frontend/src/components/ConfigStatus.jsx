const STATUS_TEXT = {
  refreshing: "Checking configuration…",
  updated: "Configuration is up to date.",
  failed: "Could not fetch configuration; using the last known value.",
};

export default function ConfigStatus({ showDeleteButton, status, onRefresh }) {
  return (
    <div className="config-status">
      <span>
        Delete button: <strong>{showDeleteButton ? "on" : "off"}</strong>. {STATUS_TEXT[status]}
      </span>
      <button
        type="button"
        className="secondary-button"
        onClick={onRefresh}
        disabled={status === "refreshing"}
      >
        Refresh config
      </button>
    </div>
  );
}
