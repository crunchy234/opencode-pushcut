# opencode-ntfy.sh

You are building an OpenCode notification backend plugin for ntfy.sh, built on the `opencode-notification-sdk`.

## Goal

Build a TypeScript OpenCode plugin (`opencode-ntfy.sh`) that delivers push notifications to a user's phone or desktop via the ntfy.sh service. This plugin is a **notification backend** for the [`opencode-notification-sdk`](https://www.npmjs.com/package/opencode-notification-sdk). The SDK handles common notification logic (event routing, subagent suppression). This project is responsible for the ntfy.sh-specific concerns: producing notification content (title and message), formatting and sending the HTTP POST request, validating ntfy-specific configuration, and resolving the notification icon URL.

## Instructions

1. Read the PLAN.md to understand the current state of implementation.
2. If all items in PLAN.md are complete and match this prompt's specifications, output exactly `<promise>Done</promise>` and stop. Do not make any changes.
3. Pick the SINGLE highest priority incomplete item from PLAN.md and implement it.
4. Ensure tests pass after your changes.
5. Update PLAN.md with your progress.
6. If your changes affect user-facing behavior, configuration, or project structure, update `README.md` to reflect the current state of the project. The README must accurately document how to install, configure, and use the plugin based on the actual implementation, not legacy or outdated approaches.
7. Commit all changes with `git add -A && git commit -m "..."`.

If there is a discrepancy between PLAN.md and this prompt, always update PLAN.md to match this prompt.

### Code Quality Rules

- **No type casting.** Never use `as`, `as any`, `as unknown`, or similar type assertions. If the types don't align, fix the type definitions or use type guards, generics, or proper type narrowing instead. This is enforced by ESLint via the `@typescript-eslint/consistent-type-assertions` rule with `assertionStyle: "never"`.
- **Prefer constants.** Use `const` variables instead of `let` wherever the value is not reassigned. For object literals, arrays, and other compound values that should be deeply immutable, use `as const` assertions (const assertions) to narrow types to their literal values. This improves type safety, communicates intent, and prevents accidental mutation.
- **Linting is required.** All source and test code must pass `bun run lint` before committing. The linter uses ESLint with typescript-eslint and is configured in `eslint.config.js`.
- **Prefer immutability and pure functions.** Favor immutable data and pure functions over mutable state and side effects. Avoid mutating function arguments or shared state. When a function needs to produce a modified value, return a new value rather than mutating the input. Side effects (I/O, network calls, filesystem access) should be pushed to the edges of the system so that core logic remains pure and easy to test.
- **No implementation-coupled test doubles.** Tests must not use mocks, spies, stubs, monkey-patching, or module patching that couple the test to the internal implementation of the unit under test. This includes -- but is not limited to -- `vi.mock()`, `vi.spyOn()`, `vi.fn()`, `vi.stubGlobal()`, and manual mock files. Design production code so that dependencies can be supplied directly (e.g., via function parameters or options objects) rather than requiring interception at the module or global level. Network-level interception libraries like MSW are permitted because they operate at the HTTP boundary without coupling tests to implementation details.

## Specifications

### Relationship to the SDK

This plugin depends on `opencode-notification-sdk` as a runtime dependency. The SDK provides:

- **Event routing** -- classifying raw OpenCode events into notification types (`session.idle`, `session.error`, `permission.asked`)
- **Subagent suppression** -- silently suppressing notifications from sub-agent (child) sessions for `session.idle` and `session.error` events
- **Configuration loading** -- reading and parsing the config file, handling the `enabled` and `events` sections. `getBackendConfig(config, backendName)` extracts the backend-specific configuration object (the second `backendName` argument is required).
- **Plugin factory** -- `createNotificationPlugin()` wires everything together and returns a valid OpenCode `Plugin`

This project implements the `NotificationBackend` interface from the SDK, which requires a single method:

```typescript
interface NotificationBackend {
  send(context: NotificationContext): Promise<void>;
}
```

The SDK calls `send()` only after all filtering (event classification, enabled checks, subagent suppression) is complete. The `NotificationContext` passed to `send()` contains the `event` and `metadata`. The SDK does not prescribe what fields a notification must contain (e.g., title, message) -- backends are fully responsible for deciding what content to produce and how to produce it.

