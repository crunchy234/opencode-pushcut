import type { PluginInput } from "@opencode-ai/plugin";
import type {
  NotificationBackend,
  NotificationContext,
  NotificationEvent,
} from "opencode-notification-sdk";
import { renderTemplate, execTemplate } from "opencode-notification-sdk";
import type {
  PushcutBackendConfig,
  ContentTemplate,
  ContentTemplateMap,
} from "./config.js";

const PUSHCUT_API_BASE = "https://api.pushcut.io/v1";

const DEFAULT_TITLES: Record<NotificationEvent, string> = {
  "session.idle": "Agent Idle",
  "session.error": "Agent Error",
  "permission.asked": "Permission Asked",
};

const DEFAULT_MESSAGES: Record<NotificationEvent, string> = {
  "session.idle": "The agent has finished and is waiting for input.",
  "session.error": "An error has occurred. Check the session for details.",
  "permission.asked": "The agent needs permission to continue. Review and respond.",
};

function isValueTemplate(
  template: ContentTemplate
): template is { readonly value: string } {
  return "value" in template;
}

async function resolveContent(
  templateMap: ContentTemplateMap | undefined,
  event: NotificationEvent,
  defaults: Record<NotificationEvent, string>,
  context: NotificationContext,
  $?: PluginInput["$"]
): Promise<string> {
  const template = templateMap?.[event];
  if (!template) {
    return defaults[event] ?? "";
  }
  if (isValueTemplate(template)) {
    return renderTemplate(template.value, context);
  }
  if (!$) {
    throw new Error(
      `Command template configured for ${event} but no shell ($) was provided`
    );
  }
  return execTemplate($, template.command, context);
}

export function createPushcutBackend(
  config: PushcutBackendConfig,
  $?: PluginInput["$"]
): NotificationBackend {
  return {
    async send(context: NotificationContext): Promise<void> {
      const url = `${PUSHCUT_API_BASE}/notifications/${encodeURIComponent(config.notificationName)}`;

      const title = await resolveContent(config.title, context.event, DEFAULT_TITLES, context, $);
      const text = await resolveContent(config.message, context.event, DEFAULT_MESSAGES, context, $);

      const bodyObj: Record<string, unknown> = { title, text };
      if (config.devices !== undefined) {
        bodyObj.devices = config.devices;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "API-Key": config.apiKey,
      };

      const fetchOptions: RequestInit = {
        method: "POST",
        headers,
        body: JSON.stringify(bodyObj),
        ...(config.fetchTimeout !== undefined
          ? { signal: AbortSignal.timeout(config.fetchTimeout) }
          : {}),
      };

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        throw new Error(
          `Pushcut request failed: ${response.status} ${response.statusText}`
        );
      }
    },
  };
}
