import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import { loadConfig, type NtfyConfig, type EventCommands } from "./config.js";
import { sendNotification } from "./notify.js";
import { resolveField } from "./exec.js";
import { createCooldownGuard } from "./cooldown.js";

type BunShell = PluginInput["$"];

interface NotificationDefaults {
  title: string;
  message: string;
  tags: string;
}

async function resolveAndSend(
  $: BunShell,
  config: NtfyConfig,
  eventCommands: EventCommands | undefined,
  vars: Record<string, string>,
  defaults: NotificationDefaults
): Promise<void> {
  const titleCmd = eventCommands?.titleCmd;
  const messageCmd = eventCommands?.messageCmd;
  const tagsCmd = eventCommands?.tagsCmd;
  const priorityCmd = eventCommands?.priorityCmd;

  const title = await resolveField($, titleCmd, vars, defaults.title);
  const message = await resolveField($, messageCmd, vars, defaults.message);
  const tags = await resolveField($, tagsCmd, vars, defaults.tags);
  const priority = await resolveField($, priorityCmd, vars, config.priority);

  await sendNotification(config, {
    title,
    message,
    tags,
    priority: priorityCmd ? priority : undefined,
  });
}

function buildVars(
  event: string,
  time: string,
  extra: Record<string, string> = {}
): Record<string, string> {
  return { error: "", permission_type: "", permission_patterns: "", ...extra, event, time };
}

function hasPermissionProperties(
  event: { properties?: unknown }
): event is { properties: { permission?: string; patterns?: string[] } } {
  return typeof event.properties === "object" && event.properties !== null;
}

export const plugin: Plugin = async (input: PluginInput): Promise<Hooks> => {
  const config = loadConfig();

  if (!config) {
    return {};
  }

  const $ = input.$;

  const cooldownGuard = config.cooldown
    ? createCooldownGuard({ cooldown: config.cooldown, edge: config.cooldownEdge })
    : undefined;

  return {
    event: async ({ event }) => {
      const eventType: string = event.type;

      if (cooldownGuard && !cooldownGuard.shouldAllow(eventType)) {
        return;
      }

      const eventCommands = config.events?.[eventType];

      if (event.type === "session.idle") {
        const time = new Date().toISOString();
        const vars = buildVars("session.idle", time);

        await resolveAndSend($, config, eventCommands, vars, {
          title: "Agent Idle",
          message: "The agent has finished and is waiting for input.",
          tags: "hourglass_done",
        });
      } else if (event.type === "session.error") {
        const error = event.properties.error;
        const errorMsg =
          error && "data" in error && "message" in error.data
            ? String(error.data.message)
            : "";
        const time = new Date().toISOString();
        const vars = buildVars("session.error", time, { error: errorMsg });

        await resolveAndSend($, config, eventCommands, vars, {
          title: "Agent Error",
          message: "An error has occurred. Check the session for details.",
          tags: "warning",
        });
      } else if (eventType === "permission.asked" && hasPermissionProperties(event)) {
        const permissionType = event.properties.permission || "";
        const patternsArr = event.properties.patterns;
        const patterns = Array.isArray(patternsArr) ? patternsArr.join(", ") : "";
        const time = new Date().toISOString();
        const vars = buildVars("permission.asked", time, {
          permission_type: permissionType,
          permission_patterns: patterns,
        });

        await resolveAndSend($, config, eventCommands, vars, {
          title: "Permission Asked",
          message: "The agent needs permission to continue. Review and respond.",
          tags: "lock",
        });
      }
    },
  };
};

export default plugin;
