import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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
