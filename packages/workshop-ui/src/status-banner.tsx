import type { ConnectionStatus } from "./types.js";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connecting: "Connecting",
  ready: "Ready",
  thinking: "Thinking",
  streaming: "Responding",
  error: "Connection error",
};

export function StatusBanner({ status, error }: { status: ConnectionStatus; error?: string }) {
  const showSpinner = status === "connecting" || status === "thinking";

  return (
    <div
      className={`pp-status pp-status--${status}`}
      role={status === "error" ? "alert" : "status"}
    >
      {showSpinner ? (
        <span className="pp-spinner" aria-hidden="true" />
      ) : (
        <span className="pp-status__dot" aria-hidden="true" />
      )}
      <span>{error ?? STATUS_LABELS[status]}</span>
    </div>
  );
}
