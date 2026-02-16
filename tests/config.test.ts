import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseNtfyBackendConfig } from "../src/config.js";

const pkg = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "package.json"), "utf-8")
);
const VERSION: string = pkg.version;

describe("parseNtfyBackendConfig", () => {
  it("should throw when topic is missing", () => {
    expect(() => parseNtfyBackendConfig({})).toThrow("topic");
  });

  it("should throw when topic is empty string", () => {
    expect(() => parseNtfyBackendConfig({ topic: "" })).toThrow("topic");
  });

  it("should throw when topic is not a string", () => {
    expect(() => parseNtfyBackendConfig({ topic: 123 })).toThrow("topic");
  });

  it("should return config with valid topic", () => {
    const config = parseNtfyBackendConfig({ topic: "my-topic" });
    expect(config.topic).toBe("my-topic");
  });

  it("should default server to https://ntfy.sh", () => {
    const config = parseNtfyBackendConfig({ topic: "test" });
    expect(config.server).toBe("https://ntfy.sh");
  });

  it("should use custom server when provided", () => {
    const config = parseNtfyBackendConfig({ topic: "test", server: "https://custom.ntfy.sh" });
    expect(config.server).toBe("https://custom.ntfy.sh");
  });

  it("should default token to undefined", () => {
    const config = parseNtfyBackendConfig({ topic: "test" });
    expect(config.token).toBeUndefined();
  });

  it("should use custom token when provided", () => {
    const config = parseNtfyBackendConfig({ topic: "test", token: "my-secret-token" });
    expect(config.token).toBe("my-secret-token");
  });

  it("should default priority to 'default'", () => {
    const config = parseNtfyBackendConfig({ topic: "test" });
    expect(config.priority).toBe("default");
  });

  it("should accept valid priority values", () => {
    for (const p of ["min", "low", "default", "high", "max"]) {
      const config = parseNtfyBackendConfig({ topic: "test", priority: p });
      expect(config.priority).toBe(p);
    }
  });

  it("should throw when priority is invalid", () => {
    expect(() => parseNtfyBackendConfig({ topic: "test", priority: "invalid" })).toThrow(
      "priority"
    );
  });

  it("should default iconUrl to dark mode GitHub raw URL using package version", () => {
    const config = parseNtfyBackendConfig({ topic: "test" });
    expect(config.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-dark.png`
    );
  });

  it("should use light mode icon URL when icon.mode is light", () => {
    const config = parseNtfyBackendConfig({ topic: "test", icon: { mode: "light" } });
    expect(config.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-light.png`
    );
  });

  it("should use dark mode icon URL when icon.mode is dark", () => {
    const config = parseNtfyBackendConfig({ topic: "test", icon: { mode: "dark" } });
    expect(config.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-dark.png`
    );
  });

  it("should default to dark mode when icon.mode is an invalid value", () => {
    const config = parseNtfyBackendConfig({ topic: "test", icon: { mode: "neon" } });
    expect(config.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-dark.png`
    );
  });

  it("should use icon.variant.dark override when mode is dark", () => {
    const config = parseNtfyBackendConfig({
      topic: "test",
      icon: { variant: { dark: "https://example.com/my-dark-icon.png" } },
    });
    expect(config.iconUrl).toBe("https://example.com/my-dark-icon.png");
  });

  it("should use icon.variant.light override when mode is light", () => {
    const config = parseNtfyBackendConfig({
      topic: "test",
      icon: {
        mode: "light",
        variant: { light: "https://example.com/my-light-icon.png" },
      },
    });
    expect(config.iconUrl).toBe("https://example.com/my-light-icon.png");
  });

  it("should ignore icon.variant.light when mode is dark", () => {
    const config = parseNtfyBackendConfig({
      topic: "test",
      icon: {
        mode: "dark",
        variant: { light: "https://example.com/my-light-icon.png" },
      },
    });
    expect(config.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-dark.png`
    );
  });

  it("should ignore icon.variant.dark when mode is light", () => {
    const config = parseNtfyBackendConfig({
      topic: "test",
      icon: {
        mode: "light",
        variant: { dark: "https://example.com/my-dark-icon.png" },
      },
    });
    expect(config.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-light.png`
    );
  });

  it("should default fetchTimeout to undefined", () => {
    const config = parseNtfyBackendConfig({ topic: "test" });
    expect(config.fetchTimeout).toBeUndefined();
  });

  it("should parse fetchTimeout from ISO 8601 duration string to milliseconds", () => {
    const config = parseNtfyBackendConfig({ topic: "test", fetchTimeout: "PT10S" });
    expect(config.fetchTimeout).toBe(10000);
  });

  it("should throw for invalid fetchTimeout value", () => {
    expect(() =>
      parseNtfyBackendConfig({ topic: "test", fetchTimeout: "invalid" })
    ).toThrow("Invalid ISO 8601 duration");
  });
});

describe("JSON Schema", () => {
  it("should have a valid JSON Schema file at opencode-ntfy.schema.json", () => {
    const schemaPath = join(
      import.meta.dirname,
      "..",
      "opencode-ntfy.schema.json"
    );
    expect(existsSync(schemaPath)).toBe(true);
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    expect(schema.$schema).toContain("json-schema.org");
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
  });

  it("should define SDK-level and backend properties in the schema", () => {
    const schemaPath = join(
      import.meta.dirname,
      "..",
      "opencode-ntfy.schema.json"
    );
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    const properties = Object.keys(schema.properties);
    // SDK-level properties
    expect(properties).toContain("$schema");
    expect(properties).toContain("enabled");
    expect(properties).toContain("events");
    expect(properties).toContain("templates");
    // ntfy-specific backend properties
    expect(properties).toContain("backend");
    const backendProps = Object.keys(schema.properties.backend.properties);
    expect(backendProps).toContain("topic");
    expect(backendProps).toContain("server");
    expect(backendProps).toContain("token");
    expect(backendProps).toContain("priority");
    expect(backendProps).toContain("icon");
    expect(backendProps).toContain("fetchTimeout");
  });

  it("should require topic within backend when backend is present", () => {
    const schemaPath = join(
      import.meta.dirname,
      "..",
      "opencode-ntfy.schema.json"
    );
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    expect(schema.properties.backend.required).toContain("topic");
  });

  it("should be listed in package.json files array", () => {
    const pkgPath = join(import.meta.dirname, "..", "package.json");
    const pkgContent = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkgContent.files).toContain("opencode-ntfy.schema.json");
  });
});