### Plugin Behavior

- The plugin must be installable from the npm registry (e.g., `bun add opencode-ntfy.sh`) or by placing it in `.opencode/plugins/`.
- The plugin uses `createNotificationPlugin()` from the SDK with `backendConfigKey: "ntfy"` to create the OpenCode plugin.
- The SDK handles all event routing and subagent suppression. This plugin does not implement any of that logic.
- The plugin is responsible for producing notification content (title and message) and delivering the notification via the ntfy.sh HTTP API when the SDK calls `backend.send()`. The backend resolves the title and message using the SDK's `renderTemplate` (for `value` templates) or `execTemplate` (for `command` templates), based on per-event configuration in `backend.title` and `backend.message`. See [Notification Content](#notification-content) for full details.

### Configuration File

The plugin is configured via a JSON file at `~/.config/opencode/notification-ntfy.json`. The config file path is determined by the SDK based on the `backendConfigKey` of `"ntfy"`.

The config file follows the SDK's configuration schema at the top level, with ntfy-specific settings under the `backend` key.

#### Full Configuration Structure

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | `boolean` | No | `true` | Global kill switch for all notifications (handled by SDK) |
| `events` | `object` | No | (all enabled) | Per-event enable/disable toggles (handled by SDK) |
| `events.<type>.enabled` | `boolean` | No | `true` | Whether this event type triggers notifications (handled by SDK) |
| `backend` | `object` | No | `{}` | ntfy.sh-specific configuration (see below) |

#### Backend Configuration Properties

