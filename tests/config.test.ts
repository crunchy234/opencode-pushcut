import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    readFileSync: vi.fn(actual.readFileSync),
  };
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: vi.fn(() => "/mock-home"),
  };
});

const CONFIG_PATH = join("/mock-home", ".config", "opencode", "opencode-ntfy.json");

const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");

const pkg = JSON.parse(
  actualFs.readFileSync(
    join(import.meta.dirname, "..", "package.json"),
    "utf-8"
  )
);
const VERSION: string = pkg.version;

beforeEach(async () => {
  vi.restoreAllMocks();
  const os = await import("node:os");
  vi.mocked(os.homedir).mockReturnValue("/mock-home");
});

async function mockConfigFile(config: Record<string, unknown>): Promise<void> {
  const fs = await import("node:fs");
  const os = await import("node:os");
  vi.mocked(os.homedir).mockReturnValue("/mock-home");
  vi.mocked(fs.existsSync).mockImplementation((p) => {
    if (String(p) === CONFIG_PATH) return true;
    return actualFs.existsSync(p);
  });
  vi.mocked(fs.readFileSync).mockImplementation((p, options) => {
    if (String(p) === CONFIG_PATH) return JSON.stringify(config);
    return actualFs.readFileSync(p, options);
  });
}

async function mockNoConfigFile(): Promise<void> {
  const fs = await import("node:fs");
  const os = await import("node:os");
  vi.mocked(os.homedir).mockReturnValue("/mock-home");
  vi.mocked(fs.existsSync).mockImplementation((p) => {
    if (String(p) === CONFIG_PATH) return false;
    return actualFs.existsSync(p);
  });
}

async function mockInvalidJson(): Promise<void> {
  const fs = await import("node:fs");
  const os = await import("node:os");
  vi.mocked(os.homedir).mockReturnValue("/mock-home");
  vi.mocked(fs.existsSync).mockImplementation((p) => {
    if (String(p) === CONFIG_PATH) return true;
    return actualFs.existsSync(p);
  });
  vi.mocked(fs.readFileSync).mockImplementation((p, options) => {
    if (String(p) === CONFIG_PATH) return "not valid json {{{";
    return actualFs.readFileSync(p, options);
  });
}

