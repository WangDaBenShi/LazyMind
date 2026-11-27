import type { AnkiProviderStatus } from "./api";
import type { CloudConnection } from "./cloudApi";

function syncStatus(connected: boolean, enabled: boolean) {
  if (!connected) return "incomplete";
  return enabled ? "connectedEnabled" : "connectedPaused";
}

export function ankiConnectionStatus(status: AnkiProviderStatus | null) {
  if (!status?.available) return "unavailable";
  return syncStatus(status.connected, status.enabled);
}

export function cloudConnectionStatus(connection?: CloudConnection) {
  return syncStatus(Boolean(connection?.configured && connection.target_id), Boolean(connection?.enabled));
}
