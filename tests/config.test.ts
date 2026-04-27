import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parsePushcutBackendConfig } from "../src/config.js";

describe("parsePushcutBackendConfig", () => {
  it("should throw when notificationName is missing", () => {
    expect(() => parsePushcutBackendConfig({})).toThrow("notificationName");
  });
  it("should throw when notificationName is empty string", () => {
    expect(() => parsePushcutBackendConfig({ notificationName: "" })).toThrow("notificationName");
  });
  it("should throw when notificationName is not a string", () => {
    expect(() => parsePushcutBackendConfig({ notificationName: 123 })).toThrow("notificationName");
  });
  it("should throw when apiKey is missing", () => {
    expect(() => parsePushcutBackendConfig({ notificationName: "MyNotif" })).toThrow("apiKey");
  });
  it("should throw when apiKey is empty string", () => {
    expect(() => parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "" })).toThrow("apiKey");
  });
  it("should throw when apiKey is not a string", () => {
    expect(() => parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: 42 })).toThrow("apiKey");
  });
  it("should return config with valid notificationName and apiKey", () => {
    const config = parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123" });
    expect(config.notificationName).toBe("MyNotif");
    expect(config.apiKey).toBe("abc123");
  });
  it("should default devices to undefined when not provided", () => {
    const config = parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123" });
    expect(config.devices).toBeUndefined();
  });
  it("should parse devices when provided as an array of strings", () => {
    const config = parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123", devices: ["iPhone", "iPad"] });
    expect(config.devices).toEqual(["iPhone", "iPad"]);
  });
  it("should throw when devices is not an array", () => {
    expect(() => parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123", devices: "iPhone" })).toThrow("devices");
  });
  it("should throw when devices contains a non-string element", () => {
    expect(() => parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123", devices: ["iPhone", 42] })).toThrow("devices");
  });
  it("should default fetchTimeout to undefined", () => {
    const config = parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123" });
    expect(config.fetchTimeout).toBeUndefined();
  });
  it("should parse fetchTimeout from ISO 8601 duration string to milliseconds", () => {
    const config = parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123", fetchTimeout: "PT10S" });
    expect(config.fetchTimeout).toBe(10000);
  });
  it("should throw for invalid fetchTimeout value", () => {
    expect(() => parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123", fetchTimeout: "invalid" })).toThrow("Invalid ISO 8601 duration");
  });

  describe("title templates", () => {
    it("should parse a value template for session.idle", () => {
      const config = parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123", title: { "session.idle": { value: "{project}: Agent Idle" } } });
      expect(config.title).toEqual({ "session.idle": { value: "{project}: Agent Idle" } });
    });
    it("should parse a command template for session.error", () => {
      const config = parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123", title: { "session.error": { command: "echo Error in {project}" } } });
      expect(config.title).toEqual({ "session.error": { command: "echo Error in {project}" } });
    });
    it("should default title to undefined when not provided", () => {
      const config = parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123" });
      expect(config.title).toBeUndefined();
    });
    it("should throw when both value and command are specified", () => {
      expect(() => parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123", title: { "session.idle": { value: "Idle", command: "echo Idle" } } })).toThrow();
    });
    it("should throw when neither value nor command is specified", () => {
      expect(() => parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123", title: { "session.idle": {} } })).toThrow();
    });
    it("should throw when an invalid event type key is used", () => {
      expect(() => parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123", title: { "invalid.event": { value: "test" } } })).toThrow();
    });
  });

  describe("message templates", () => {
    it("should parse a value template for session.idle", () => {
      const config = parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123", message: { "session.idle": { value: "Agent is idle in {project}" } } });
      expect(config.message).toEqual({ "session.idle": { value: "Agent is idle in {project}" } });
    });
    it("should parse a command template for session.error", () => {
      const config = parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123", message: { "session.error": { command: "echo Error: {error}" } } });
      expect(config.message).toEqual({ "session.error": { command: "echo Error: {error}" } });
    });
    it("should default message to undefined when not provided", () => {
      const config = parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123" });
      expect(config.message).toBeUndefined();
    });
    it("should throw when both value and command are specified for message", () => {
      expect(() => parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123", message: { "session.idle": { value: "Idle", command: "echo Idle" } } })).toThrow();
    });
    it("should throw when neither value nor command is specified for message", () => {
      expect(() => parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123", message: { "session.idle": {} } })).toThrow();
    });
    it("should throw when an invalid event type key is used for message", () => {
      expect(() => parsePushcutBackendConfig({ notificationName: "MyNotif", apiKey: "abc123", message: { "bad.event": { value: "test" } } })).toThrow();
    });
  });
});

describe("JSON Schema", () => {
  it("should have a valid JSON Schema file at notification-pushcut.schema.json", () => {
    const schemaPath = join(import.meta.dirname, "..", "notification-pushcut.schema.json");
    expect(existsSync(schemaPath)).toBe(true);
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    expect(schema.$schema).toContain("json-schema.org");
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
  });
  it("should define SDK-level and backend properties in the schema", () => {
    const schemaPath = join(import.meta.dirname, "..", "notification-pushcut.schema.json");
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    const properties = Object.keys(schema.properties);
    expect(properties).toContain("$schema");
    expect(properties).toContain("enabled");
    expect(properties).toContain("events");
    expect(properties).toContain("backend");
    const backendProps = Object.keys(schema.properties.backend.properties);
    expect(backendProps).toContain("notificationName");
    expect(backendProps).toContain("apiKey");
    expect(backendProps).toContain("devices");
    expect(backendProps).toContain("fetchTimeout");
    expect(backendProps).toContain("title");
    expect(backendProps).toContain("message");
  });
  it("should require notificationName and apiKey within backend", () => {
    const schemaPath = join(import.meta.dirname, "..", "notification-pushcut.schema.json");
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    expect(schema.properties.backend.required).toContain("notificationName");
    expect(schema.properties.backend.required).toContain("apiKey");
  });
  it("should be listed in package.json files array", () => {
    const pkgPath = join(import.meta.dirname, "..", "package.json");
    const pkgContent = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkgContent.files).toContain("notification-pushcut.schema.json");
  });
});