describe("loadConfig", () => {
  it("should return undefined when config file does not exist", async () => {
    await mockNoConfigFile();
    const { loadConfig } = await import("../src/config.js");
    expect(loadConfig()).toBeUndefined();
  });

  it("should return a config object with the topic when config file exists", async () => {
    await mockConfigFile({ topic: "my-topic" });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config).toBeDefined();
    expect(config!.topic).toBe("my-topic");
  });

  it("should throw when config file contains invalid JSON", async () => {
    await mockInvalidJson();
    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow("invalid JSON");
  });

  it("should throw when topic is missing", async () => {
    await mockConfigFile({});
    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow("topic");
  });

  it("should throw when topic is empty string", async () => {
    await mockConfigFile({ topic: "" });
    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow("topic");
  });

  it("should use default server and priority when not specified", async () => {
    await mockConfigFile({ topic: "test" });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config!.server).toBe("https://ntfy.sh");
    expect(config!.priority).toBe("default");
    expect(config!.token).toBeUndefined();
  });

  it("should use custom server, token, and priority from config file", async () => {
    await mockConfigFile({
      topic: "test",
      server: "https://custom.ntfy.sh",
      token: "my-secret-token",
      priority: "high",
    });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config!.server).toBe("https://custom.ntfy.sh");
    expect(config!.token).toBe("my-secret-token");
    expect(config!.priority).toBe("high");
  });

  it("should throw when priority is not a valid value", async () => {
    await mockConfigFile({ topic: "test", priority: "invalid" });
    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow("priority");
  });

  it("should default iconUrl to dark mode GitHub raw URL using package version", async () => {
    await mockConfigFile({ topic: "test" });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config!.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-dark.png`
    );
  });

  it("should use light mode icon URL when iconMode is light", async () => {
    await mockConfigFile({ topic: "test", iconMode: "light" });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config!.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-light.png`
    );
  });

  it("should use dark mode icon URL when iconMode is dark", async () => {
    await mockConfigFile({ topic: "test", iconMode: "dark" });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config!.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-dark.png`
    );
  });

  it("should default to dark mode when iconMode is an invalid value", async () => {
    await mockConfigFile({ topic: "test", iconMode: "neon" });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config!.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-dark.png`
    );
  });

  it("should use iconDark override when mode is dark", async () => {
    await mockConfigFile({ topic: "test", iconDark: "https://example.com/my-dark-icon.png" });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config!.iconUrl).toBe("https://example.com/my-dark-icon.png");
  });

  it("should use iconLight override when mode is light", async () => {
    await mockConfigFile({ topic: "test", iconMode: "light", iconLight: "https://example.com/my-light-icon.png" });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config!.iconUrl).toBe("https://example.com/my-light-icon.png");
  });

  it("should ignore iconLight when mode is dark", async () => {
    await mockConfigFile({ topic: "test", iconMode: "dark", iconLight: "https://example.com/my-light-icon.png" });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config!.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-dark.png`
    );
  });

  it("should ignore iconDark when mode is light", async () => {
    await mockConfigFile({ topic: "test", iconMode: "light", iconDark: "https://example.com/my-dark-icon.png" });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config!.iconUrl).toBe(
      `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${VERSION}/assets/opencode-icon-light.png`
    );
  });

  it("should default fetchTimeout to undefined when not set", async () => {
    await mockConfigFile({ topic: "test" });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config!.fetchTimeout).toBeUndefined();
  });

  it("should set fetchTimeout in milliseconds from config file", async () => {
    await mockConfigFile({ topic: "test", fetchTimeout: "PT10S" });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config!.fetchTimeout).toBe(10000);
  });

  it("should throw for invalid fetchTimeout value", async () => {
    await mockConfigFile({ topic: "test", fetchTimeout: "invalid" });
    const { loadConfig } = await import("../src/config.js");
    expect(() => loadConfig()).toThrow("Invalid ISO 8601 duration");
  });

  it("should parse events object with custom commands", async () => {
    await mockConfigFile({
      topic: "test",
      events: {
        "session.idle": {
          titleCmd: 'printf "%s" "Custom Title"',
          messageCmd: 'printf "%s" "Custom Message"',
        },
      },
    });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config!.events).toBeDefined();
    expect(config!.events!["session.idle"]!.titleCmd).toBe('printf "%s" "Custom Title"');
    expect(config!.events!["session.idle"]!.messageCmd).toBe('printf "%s" "Custom Message"');
  });

  it("should return undefined events when events is not in config", async () => {
    await mockConfigFile({ topic: "test" });
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();
    expect(config!.events).toBeUndefined();
  });
});

describe("JSON Schema", () => {
  it("should have a valid JSON Schema file at opencode-ntfy.schema.json", () => {
    const schemaPath = join(import.meta.dirname, "..", "opencode-ntfy.schema.json");
    expect(actualFs.existsSync(schemaPath)).toBe(true);
    const schema = JSON.parse(actualFs.readFileSync(schemaPath, "utf-8"));
    expect(schema.$schema).toContain("json-schema.org");
    expect(schema.type).toBe("object");
    expect(schema.required).toContain("topic");
    expect(schema.additionalProperties).toBe(false);
  });

  it("should define all config properties in the schema", () => {
    const schemaPath = join(import.meta.dirname, "..", "opencode-ntfy.schema.json");
    const schema = JSON.parse(actualFs.readFileSync(schemaPath, "utf-8"));
    const properties = Object.keys(schema.properties);
    expect(properties).toContain("$schema");
    expect(properties).toContain("topic");
    expect(properties).toContain("server");
    expect(properties).toContain("token");
    expect(properties).toContain("priority");
    expect(properties).toContain("iconMode");
    expect(properties).toContain("iconLight");
    expect(properties).toContain("iconDark");
    expect(properties).toContain("fetchTimeout");
    expect(properties).toContain("events");
  });

  it("should be listed in package.json files array", () => {
    const pkgPath = join(import.meta.dirname, "..", "package.json");
    const pkgContent = JSON.parse(actualFs.readFileSync(pkgPath, "utf-8"));
    expect(pkgContent.files).toContain("opencode-ntfy.schema.json");
  });
});
