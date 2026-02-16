import type {
  NotificationBackend,
  NotificationContext,
  NotificationEvent,
} from "opencode-notification-sdk";
import type { NtfyBackendConfig } from "./config.js";

const DEFAULT_TAGS: Record<NotificationEvent, string> = {
  "session.idle": "hourglass_done",
  "session.error": "warning",
  "permission.asked": "lock",
};

export function createNtfyBackend(
  config: NtfyBackendConfig
): NotificationBackend {
  return {
    async send(context: NotificationContext): Promise<void> {
      const url = `${config.server}/${config.topic}`;

      const tags = DEFAULT_TAGS[context.event] ?? "";

      const headers: Record<string, string> = {
        Title: context.title,
        Priority: config.priority,
        Tags: tags,
        "X-Icon": config.iconUrl,
        ...(config.token
          ? { Authorization: `Bearer ${config.token}` }
          : {}),
      };

      const fetchOptions: RequestInit = {
        method: "POST",
        headers,
        body: context.message,
        ...(config.fetchTimeout !== undefined
          ? { signal: AbortSignal.timeout(config.fetchTimeout) }
          : {}),
      };

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        throw new Error(
          `ntfy request failed: ${response.status} ${response.statusText}`
        );
      }
    },
  };
}
