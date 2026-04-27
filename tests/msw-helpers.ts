import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { execSync } from "node:child_process";
import type { PluginInput } from "@opencode-ai/plugin";

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

const state: { request: CapturedRequest | null } = { request: null };

export function getCapturedRequest(): CapturedRequest | null {
  return state.request;
}

export function resetCapturedRequest(): void {
  state.request = null;
}

export function captureHandler(url: string) {
  return http.post(url, async ({ request }) => {
    state.request = {
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: await request.text(),
    };
    return HttpResponse.text("ok");
  });
}

export const server = setupServer();

export function createTestShell(): PluginInput["$"] {
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
