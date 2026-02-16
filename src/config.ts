import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseISO8601Duration } from "./cooldown.js";

export interface EventCommands {
  titleCmd?: string;
  messageCmd?: string;
  tagsCmd?: string;
  priorityCmd?: string;
}

export interface NtfyConfig {
  topic: string;
  server: string;
  token?: string;
  priority: string;
  iconUrl: string;
  cooldown?: string;
  cooldownEdge: "leading" | "trailing";
  fetchTimeout?: number;
  events?: Record<string, EventCommands>;
}

const VALID_PRIORITIES = ["min", "low", "default", "high", "max"] as const;
const VALID_ICON_MODES = ["light", "dark"] as const;
const VALID_COOLDOWN_EDGES = ["leading", "trailing"] as const;

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);
const PACKAGE_VERSION: string = pkg.version;

const BASE_ICON_URL = `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${PACKAGE_VERSION}/assets`;

function resolveIconUrl(
  iconMode: string,
  iconLight: string | undefined,
  iconDark: string | undefined
): string {
  const mode = iconMode === "light" ? "light" : "dark";
  if (mode === "light" && iconLight) return iconLight;
  if (mode === "dark" && iconDark) return iconDark;
  return `${BASE_ICON_URL}/opencode-icon-${mode}.png`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadConfig(): NtfyConfig | undefined {
  const configPath = join(homedir(), ".config", "opencode", "opencode-ntfy.json");

  if (!existsSync(configPath)) {
    return undefined;
  }

  const raw = readFileSync(configPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse config file ${configPath}: invalid JSON`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`Config file ${configPath} must contain a JSON object`);
  }

  // Required: topic
  if (typeof parsed.topic !== "string" || parsed.topic.length === 0) {
    throw new Error("Config file must contain a non-empty 'topic' string");
  }
  const topic = parsed.topic;

  // Optional: server
  const server = typeof parsed.server === "string" ? parsed.server : "https://ntfy.sh";

  // Optional: token
  const token = typeof parsed.token === "string" ? parsed.token : undefined;

  // Optional: priority
  const priority = typeof parsed.priority === "string" ? parsed.priority : "default";
  if (!VALID_PRIORITIES.some((p) => p === priority)) {
    throw new Error(
      `Config 'priority' must be one of: ${VALID_PRIORITIES.join(", ")}`
    );
  }

  // Optional: iconMode
  const iconModeRaw = typeof parsed.iconMode === "string" ? parsed.iconMode : "dark";
  const iconMode = VALID_ICON_MODES.some((m) => m === iconModeRaw) ? iconModeRaw : "dark";

  // Optional: iconLight, iconDark
  const iconLight = typeof parsed.iconLight === "string" ? parsed.iconLight : undefined;
  const iconDark = typeof parsed.iconDark === "string" ? parsed.iconDark : undefined;

  const iconUrl = resolveIconUrl(iconMode, iconLight, iconDark);

  // Optional: cooldown
  const cooldown = typeof parsed.cooldown === "string" ? parsed.cooldown : undefined;
  if (cooldown) {
    parseISO8601Duration(cooldown);
  }

  // Optional: cooldownEdge
  const cooldownEdgeRaw = typeof parsed.cooldownEdge === "string" ? parsed.cooldownEdge : "leading";
  if (!VALID_COOLDOWN_EDGES.some((e) => e === cooldownEdgeRaw)) {
    throw new Error(
      `Config 'cooldownEdge' must be one of: ${VALID_COOLDOWN_EDGES.join(", ")}`
    );
  }
  const cooldownEdge = cooldownEdgeRaw === "trailing" ? "trailing" : "leading";

  // Optional: fetchTimeout
  const fetchTimeout = typeof parsed.fetchTimeout === "string"
    ? parseISO8601Duration(parsed.fetchTimeout)
    : undefined;

  // Optional: events
  const events = isRecord(parsed.events)
    ? parseEvents(parsed.events)
    : undefined;

  return {
    topic,
    server,
    token,
    priority,
    iconUrl,
    cooldown,
    cooldownEdge,
    fetchTimeout,
    events,
  };
}

function parseEvents(
  eventsObj: Record<string, unknown>
): Record<string, EventCommands> {
  const result: Record<string, EventCommands> = {};
  for (const key of Object.keys(eventsObj)) {
    const value = eventsObj[key];
    if (!isRecord(value)) continue;
    const commands: EventCommands = {};
    if (typeof value.titleCmd === "string") commands.titleCmd = value.titleCmd;
    if (typeof value.messageCmd === "string") commands.messageCmd = value.messageCmd;
    if (typeof value.tagsCmd === "string") commands.tagsCmd = value.tagsCmd;
    if (typeof value.priorityCmd === "string") commands.priorityCmd = value.priorityCmd;
    result[key] = commands;
  }
  return result;
}
