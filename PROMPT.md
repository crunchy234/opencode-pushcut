# opencode-ntfy.sh

You are building an OpenCode notification backend plugin for ntfy.sh, built on the `opencode-notification-sdk`.

## Goal

Build a TypeScript OpenCode plugin (`opencode-ntfy.sh`) that delivers push notifications to a user's phone or desktop via the ntfy.sh service. This plugin is a **notification backend** for the [`opencode-notification-sdk`](https://www.npmjs.com/package/opencode-notification-sdk). The SDK handles all common notification logic (event routing, subagent suppression, shell command template resolution, default content). This project is responsible only for the ntfy.sh-specific concerns: formatting and sending the HTTP POST request, validating ntfy-specific configuration, and resolving the notification icon URL.

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
- **Linting is required.** All source and test code must pass `npm run lint` before committing. The linter uses ESLint with typescript-eslint and is configured in `eslint.config.js`.
- **Prefer immutability and pure functions.** Favor immutable data and pure functions over mutable state and side effects. Avoid mutating function arguments or shared state. When a function needs to produce a modified value, return a new value rather than mutating the input. Side effects (I/O, network calls, filesystem access) should be pushed to the edges of the system so that core logic remains pure and easy to test.
- **No implementation-coupled test doubles.** Tests must not use mocks, spies, stubs, monkey-patching, or module patching that couple the test to the internal implementation of the unit under test. This includes -- but is not limited to -- `vi.mock()`, `vi.spyOn()`, `vi.fn()`, `vi.stubGlobal()`, and manual mock files. Design production code so that dependencies can be supplied directly (e.g., via function parameters or options objects) rather than requiring interception at the module or global level. Network-level interception libraries like MSW are permitted because they operate at the HTTP boundary without coupling tests to implementation details.

## Specifications

### Relationship to the SDK

This plugin depends on `opencode-notification-sdk` as a runtime dependency. The SDK provides:

- **Event routing** -- classifying raw OpenCode events into notification types (`session.idle`, `session.error`, `permission.asked`)
- **Subagent suppression** -- silently suppressing notifications from sub-agent (child) sessions for `session.idle` and `session.error` events
- **Shell command templates** -- user-customizable notification titles and messages via shell commands with `{var_name}` substitution
- **Default notification content** -- sensible default titles and messages for every event type
- **Configuration loading** -- reading and parsing the config file, handling the `enabled`, `events`, and `templates` sections
- **Plugin factory** -- `createNotificationPlugin()` wires everything together and returns a valid OpenCode `Plugin`

This project implements the `NotificationBackend` interface from the SDK, which requires a single method:

```typescript
interface NotificationBackend {
  send(context: NotificationContext): Promise<void>;
}
```

The SDK calls `send()` only after all filtering (event classification, enabled checks, subagent suppression) and content resolution (shell command templates or defaults) are complete. The `NotificationContext` passed to `send()` contains the resolved `event`, `title`, `message`, and `metadata`.

### Plugin Behavior

- The plugin must be installable via npm or by placing it in `.opencode/plugins/`.
- The plugin uses `createNotificationPlugin()` from the SDK with `backendConfigKey: "ntfy"` to create the OpenCode plugin.
- The SDK handles all event routing, subagent suppression, and content resolution. This plugin does not implement any of that logic.
- The plugin's sole responsibility is delivering the notification via the ntfy.sh HTTP API when the SDK calls `backend.send()`.

### Configuration File

The plugin is configured via a JSON file at `~/.config/opencode/notification-ntfy.json`. The config file path is determined by the SDK based on the `backendConfigKey` of `"ntfy"`.

The config file follows the SDK's configuration schema at the top level, with ntfy-specific settings under the `backend` key.

#### Full Configuration Structure

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | `boolean` | No | `true` | Global kill switch for all notifications (handled by SDK) |
| `events` | `object` | No | (all enabled) | Per-event enable/disable toggles (handled by SDK) |
| `events.<type>.enabled` | `boolean` | No | `true` | Whether this event type triggers notifications (handled by SDK) |
| `templates` | `object \| null` | No | `null` | Per-event shell command templates (handled by SDK) |
| `templates.<type>.titleCmd` | `string \| null` | No | `null` | Shell command to generate notification title (handled by SDK) |
| `templates.<type>.messageCmd` | `string \| null` | No | `null` | Shell command to generate notification message (handled by SDK) |
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
  "templates": {
    "session.idle": {
      "titleCmd": "echo 'Custom Idle Title'",
      "messageCmd": null
    }
  },
  "backend": {
    "topic": "my-notifications",
    "server": "https://ntfy.sh",
    "priority": "default",
    "icon": {
      "mode": "dark"
    },
    "fetchTimeout": "PT10S"
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
7. Return a typed `NtfyBackendConfig` object

#### JSON Schema

The JSON Schema file (`opencode-ntfy.schema.json`) must:

- Be a valid JSON Schema (draft 2020-12 or later)
- Define the full configuration structure including SDK-level properties (`enabled`, `events`, `templates`) and the `backend` object with all ntfy-specific properties
- Use `enum` for fields with a fixed set of valid values (e.g., `priority`, `icon.mode`)
- Use `pattern` for fields with specific formats where appropriate
- Mark `backend.topic` as required when `backend` is present
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
  Title: <title from NotificationContext>
  Priority: <priority from backend config>
  Tags: <default tag for the event type>
  X-Icon: <resolved icon URL based on mode and config settings>
  Authorization: Bearer <token>  (if token is set)
Body: <message from NotificationContext>
```

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

### Node.js Version Support

The plugin must support all currently supported versions of Node.js (i.e., versions that have not reached end-of-life). As of the time of writing, the supported versions are Node.js 20, 22, and 24. This support must be enforced in two ways:

1. **`engines` field in `package.json`**: Set the `engines.node` field to restrict the minimum supported Node.js version. Since the plugin relies on native `fetch` (available since Node.js 18) and uses ES module syntax, the minimum version must match the oldest currently supported Node.js release (e.g., `>=20`). Update this field as Node.js versions reach end-of-life.
2. **CI matrix in `.github/workflows/ci.yml`**: The CI pipeline must use a matrix strategy to run lint, build, and test steps against all currently supported Node.js versions. This ensures compatibility is verified on every pull request and push. The publish step must only run once (on the latest Node.js version) to avoid duplicate publishes.

### Tech Stack

- TypeScript
- ESLint with typescript-eslint for linting
- Vitest for testing
- `opencode-notification-sdk` as a runtime dependency
- Small third-party runtime dependencies are allowed and preferred for well-scoped problems. In particular:
  - Use a small library for parsing ISO 8601 duration strings (e.g., `iso8601-duration` or similar) instead of hand-rolling a parser.
- Beyond the above, avoid unnecessary runtime dependencies. Node.js built-in `fetch` is used for HTTP requests.
- Publishable as an npm package

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
  opencode-ntfy.schema.json  # JSON Schema for the config file (published with npm package)
  eslint.config.js      # ESLint configuration
  package.json
  tsconfig.json
  vitest.config.ts
  PROMPT.md           # This file
  PLAN.md             # Implementation plan / task tracker
  ralph.sh            # The loop script
```
