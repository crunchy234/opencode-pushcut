import { parse, toSeconds } from "iso8601-duration";
import type { NotificationEvent } from "opencode-notification-sdk";

export interface ValueTemplate {
  readonly value: string;
}

export interface CommandTemplate {
  readonly command: string;
}

export type ContentTemplate = ValueTemplate | CommandTemplate;

export type ContentTemplateMap = Partial<
  Record<NotificationEvent, ContentTemplate>
>;

export interface PushcutBackendConfig {
  notificationName: string;
  apiKey: string;
  devices?: string[];
  fetchTimeout?: number;
  title?: ContentTemplateMap;
  message?: ContentTemplateMap;
}

const VALID_EVENTS: readonly NotificationEvent[] = [
  "session.idle",
  "session.error",
  "permission.asked",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseISO8601Duration(duration: string): number {
  try {
    const parsed = parse(duration);
    return Math.round(toSeconds(parsed) * 1000);
  } catch {
    throw new Error(
      `Invalid ISO 8601 duration: "${duration}". Expected format like PT30S, PT5M, PT1H30M15S.`
    );
  }
}

export function parsePushcutBackendConfig(
  raw: Record<string, unknown>
): PushcutBackendConfig {
  if (typeof raw.notificationName !== "string" || raw.notificationName.length === 0) {
    throw new Error("Backend config must contain a non-empty 'notificationName' string");
  }
  const notificationName = raw.notificationName;

  if (typeof raw.apiKey !== "string" || raw.apiKey.length === 0) {
    throw new Error("Backend config must contain a non-empty 'apiKey' string");
  }
  const apiKey = raw.apiKey;

  let devices: string[] | undefined;
  if (raw.devices !== undefined) {
    if (!Array.isArray(raw.devices)) {
      throw new Error("Backend config 'devices' must be an array of strings");
    }
    for (const item of raw.devices) {
      if (typeof item !== "string") {
        throw new Error("Backend config 'devices' must be an array of strings — found non-string element");
      }
    }
    devices = raw.devices as string[];
  }

  const fetchTimeout =
    typeof raw.fetchTimeout === "string"
      ? parseISO8601Duration(raw.fetchTimeout)
      : undefined;

  const title = isRecord(raw.title)
    ? parseContentTemplateMap(raw.title, "title")
    : undefined;
  const message = isRecord(raw.message)
    ? parseContentTemplateMap(raw.message, "message")
    : undefined;

  return { notificationName, apiKey, devices, fetchTimeout, title, message };
}

function isValidEvent(key: string): key is NotificationEvent {
  return VALID_EVENTS.some((e) => e === key);
}

function parseContentTemplateMap(
  raw: Record<string, unknown>,
  fieldName: string
): ContentTemplateMap {
  const result: Partial<Record<NotificationEvent, ContentTemplate>> = {};
  for (const key of Object.keys(raw)) {
    if (!isValidEvent(key)) {
      throw new Error(
        `Invalid event type '${key}' in backend.${fieldName}. Valid events: ${VALID_EVENTS.join(", ")}`
      );
    }
    const entry = raw[key];
    if (!isRecord(entry)) {
      throw new Error(`backend.${fieldName}.${key} must be an object`);
    }
    const hasValue = typeof entry.value === "string";
    const hasCommand = typeof entry.command === "string";
    if (hasValue && hasCommand) {
      throw new Error(`backend.${fieldName}.${key} must contain exactly one of 'value' or 'command', not both`);
    }
    if (!hasValue && !hasCommand) {
      throw new Error(`backend.${fieldName}.${key} must contain exactly one of 'value' or 'command'`);
    }
    if (hasValue && typeof entry.value === "string") {
      result[key] = { value: entry.value };
    } else if (hasCommand && typeof entry.command === "string") {
      result[key] = { command: entry.command };
    }
  }
  return result;
}