The `backend` object contains all ntfy.sh-specific settings:

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `backend.topic` | `string` | **Yes** | -- | The ntfy.sh topic to publish to |
| `backend.server` | `string` | No | `"https://ntfy.sh"` | The ntfy.sh server URL |
| `backend.token` | `string` | No | -- | Bearer token for authentication |
| `backend.priority` | `string` | No | `"default"` | Notification priority (`min`, `low`, `default`, `high`, `max`) |
| `backend.icon` | `object` | No | -- | Icon configuration object (see [Notification Icons](#notification-icons)) |
| `backend.icon.mode` | `string` | No | `"dark"` | Whether the target device uses `light` or `dark` mode |
| `backend.icon.variant` | `object` | No | -- | Custom icon URL overrides per mode variant |
| `backend.icon.variant.light` | `string` | No | -- | Custom icon URL override for light mode |
| `backend.icon.variant.dark` | `string` | No | -- | Custom icon URL override for dark mode |
| `backend.title` | `object` | No | (see [Notification Content](#notification-content)) | Title configuration per event type |
| `backend.title.<event>` | `object` | No | (see defaults) | Content template for the notification title of a specific event type. Must contain exactly one of `value` or `command`. |
| `backend.title.<event>.value` | `string` | No | -- | A template string rendered via `renderTemplate` and used directly as the title |
| `backend.title.<event>.command` | `string` | No | -- | A template string rendered via `renderTemplate`, then executed as a shell command via `execTemplate`; the trimmed stdout is used as the title |
| `backend.message` | `object` | No | (see [Notification Content](#notification-content)) | Message configuration per event type |
| `backend.message.<event>` | `object` | No | (see defaults) | Content template for the notification message of a specific event type. Must contain exactly one of `value` or `command`. |
| `backend.message.<event>.value` | `string` | No | -- | A template string rendered via `renderTemplate` and used directly as the message |
| `backend.message.<event>.command` | `string` | No | -- | A template string rendered via `renderTemplate`, then executed as a shell command via `execTemplate`; the trimmed stdout is used as the message |
| `backend.fetchTimeout` | `string` | No | -- | ISO 8601 duration for the HTTP request timeout (e.g., `PT10S` for 10 seconds) |

#### Example Configuration

```json
{
  "enabled": true,
  "events": {
    "session.idle": { "enabled": true },
    "session.error": { "enabled": true },
    "permission.asked": { "enabled": true }
  },
  "backend": {
    "topic": "my-notifications",
    "server": "https://ntfy.sh",
    "priority": "default",
    "title": {
      "session.idle": { "value": "{project}: Agent Idle" },
      "session.error": { "value": "{project}: Agent Error" }
    },
    "message": {
      "session.error": { "value": "Error in {project}: {error}" }
    },
    "icon": {
      "mode": "dark"
    },
    "fetchTimeout": "PT10S"
  }
}
```

#### Notification Content

The notification title and message are configurable per event type via the `backend.title` and `backend.message` objects. Each key in these objects is a `NotificationEvent` string (`session.idle`, `session.error`, `permission.asked`), and the value is an object containing exactly one of two mutually exclusive keys:

- **`value`** -- A template string that is rendered via `renderTemplate(template, context)` from the SDK and used directly as the resolved content. This is a pure, synchronous string interpolation with no I/O or shell execution. Unrecognized `{var_name}` placeholders are replaced with empty strings.
- **`command`** -- A template string that is rendered via `renderTemplate` to substitute `{var_name}` placeholders, then executed as a shell command via `execTemplate($, template, context)` from the SDK. The trimmed stdout of the command is used as the resolved content. If the command fails (non-zero exit code), `execTemplate` throws an error.

Each per-event object must contain exactly one of `value` or `command`. Specifying both or neither is a validation error.

##### Available Template Variables

The following `{var_name}` placeholders are available in both `value` and `command` strings:

| Variable | Source | Description |
|---|---|---|
| `{event}` | `context.event` | Event type (e.g., `session.idle`) |
| `{time}` | `context.metadata.timestamp` | ISO 8601 timestamp |
| `{project}` | `context.metadata.projectName` | Project directory basename |
| `{session_id}` | `context.metadata.sessionId` | Session ID (empty if unavailable) |
| `{error}` | `context.metadata.error` | Error message (empty if not an error event) |
| `{permission_type}` | `context.metadata.permissionType` | Permission type (empty if not a permission event) |
| `{permission_patterns}` | `context.metadata.permissionPatterns` | Comma-separated patterns (empty if not a permission event) |

##### Default Values

When `backend.title` or `backend.message` is omitted, or when a specific event type key is not present within them, the following defaults are used. These defaults behave as `value` templates (not commands):

| Event | Default Title | Default Message |
|---|---|---|
| `session.idle` | `Agent Idle` | `The agent has finished and is waiting for input.` |
| `session.error` | `Agent Error` | `An error has occurred. Check the session for details.` |
| `permission.asked` | `Permission Asked` | `The agent needs permission to continue. Review and respond.` |

##### Backend Access to `$`

Because `execTemplate` requires the OpenCode `$` shell (from `PluginInput["$"]`), and the `NotificationBackend.send()` method only receives a `NotificationContext`, the `$` shell must be made available to the backend at construction time. The plugin entry point (`src/index.ts`) must pass `$` to `createNtfyBackend()` so that the backend can use it when resolving `command` templates. If no `command` templates are configured, `$` is never invoked.

##### Examples

Using `value` (rendered via `renderTemplate`, used directly):
```json
{
  "backend": {
    "topic": "my-notifications",
    "title": {
      "session.idle": { "value": "{project}: Agent Idle" }
    },
    "message": {
      "session.error": { "value": "Error in {project}: {error}" }
    }
  }
}
```

Using `command` (rendered via `renderTemplate`, then executed via `execTemplate`):
```json
{
  "backend": {
    "topic": "my-notifications",
    "title": {
      "session.idle": { "command": "echo Agent finished in {project}" }
    },
    "message": {
      "permission.asked": { "command": "echo Permission {permission_type} requested for {permission_patterns}" }
    }
  }
}
```

Mixing both approaches across different event types:
```json
{
  "backend": {
    "topic": "my-notifications",
    "title": {
      "session.idle": { "value": "{project}: Agent Idle" },
      "session.error": { "command": "echo {project} error at $(date)" }
    }
  }
}
```

#### Backend Config Parsing

The `parseNtfyBackendConfig()` function in `src/config.ts` must:

1. Accept a `Record<string, unknown>` (the raw `backend` object from the SDK config)
2. Validate that `topic` is a non-empty string; throw if missing or invalid
3. Apply defaults for optional fields (`server`, `priority`, icon mode)
4. Validate `priority` against the allowed enum values (`min`, `low`, `default`, `high`, `max`); throw if invalid
5. Parse `fetchTimeout` from an ISO 8601 duration string to milliseconds using a third-party library; throw if the string is invalid
6. Resolve the icon URL based on `icon.mode` and `icon.variant` overrides
7. Parse `title` and `message` objects if present. Each must be an object mapping `NotificationEvent` strings to content template objects. Validate that keys are valid event types and each value is an object containing exactly one of `value` (string) or `command` (string) -- throw if both or neither are present, or if the types are wrong. Store them in the config for use at send time. Missing event type keys use the defaults described in [Notification Content](#notification-content).
8. Return a typed `NtfyBackendConfig` object

#### JSON Schema

The JSON Schema file (`notification-ntfy.schema.json`) must:

- Be a valid JSON Schema (draft 2020-12 or later)
- Define the full configuration structure including SDK-level properties (`enabled`, `events`) and the `backend` object with all ntfy-specific properties
- Use `enum` for fields with a fixed set of valid values (e.g., `priority`, `icon.mode`)
- Use `pattern` for fields with specific formats where appropriate
- Mark `backend.topic` as required when `backend` is present
- Define `backend.title` and `backend.message` as objects whose properties are the event type names (`session.idle`, `session.error`, `permission.asked`). Each event type property must be an object with a `oneOf` constraint requiring exactly one of `value` (string) or `command` (string)
- Include `additionalProperties: false` at appropriate levels to catch typos
- Be included in the npm package `files` list in `package.json`

### Notification Icons

All notifications must include an icon displayed alongside the notification on supported ntfy.sh clients. The plugin bundles the official OpenCode branded PNG icons sourced from https://opencode.ai/brand and uses them by default.

**Important:** ntfy.sh only supports JPEG and PNG images for icons (not SVG). All icon assets and default URLs must use PNG format.

#### Bundled Icon Assets

The light and dark variants of the OpenCode icon PNG are stored in the top-level `assets/` directory and checked into version control. This directory is **not** included in the published npm package -- the icons are accessed at runtime via their `raw.githubusercontent.com` URLs, so they do not need to be bundled.

- `assets/opencode-icon-dark.png` -- the dark mode icon (for devices using dark mode), sourced from https://opencode.ai/brand
- `assets/opencode-icon-light.png` -- the light mode icon (for devices using light mode), sourced from https://opencode.ai/brand

#### Default Icon Behavior

Since the ntfy.sh `X-Icon` header requires a publicly accessible URL (not a local file), the default icon URL must point to the raw PNG asset hosted on GitHub via `raw.githubusercontent.com`. The appropriate URL is selected based on the configured mode (light or dark).

Default icon URLs are served from this repo's `assets/` directory via `raw.githubusercontent.com`, using the version tag that corresponds to the current package version. The version is read from `package.json` at runtime and the URL is constructed dynamically using the format `v${version}` (e.g., `v0.1.6`):

- Dark mode (default): `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${version}/assets/opencode-icon-dark.png`
- Light mode: `https://raw.githubusercontent.com/lannuttia/opencode-ntfy.sh/v${version}/assets/opencode-icon-light.png`

#### Icon Configuration

- `backend.icon` (optional) -- an object containing icon-related configuration.
  - `backend.icon.mode` (optional, defaults to `"dark"`) -- determines which icon variant to use. Must be `"light"` or `"dark"`. If unset or set to any other value, defaults to `"dark"`. This setting reflects whether the target device receiving push notifications uses light or dark mode.
  - `backend.icon.variant` (optional) -- an object containing custom icon URL overrides per mode variant.
    - `backend.icon.variant.light` (optional) -- custom URL to use as the notification icon when `icon.mode` is `"light"`. When set, this overrides the default light mode icon URL. Must point to a JPEG or PNG image.
    - `backend.icon.variant.dark` (optional) -- custom URL to use as the notification icon when `icon.mode` is `"dark"`. When set, this overrides the default dark mode icon URL. Must point to a JPEG or PNG image.

The icon resolution logic is:

1. Determine the mode from `backend.icon.mode` (default: `"dark"`).
2. If the mode is `"light"` and `backend.icon.variant.light` is set, use that URL.
3. If the mode is `"dark"` and `backend.icon.variant.dark` is set, use that URL.
4. Otherwise, use the default `raw.githubusercontent.com` PNG URL for the corresponding mode.

### Publishing via ntfy.sh

The `send()` method of the notification backend sends notifications via HTTP POST:

```
POST https://ntfy.sh/<topic>
Headers:
  Title: <title produced by the backend>
  Priority: <priority from backend config>
  Tags: <default tag for the event type>
  X-Icon: <resolved icon URL based on mode and config settings>
  Authorization: Bearer <token>  (if token is set)
Body: <message produced by the backend>
```

The backend is responsible for producing the notification title and message. The `NotificationContext` provides only the `event` and `metadata` -- it does not include pre-resolved title or message fields. At send time, the backend looks up the content template for the current event type from `backend.title.<event>` / `backend.message.<event>` (falling back to defaults if not configured). If the template object has a `value` key, the backend calls `renderTemplate(template, context)` from the SDK to perform synchronous `{var_name}` placeholder substitution and uses the result directly. If it has a `command` key, the backend calls `execTemplate($, template, context)` from the SDK to render placeholders and then execute the result as a shell command, using the trimmed stdout as the resolved value. See [Notification Content](#notification-content) for full details on template resolution, available variables, and defaults.

#### Default Tags

Each event type has a default tag. These tags correspond to emoji shortcodes supported by ntfy.sh:

| Event | Default Tag | Emoji |
|---|---|---|
| `session.idle` | `hourglass_done` | ⌛ |
| `session.error` | `warning` | ⚠️ |
| `permission.asked` | `lock` | 🔒 |

#### Fetch Timeout

When `backend.fetchTimeout` is set (parsed from an ISO 8601 duration string to milliseconds), the `fetch` call must include a `signal` option set to `AbortSignal.timeout(config.fetchTimeout)`. This ensures the HTTP request is aborted if the ntfy.sh server does not respond within the configured duration. When not set, no timeout is applied (the request uses the default `fetch` behavior).

#### Error Handling

The `send()` method must throw an error if the ntfy.sh server returns a non-OK (non-2xx) HTTP response. The SDK wraps every call to `send()` in a try/catch and silently ignores errors, so throwing here will not crash the host process.

### Bun Runtime

This is a Bun project. Bun is used as the JavaScript/TypeScript runtime, package manager, and task runner. All commands (`bun install`, `bun run build`, `bun run test`, `bun run lint`) use Bun rather than Node.js or npm.

1. **CI in `.github/workflows/ci.yml`**: The CI pipeline must use Bun (via `oven-sh/setup-bun`) to install dependencies, lint, build, and test. The publish step should use Bun as well.

### Tech Stack

- TypeScript
- ESLint with typescript-eslint for linting
- Vitest for testing
- `opencode-notification-sdk` as a runtime dependency
- Small third-party runtime dependencies are allowed and preferred for well-scoped problems. In particular:
  - Use a small library for parsing ISO 8601 duration strings (e.g., `iso8601-duration` or similar) instead of hand-rolling a parser.
- Beyond the above, avoid unnecessary runtime dependencies. Bun's built-in `fetch` is used for HTTP requests.
- Publishable as an npm package (via `bun publish`)

### Project Structure

```
opencode-ntfy.sh/
  assets/
    opencode-icon-light.png  # OpenCode icon for light mode (not published to npm)
    opencode-icon-dark.png   # OpenCode icon for dark mode (not published to npm)
  src/
    index.ts          # Plugin entry point: wires the SDK to the ntfy.sh backend
    backend.ts        # NotificationBackend implementation (ntfy.sh HTTP client)
    config.ts         # ntfy.sh-specific backend config parsing and validation
  tests/
    backend.test.ts   # Tests for the ntfy.sh backend (HTTP POST, headers, auth, timeout, errors)
    config.test.ts    # Tests for ntfy-specific backend config parsing and validation
    typecheck.test.ts # Compile-time type conformance tests
    msw-helpers.ts    # MSW test helpers for capturing HTTP requests
  notification-ntfy.schema.json  # JSON Schema for the config file (published with npm package)
  eslint.config.js      # ESLint configuration
  package.json
  tsconfig.json
  vitest.config.ts
  PROMPT.md           # This file
  PLAN.md             # Implementation plan / task tracker
  ralph.sh            # The loop script
```
