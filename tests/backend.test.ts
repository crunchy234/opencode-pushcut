import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse, delay } from "msw";
import type { NotificationContext } from "opencode-notification-sdk";
import { createNtfyBackend } from "../src/backend.js";
import type { NtfyBackendConfig } from "../src/config.js";
import {
  server,
  captureHandler,
  getCapturedRequest,
  resetCapturedRequest,
} from "./msw-helpers.js";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  resetCapturedRequest();
  server.resetHandlers();
});
afterAll(() => server.close());

function makeContext(overrides: Partial<NotificationContext> = {}): NotificationContext {
  return {
    event: "session.idle",
    title: "Test Title",
    message: "Test message",
    metadata: {
      sessionId: "sess-123",
      projectName: "my-project",
      timestamp: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

function makeConfig(overrides: Partial<NtfyBackendConfig> = {}): NtfyBackendConfig {
  return {
    topic: "my-topic",
    server: "https://ntfy.sh",
    priority: "default",
    iconUrl: "https://example.com/icon.png",
    ...overrides,
  };
}

describe("createNtfyBackend", () => {
  it("should send a POST request with correct headers and body", async () => {
    server.use(captureHandler("https://ntfy.sh/my-topic"));

    const backend = createNtfyBackend(makeConfig());
    await backend.send(makeContext());

    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe("https://ntfy.sh/my-topic");
    expect(captured!.method).toBe("POST");
    expect(captured!.headers.get("Title")).toBe("Test Title");
    expect(captured!.headers.get("Priority")).toBe("default");
    expect(captured!.body).toBe("Test message");
  });

  it("should use the default tag 'hourglass_done' for session.idle events", async () => {
    server.use(captureHandler("https://ntfy.sh/my-topic"));

    const backend = createNtfyBackend(makeConfig());
    await backend.send(makeContext({ event: "session.idle" }));

    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.headers.get("Tags")).toBe("hourglass_done");
  });

  it("should use the default tag 'warning' for session.error events", async () => {
    server.use(captureHandler("https://ntfy.sh/my-topic"));

    const backend = createNtfyBackend(makeConfig());
    await backend.send(makeContext({ event: "session.error" }));

    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.headers.get("Tags")).toBe("warning");
  });

  it("should use the default tag 'lock' for permission.asked events", async () => {
    server.use(captureHandler("https://ntfy.sh/my-topic"));

    const backend = createNtfyBackend(makeConfig());
    await backend.send(makeContext({ event: "permission.asked" }));

    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.headers.get("Tags")).toBe("lock");
  });

  it("should include X-Icon header from config", async () => {
    server.use(captureHandler("https://ntfy.sh/my-topic"));

    const backend = createNtfyBackend(
      makeConfig({ iconUrl: "https://example.com/custom-icon.png" })
    );
    await backend.send(makeContext());

    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.headers.get("X-Icon")).toBe(
      "https://example.com/custom-icon.png"
    );
  });

  it("should not include Authorization header when token is not set", async () => {
    server.use(captureHandler("https://ntfy.sh/my-topic"));

    const backend = createNtfyBackend(makeConfig());
    await backend.send(makeContext());

    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.headers.get("Authorization")).toBeNull();
  });

  it("should include Authorization header when token is set", async () => {
    server.use(captureHandler("https://ntfy.sh/my-topic"));

    const backend = createNtfyBackend(
      makeConfig({ token: "my-secret-token" })
    );
    await backend.send(makeContext());

    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.headers.get("Authorization")).toBe(
      "Bearer my-secret-token"
    );
  });

  it("should abort the request when fetchTimeout is set and server is slow", async () => {
    server.use(
      http.post("https://ntfy.sh/my-topic", async () => {
        await delay(5000);
        return HttpResponse.text("ok");
      })
    );

    const backend = createNtfyBackend(makeConfig({ fetchTimeout: 50 }));

    await expect(backend.send(makeContext())).rejects.toThrow();
  });

  it("should succeed when fetchTimeout is not set even with a slightly slow server", async () => {
    server.use(
      http.post("https://ntfy.sh/my-topic", async () => {
        await delay(50);
        return HttpResponse.text("ok");
      })
    );

    const backend = createNtfyBackend(makeConfig());

    await expect(backend.send(makeContext())).resolves.toBeUndefined();
  });

  it("should throw when the server responds with a non-ok status", async () => {
    server.use(
      http.post("https://ntfy.sh/my-topic", () => {
        return new HttpResponse(null, {
          status: 500,
          statusText: "Server Error",
        });
      })
    );

    const backend = createNtfyBackend(makeConfig());

    await expect(backend.send(makeContext())).rejects.toThrow("500");
  });

  it("should use config priority in the header", async () => {
    server.use(captureHandler("https://ntfy.sh/my-topic"));

    const backend = createNtfyBackend(makeConfig({ priority: "high" }));
    await backend.send(makeContext());

    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.headers.get("Priority")).toBe("high");
  });

  it("should send to the configured server and topic", async () => {
    server.use(captureHandler("https://custom.ntfy.sh/special-topic"));

    const backend = createNtfyBackend(
      makeConfig({ server: "https://custom.ntfy.sh", topic: "special-topic" })
    );
    await backend.send(makeContext());

    const captured = getCapturedRequest();
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe("https://custom.ntfy.sh/special-topic");
  });
});
