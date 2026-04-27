import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { execSync } from "node:child_process";
import type { NotificationContext } from "opencode-notification-sdk";
import type { PluginInput } from "@opencode-ai/plugin";
import { createPushcutBackend } from "../src/backend.js";
import type { PushcutBackendConfig } from "../src/config.js";
import {
  server,
  captureHandler,
  getCapturedRequest,
  resetCapturedRequest,
} from "./msw-helpers.js";

function createTestShell(): PluginInput["$"] {
  function getExitCode(err: unknown): number {
    if (err !== null && typeof err === "object" && "status" in err && typeof err.status === "number") {
      return err.status;
    }
    return 1;
  }

  function shellFn(
    strings: TemplateStringsArray,
    ...expressions: Array<{ raw?: string; toString(): string }>
  ): ReturnType<PluginInput["$"]> {
    let command = "";
    for (let i = 0; i < strings.length; i++) {
      command += strings[i];
      if (i < expressions.length) {
        const expr = expressions[i];
        if (typeof expr === "object" && expr !== null && "raw" in expr && typeof expr.raw === "string") {
          command += expr.raw;
        } else {
          command += String(expr);
        }
      }
    }
    command = command.trim();

    let stdout = "";
    let exitCode = 0;
    try {
      stdout = execSync(command, { encoding: "utf-8" });
    } catch (err: unknown) {
      exitCode = getExitCode(err);
    }

    const output = {
      stdout: Buffer.from(stdout),
      stderr: Buffer.from(""),
      exitCode,
      text: () => stdout,
      json: () => JSON.parse(stdout),
      arrayBuffer: () => Buffer.from(stdout).buffer,
      bytes: () => new Uint8Array(Buffer.from(stdout)),
      blob: () => new Blob([stdout]),
    };

    const resolved = Promise.resolve(output);

    const chainable: ReturnType<PluginInput["$"]> = {
      then: resolved.then.bind(resolved),
      catch: resolved.catch.bind(resolved),
      finally: resolved.finally.bind(resolved),
      [Symbol.toStringTag]: "Promise",
      stdin: new WritableStream(),
      cwd: () => chainable,
      env: () => chainable,
      quiet: () => chainable,
      lines: async function* () { yield stdout; },
      text: () => Promise.resolve(stdout),
      json: () => Promise.resolve(JSON.parse(stdout)),
      arrayBuffer: () => Promise.resolve(Buffer.from(stdout).buffer),
      blob: () => Promise.resolve(new Blob([stdout])),
      nothrow: () => chainable,
      throws: () => chainable,
    };

    return chainable;
  }

  shellFn.braces = (pattern: string) => [pattern];
  shellFn.escape = (input: string) => input;
  shellFn.env = (): PluginInput["$"] => testShell;
  shellFn.cwd = (): PluginInput["$"] => testShell;
  shellFn.nothrow = (): PluginInput["$"] => testShell;
  shellFn.throws = (): PluginInput["$"] => testShell;

  const testShell: PluginInput["$"] = shellFn;
  return testShell;
}

const PUSHCUT_API_BASE = "https://api.pushcut.io/v1";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  resetCapturedRequest();
  server.resetHandlers();
});
afterAll(() => server.close());

