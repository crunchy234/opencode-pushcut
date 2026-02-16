import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { join } from "node:path";
import {
  server,
  captureHandler,
  getCapturedRequest,
  resetCapturedRequest,
} from "./msw-helpers.js";
import { createMockShell } from "./mock-shell.js";

const CONFIG_PATH = join("/mock-home", ".config", "opencode", "opencode-ntfy.json");

// We need to mock fs and os before importing the module under test
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

// Pre-load actual fs for delegation in mocks
const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(async () => {
  const os = await import("node:os");
  vi.mocked(os.homedir).mockReturnValue("/mock-home");
});
afterEach(() => {
  resetCapturedRequest();
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

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

function createMockInput(
  overrides: Partial<PluginInput> = {}
): PluginInput {
  return {
    // @ts-expect-error - mock client for testing; real client is not needed
    client: {},
    project: {
      id: "proj-1",
      worktree: "/home/user/my-project",
      time: { created: Date.now() },
    },
    directory: "/home/user/my-project",
    worktree: "/home/user/my-project",
    serverUrl: new URL("http://localhost:3000"),
    $: createMockShell(),
    ...overrides,
  };
}

/**
 * Creates a mock client whose session.get() returns the given session data.
 * Useful for testing subagent suppression behavior.
 */
function createMockClient(sessionData: { parentID?: string } = {}) {
  return {
    session: {
      get: vi.fn().mockResolvedValue({
        data: {
          id: "test-session",
          projectID: "proj-1",
          directory: "/home/user/my-project",
          title: "Test Session",
          version: "1",
          time: { created: Date.now(), updated: Date.now() },
          ...sessionData,
        },
        error: undefined,
      }),
    },
  };
}

/**
 * Helper to invoke the event hook with an event object.
 * Uses @ts-expect-error for events not in the current SDK's Event union
 * (e.g., permission.asked) that nonetheless exist at runtime.
 */
async function fireEvent(
  hooks: Awaited<ReturnType<Plugin>>,
  event: { type: string; properties: Record<string, unknown> }
): Promise<void> {
  // @ts-expect-error - allows passing event types not yet in the SDK's Event union
  await hooks.event!({ event });
}

describe("plugin", () => {
  it("should satisfy the Plugin type from @opencode-ai/plugin", async () => {
    const { plugin } = await import("../src/index.js");
    const p: Plugin = plugin;
    expect(p).toBe(plugin);
  });

  it("should be an async function that returns hooks with an event handler", async () => {
    await mockConfigFile({ topic: "test-topic" });
    server.use(captureHandler("https://ntfy.sh/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    expect(hooks).toBeDefined();
    expect(hooks.event).toBeDefined();
    expect(typeof hooks.event).toBe("function");
  });

  it("should send a notification when a session.idle event is received", async () => {
    await mockConfigFile({ topic: "test-topic", server: "https://ntfy.example.com" });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.url).toBe("https://ntfy.example.com/test-topic");
    expect(getCapturedRequest()!.method).toBe("POST");
    expect(getCapturedRequest()!.headers.get("Title")).toBe("Agent Idle");
  });

  it("should send a notification with error message when a session.error event is received", async () => {
    await mockConfigFile({ topic: "test-topic", server: "https://ntfy.example.com" });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await hooks.event!({
      event: {
        type: "session.error",
        properties: {
          sessionID: "abc-123",
          error: {
            name: "UnknownError",
            data: { message: "Something went wrong" },
          },
        },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.url).toBe("https://ntfy.example.com/test-topic");
    expect(getCapturedRequest()!.method).toBe("POST");
    expect(getCapturedRequest()!.headers.get("Title")).toBe("Agent Error");
  });

  it("should return empty hooks when config file does not exist", async () => {
    await mockNoConfigFile();

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());
    expect(hooks.event).toBeUndefined();
  });

  it("should not send a notification for non-session events", async () => {
    await mockConfigFile({ topic: "test-topic" });
    server.use(captureHandler("https://ntfy.sh/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await fireEvent(hooks, {
      type: "message.updated",
      properties: { info: {} },
    });

    expect(getCapturedRequest()).toBeNull();
  });

  it("should send a notification when a permission.asked event is received via the event hook", async () => {
    await mockConfigFile({ topic: "test-topic", server: "https://ntfy.example.com" });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await fireEvent(hooks, {
      type: "permission.asked",
      properties: {
        id: "perm-1",
        permission: "file.write",
        sessionID: "abc-123",
        patterns: ["config.json"],
        metadata: {},
        always: ["config.json"],
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.url).toBe("https://ntfy.example.com/test-topic");
    expect(getCapturedRequest()!.method).toBe("POST");
    expect(getCapturedRequest()!.headers.get("Title")).toBe("Permission Asked");
  });

  it("should have a default export that is the same as the named plugin export", async () => {
    const mod = await import("../src/index.js");
    expect(mod.default).toBe(mod.plugin);
  });

  it("should use custom title command for session.idle from events config", async () => {
    await mockConfigFile({
      topic: "test-topic",
      server: "https://ntfy.example.com",
      events: {
        "session.idle": {
          titleCmd: 'echo "Custom Idle Title"',
        },
      },
    });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const mock$ = createMockShell((cmd) => {
      if (cmd === 'echo "Custom Idle Title"') {
        return { stdout: "Custom Idle Title", exitCode: 0 };
      }
      return { stdout: "", exitCode: 1 };
    });

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput({ $: mock$ }));

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("Title")).toBe("Custom Idle Title");
  });

  it("should use custom priority command for session.error from events config", async () => {
    await mockConfigFile({
      topic: "test-topic",
      server: "https://ntfy.example.com",
      events: {
        "session.error": {
          priorityCmd: "echo max",
        },
      },
    });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const mock$ = createMockShell((cmd) => {
      if (cmd === "echo max") {
        return { stdout: "max", exitCode: 0 };
      }
      return { stdout: "", exitCode: 1 };
    });

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput({ $: mock$ }));

    await hooks.event!({
      event: {
        type: "session.error",
        properties: {
          sessionID: "abc-123",
          error: {
            name: "UnknownError",
            data: { message: "Something went wrong" },
          },
        },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("Priority")).toBe("max");
  });

  it("should substitute template variables in custom commands using underscored names", async () => {
    await mockConfigFile({
      topic: "test-topic",
      server: "https://ntfy.example.com",
      events: {
        "session.idle": {
          titleCmd: 'echo "${event} is done"',
        },
      },
    });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const mock$ = createMockShell((cmd) => {
      if (cmd === 'echo "session.idle is done"') {
        return { stdout: "session.idle is done", exitCode: 0 };
      }
      return { stdout: "", exitCode: 1 };
    });

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput({ $: mock$ }));

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("Title")).toBe("session.idle is done");
  });

  it("should include X-Icon header with default dark icon URL in session.idle notification", async () => {
    await mockConfigFile({ topic: "test-topic", server: "https://ntfy.example.com" });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    const iconHeader = getCapturedRequest()!.headers.get("X-Icon");
    expect(iconHeader).not.toBeNull();
    expect(iconHeader).toContain("opencode-icon-dark.png");
    expect(iconHeader).toContain("raw.githubusercontent.com");
  });

  it("should include X-Icon header with light icon URL when iconMode is light", async () => {
    await mockConfigFile({ topic: "test-topic", server: "https://ntfy.example.com", iconMode: "light" });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    const iconHeader = getCapturedRequest()!.headers.get("X-Icon");
    expect(iconHeader).not.toBeNull();
    expect(iconHeader).toContain("opencode-icon-light.png");
    expect(iconHeader).toContain("raw.githubusercontent.com");
  });

  it("should use default title 'Agent Idle' for session.idle events", async () => {
    await mockConfigFile({ topic: "test-topic", server: "https://ntfy.example.com" });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("Title")).toBe("Agent Idle");
  });

  it("should use default title 'Agent Error' for session.error events", async () => {
    await mockConfigFile({ topic: "test-topic", server: "https://ntfy.example.com" });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await hooks.event!({
      event: {
        type: "session.error",
        properties: {
          sessionID: "abc-123",
          error: {
            name: "UnknownError",
            data: { message: "Something went wrong" },
          },
        },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("Title")).toBe("Agent Error");
  });

  it("should use default title 'Permission Asked' for permission.asked events", async () => {
    await mockConfigFile({ topic: "test-topic", server: "https://ntfy.example.com" });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await fireEvent(hooks, {
      type: "permission.asked",
      properties: {
        id: "perm-1",
        permission: "file.write",
        sessionID: "abc-123",
        patterns: ["config.json"],
        metadata: {},
        always: ["config.json"],
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("Title")).toBe("Permission Asked");
  });

  it("should use default message for session.idle per spec", async () => {
    await mockConfigFile({ topic: "test-topic", server: "https://ntfy.example.com" });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.body).toBe(
      "The agent has finished and is waiting for input."
    );
  });

  it("should use default message for session.error per spec", async () => {
    await mockConfigFile({ topic: "test-topic", server: "https://ntfy.example.com" });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await hooks.event!({
      event: {
        type: "session.error",
        properties: {
          sessionID: "abc-123",
          error: {
            name: "UnknownError",
            data: { message: "Something went wrong" },
          },
        },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.body).toBe(
      "An error has occurred. Check the session for details."
    );
  });

  it("should use default message for permission.asked per spec", async () => {
    await mockConfigFile({ topic: "test-topic", server: "https://ntfy.example.com" });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await fireEvent(hooks, {
      type: "permission.asked",
      properties: {
        id: "perm-1",
        permission: "file.write",
        sessionID: "abc-123",
        patterns: ["config.json"],
        metadata: {},
        always: ["config.json"],
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.body).toBe(
      "The agent needs permission to continue. Review and respond."
    );
  });

  it("should use custom icon URL from iconDark config when mode is dark", async () => {
    await mockConfigFile({
      topic: "test-topic",
      server: "https://ntfy.example.com",
      iconDark: "https://example.com/custom-dark.png",
    });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("X-Icon")).toBe(
      "https://example.com/custom-dark.png"
    );
  });

  describe("subagent suppression", () => {
    it("should suppress session.idle from child sessions (parentID is set)", async () => {
      await mockConfigFile({ topic: "test-topic", server: "https://ntfy.example.com" });
      server.use(captureHandler("https://ntfy.example.com/test-topic"));

      const mockClient = createMockClient({ parentID: "parent-session" });

      // @ts-expect-error - mock client for testing
      const hooks = await (await import("../src/index.js")).plugin(createMockInput({ client: mockClient }));

      await hooks.event!({
        event: {
          type: "session.idle",
          properties: { sessionID: "child-session" },
        },
      });

      expect(getCapturedRequest()).toBeNull();
      expect(mockClient.session.get).toHaveBeenCalledWith({
        path: { id: "child-session" },
      });
    });

    it("should suppress session.error from child sessions (parentID is set)", async () => {
      await mockConfigFile({ topic: "test-topic", server: "https://ntfy.example.com" });
      server.use(captureHandler("https://ntfy.example.com/test-topic"));

      const mockClient = createMockClient({ parentID: "parent-session" });

      // @ts-expect-error - mock client for testing
      const hooks = await (await import("../src/index.js")).plugin(createMockInput({ client: mockClient }));

      await hooks.event!({
        event: {
          type: "session.error",
          properties: {
            sessionID: "child-session",
            error: {
              name: "UnknownError",
              data: { message: "Something went wrong" },
            },
          },
        },
      });

      expect(getCapturedRequest()).toBeNull();
      expect(mockClient.session.get).toHaveBeenCalledWith({
        path: { id: "child-session" },
      });
    });

    it("should send session.idle notification for parent sessions (no parentID)", async () => {
      await mockConfigFile({ topic: "test-topic", server: "https://ntfy.example.com" });
      server.use(captureHandler("https://ntfy.example.com/test-topic"));

      const mockClient = createMockClient();

      // @ts-expect-error - mock client for testing
      const hooks = await (await import("../src/index.js")).plugin(createMockInput({ client: mockClient }));

      await hooks.event!({
        event: {
          type: "session.idle",
          properties: { sessionID: "parent-session" },
        },
      });

      expect(getCapturedRequest()).not.toBeNull();
      expect(getCapturedRequest()!.headers.get("Title")).toBe("Agent Idle");
      expect(mockClient.session.get).toHaveBeenCalledWith({
        path: { id: "parent-session" },
      });
    });

    it("should send notification when session lookup fails (fall through on error)", async () => {
      await mockConfigFile({ topic: "test-topic", server: "https://ntfy.example.com" });
      server.use(captureHandler("https://ntfy.example.com/test-topic"));

      const mockClient = {
        session: {
          get: vi.fn().mockRejectedValue(new Error("Network error")),
        },
      };

      // @ts-expect-error - mock client for testing
      const hooks = await (await import("../src/index.js")).plugin(createMockInput({ client: mockClient }));

      await hooks.event!({
        event: {
          type: "session.idle",
          properties: { sessionID: "some-session" },
        },
      });

      expect(getCapturedRequest()).not.toBeNull();
      expect(getCapturedRequest()!.headers.get("Title")).toBe("Agent Idle");
      expect(mockClient.session.get).toHaveBeenCalledWith({
        path: { id: "some-session" },
      });
    });
  });

  it("should not include a permission.ask hook (spec only uses event hook)", async () => {
    await mockConfigFile({ topic: "test-topic" });

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());
    expect(hooks["permission.ask"]).toBeUndefined();
  });

  it("should use custom commands for permission.asked event via event hook", async () => {
    await mockConfigFile({
      topic: "test-topic",
      server: "https://ntfy.example.com",
      events: {
        "permission.asked": {
          titleCmd: 'echo "Custom Permission"',
        },
      },
    });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const mock$ = createMockShell((cmd) => {
      if (cmd === 'echo "Custom Permission"') {
        return { stdout: "Custom Permission", exitCode: 0 };
      }
      return { stdout: "", exitCode: 1 };
    });

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput({ $: mock$ }));

    await fireEvent(hooks, {
      type: "permission.asked",
      properties: {
        id: "perm-1",
        permission: "file.write",
        sessionID: "abc-123",
        patterns: ["config.json"],
        metadata: {},
        always: ["config.json"],
      },
    });

    expect(getCapturedRequest()).not.toBeNull();
    expect(getCapturedRequest()!.headers.get("Title")).toBe("Custom Permission");
  });

  it("should suppress duplicate notifications within the cooldown period", async () => {
    vi.useFakeTimers();
    await mockConfigFile({
      topic: "test-topic",
      server: "https://ntfy.example.com",
      cooldown: "PT5S",
    });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });
    expect(getCapturedRequest()).not.toBeNull();

    resetCapturedRequest();

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });
    expect(getCapturedRequest()).toBeNull();

    vi.useRealTimers();
  });

  it("should allow notifications after cooldown period expires", async () => {
    vi.useFakeTimers();
    await mockConfigFile({
      topic: "test-topic",
      server: "https://ntfy.example.com",
      cooldown: "PT5S",
    });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });
    expect(getCapturedRequest()).not.toBeNull();

    resetCapturedRequest();
    vi.advanceTimersByTime(5001);

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });
    expect(getCapturedRequest()).not.toBeNull();

    vi.useRealTimers();
  });

  it("should not apply cooldown when cooldown is not set", async () => {
    await mockConfigFile({
      topic: "test-topic",
      server: "https://ntfy.example.com",
    });
    server.use(captureHandler("https://ntfy.example.com/test-topic"));

    const { plugin } = await import("../src/index.js");
    const hooks = await plugin(createMockInput());

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });
    expect(getCapturedRequest()).not.toBeNull();

    resetCapturedRequest();

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "abc-123" },
      },
    });
    expect(getCapturedRequest()).not.toBeNull();
  });
});