function makeContext(overrides: Partial<NotificationContext> = {}): NotificationContext {
  return {
    event: "session.idle",
    metadata: {
      sessionId: "sess-123",
      projectName: "my-project",
      timestamp: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

function makeConfig(overrides: Partial<PushcutBackendConfig> = {}): PushcutBackendConfig {
  return {
    notificationName: "MyNotification",
    apiKey: "test-api-key",
    ...overrides,
  };
}

describe("createPushcutBackend", () => {
  it("should send a POST request to the Pushcut API for the configured notificationName", async () => {
    server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
    const backend = createPushcutBackend(makeConfig());
    await backend.send(makeContext());
    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe(`${PUSHCUT_API_BASE}/notifications/MyNotification`);
    expect(captured!.method).toBe("POST");
  });

  it("should include API-Key header", async () => {
    server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
    const backend = createPushcutBackend(makeConfig({ apiKey: "secret-key" }));
    await backend.send(makeContext());
    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.headers.get("API-Key")).toBe("secret-key");
  });

  it("should send Content-Type: application/json", async () => {
    server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
    const backend = createPushcutBackend(makeConfig());
    await backend.send(makeContext());
    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.headers.get("Content-Type")).toContain("application/json");
  });

  it("should include default title for session.idle in request body", async () => {
    server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
    const backend = createPushcutBackend(makeConfig());
    await backend.send(makeContext({ event: "session.idle" }));
    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    const body = JSON.parse(captured!.body);
    expect(body.title).toBe("Agent Idle");
  });

  it("should include default title for session.error in request body", async () => {
    server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
    const backend = createPushcutBackend(makeConfig());
    await backend.send(makeContext({ event: "session.error" }));
    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    const body = JSON.parse(captured!.body);
    expect(body.title).toBe("Agent Error");
  });

  it("should include default title for permission.asked in request body", async () => {
    server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
    const backend = createPushcutBackend(makeConfig());
    await backend.send(makeContext({ event: "permission.asked" }));
    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    const body = JSON.parse(captured!.body);
    expect(body.title).toBe("Permission Asked");
  });

  it("should include default text for session.idle in request body", async () => {
    server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
    const backend = createPushcutBackend(makeConfig());
    await backend.send(makeContext({ event: "session.idle" }));
    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    const body = JSON.parse(captured!.body);
    expect(body.text).toBe("The agent has finished and is waiting for input.");
  });

  it("should include default text for session.error in request body", async () => {
    server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
    const backend = createPushcutBackend(makeConfig());
    await backend.send(makeContext({ event: "session.error" }));
    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    const body = JSON.parse(captured!.body);
    expect(body.text).toBe("An error has occurred. Check the session for details.");
  });

  it("should include default text for permission.asked in request body", async () => {
    server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
    const backend = createPushcutBackend(makeConfig());
    await backend.send(makeContext({ event: "permission.asked" }));
    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    const body = JSON.parse(captured!.body);
    expect(body.text).toBe("The agent needs permission to continue. Review and respond.");
  });

  it("should not include devices in body when devices is not configured", async () => {
    server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
    const backend = createPushcutBackend(makeConfig());
    await backend.send(makeContext());
    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    const body = JSON.parse(captured!.body);
    expect(body.devices).toBeUndefined();
  });

  it("should include devices in body when devices is configured", async () => {
    server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
    const backend = createPushcutBackend(makeConfig({ devices: ["iPhone", "iPad"] }));
    await backend.send(makeContext());
    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    const body = JSON.parse(captured!.body);
    expect(body.devices).toEqual(["iPhone", "iPad"]);
  });

  it("should URL-encode the notificationName in the path", async () => {
    server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/My%20Notification%20Name`));
    const backend = createPushcutBackend(makeConfig({ notificationName: "My Notification Name" }));
    await backend.send(makeContext());
    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe(`${PUSHCUT_API_BASE}/notifications/My%20Notification%20Name`);
  });

  it("should abort the request when fetchTimeout is set and server is slow", async () => {
    server.use(
      http.post(`${PUSHCUT_API_BASE}/notifications/MyNotification`, async () => {
        await delay(5000);
        return HttpResponse.json({ id: "abc" });
      })
    );
    const backend = createPushcutBackend(makeConfig({ fetchTimeout: 50 }));
    await expect(backend.send(makeContext())).rejects.toThrow();
  });

  it("should succeed when fetchTimeout is not set even with a slightly slow server", async () => {
    server.use(
      http.post(`${PUSHCUT_API_BASE}/notifications/MyNotification`, async () => {
        await delay(50);
        return HttpResponse.json({ id: "abc" });
      })
    );
    const backend = createPushcutBackend(makeConfig());
    await expect(backend.send(makeContext())).resolves.toBeUndefined();
  });

  it("should throw when the server responds with a non-ok status", async () => {
    server.use(
      http.post(`${PUSHCUT_API_BASE}/notifications/MyNotification`, () =>
        new HttpResponse(null, { status: 401, statusText: "Unauthorized" })
      )
    );
    const backend = createPushcutBackend(makeConfig());
    await expect(backend.send(makeContext())).rejects.toThrow("401");
  });

  describe("value templates", () => {
    it("should use a value title template with renderTemplate substitution", async () => {
      server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
      const backend = createPushcutBackend(
        makeConfig({ title: { "session.idle": { value: "{project}: Agent Idle" } } })
      );
      await backend.send(makeContext({
        event: "session.idle",
        metadata: { sessionId: "sess-123", projectName: "my-project", timestamp: "2026-01-01T00:00:00.000Z" },
      }));
      const captured = getCapturedRequest();
      expect(captured).not.toBeNull();
      const body = JSON.parse(captured!.body);
      expect(body.title).toBe("my-project: Agent Idle");
    });

    it("should use a value message template with renderTemplate substitution", async () => {
      server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
      const backend = createPushcutBackend(
        makeConfig({ message: { "session.error": { value: "Error in {project}: {error}" } } })
      );
      await backend.send(makeContext({
        event: "session.error",
        metadata: { sessionId: "sess-123", projectName: "my-project", timestamp: "2026-01-01T00:00:00.000Z", error: "something broke" },
      }));
      const captured = getCapturedRequest();
      expect(captured).not.toBeNull();
      const body = JSON.parse(captured!.body);
      expect(body.text).toBe("Error in my-project: something broke");
    });

    it("should fall back to default title when no title template for the event", async () => {
      server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
      const backend = createPushcutBackend(
        makeConfig({ title: { "session.error": { value: "Custom Error Title" } } })
      );
      await backend.send(makeContext({ event: "session.idle" }));
      const captured = getCapturedRequest();
      expect(captured).not.toBeNull();
      const body = JSON.parse(captured!.body);
      expect(body.title).toBe("Agent Idle");
    });

    it("should fall back to default message when no message template for the event", async () => {
      server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
      const backend = createPushcutBackend(
        makeConfig({ message: { "session.error": { value: "Custom Error Message" } } })
      );
      await backend.send(makeContext({ event: "session.idle" }));
      const captured = getCapturedRequest();
      expect(captured).not.toBeNull();
      const body = JSON.parse(captured!.body);
      expect(body.text).toBe("The agent has finished and is waiting for input.");
    });
  });

  describe("command templates", () => {
    it("should use a command title template with execTemplate", async () => {
      server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
      const testShell = createTestShell();
      const backend = createPushcutBackend(
        makeConfig({ title: { "session.idle": { command: "echo Agent finished in {project}" } } }),
        testShell
      );
      await backend.send(makeContext({ event: "session.idle" }));
      const captured = getCapturedRequest();
      expect(captured).not.toBeNull();
      const body = JSON.parse(captured!.body);
      expect(body.title).toBe("Agent finished in my-project");
    });

    it("should use a command message template with execTemplate", async () => {
      server.use(captureHandler(`${PUSHCUT_API_BASE}/notifications/MyNotification`));
      const testShell = createTestShell();
      const backend = createPushcutBackend(
        makeConfig({ message: { "session.error": { command: "echo Error: {error} in {project}" } } }),
        testShell
      );
      await backend.send(makeContext({
        event: "session.error",
        metadata: { sessionId: "sess-123", projectName: "my-project", timestamp: "2026-01-01T00:00:00.000Z", error: "something broke" },
      }));
      const captured = getCapturedRequest();
      expect(captured).not.toBeNull();
      const body = JSON.parse(captured!.body);
      expect(body.text).toBe("Error: something broke in my-project");
    });
  });
});
