# opencode-ntfy.sh

You are building an OpenCode plugin that sends push notifications via ntfy.sh.

## Goal

Build a TypeScript OpenCode plugin (`opencode-ntfy.sh`) that sends push notifications to a user's phone or desktop via the ntfy.sh service when key events occur during an OpenCode session.

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

## Specifications

### Plugin Behavior

- The plugin must be installable via npm or by placing it in `.opencode/plugins/`.
- The plugin must send ntfy.sh notifications on the following events via the `event` hook:
  - `session.idle` -- when the agent finishes and is waiting for input
  - `session.error` -- when a session encounters an error
  - `permission.asked` -- when the agent needs permission to perform an action
- **Subagent suppression:** `session.idle` and `session.error` events from subagent (child) sessions must be silently suppressed. When a subagent completes or errors, control returns to the parent agent, so there is nothing for the user to act on. The plugin must use the `client` from the plugin input to call `client.session.get()` with the session ID from the event's properties to determine whether the session has a `parentID`. If it does, the event is from a subagent and no notification is sent. If the session lookup fails (e.g., network error, missing session), the plugin must fall through and send the notification anyway to avoid silently dropping notifications due to transient failures.
- Default notifications must include:
  - The event type
  - The project name (derived from the working directory)
  - A timestamp
  - For errors: the error message
  - For permissions: the permission type and patterns
- The plugin must be configurable via a JSON configuration file located at `~/.config/opencode/opencode-ntfy.json`, following the pattern established by plugins like `opencode-notifier`. The configuration file has an associated JSON Schema (see [Configuration File](#configuration-file) below for full details).
  - If the config file does not exist, the plugin is disabled (returns empty hooks).
  - If the config file exists but cannot be parsed, the plugin must throw an error.
  - The config file must contain at minimum a `topic` field.
  - All other fields are optional and have sensible defaults.

### Configuration File

The plugin is configured via a JSON file at `~/.config/opencode/opencode-ntfy.json`. The configuration file must have an associated JSON Schema bundled in the repository at `opencode-ntfy.schema.json`. This schema file must be published with the npm package so that users can reference it in their config file for editor autocompletion and validation.

Users can reference the schema in their config file using the `$schema` property:

```json
{
  "$schema": "node_modules/opencode-ntfy.sh/opencode-ntfy.schema.json",
  "topic": "my-topic"
}
```

#### Configuration Properties

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `$schema` | `string` | No | -- | Path or URL to the JSON Schema for editor validation and autocompletion |
| `topic` | `string` | **Yes** | -- | The ntfy.sh topic to publish to |
| `server` | `string` | No | `"https://ntfy.sh"` | The ntfy.sh server URL |
| `token` | `string` | No | -- | Bearer token for authentication |
| `priority` | `string` | No | `"default"` | Global notification priority (`min`, `low`, `default`, `high`, `max`) |
| `iconMode` | `string` | No | `"dark"` | Whether the target device uses `light` or `dark` mode |
| `iconLight` | `string` | No | -- | Custom icon URL override for light mode |
| `iconDark` | `string` | No | -- | Custom icon URL override for dark mode |
| `fetchTimeout` | `string` | No | -- | ISO 8601 duration for the HTTP request timeout when calling the ntfy.sh server (e.g., `PT10S` for 10 seconds, `PT1M` for 1 minute). The duration is parsed using `parseISO8601Duration()` (which delegates to a third-party ISO 8601 duration library). When set, the `fetch` call in `sendNotification` uses an `AbortSignal.timeout()` to enforce the timeout. When not set, no timeout is applied (the request uses the default `fetch` behavior). |
| `events` | `object` | No | -- | Per-event custom command overrides (see [Custom Notification Commands](#custom-notification-commands)) |

#### Example Configuration

```json
{
  "$schema": "node_modules/opencode-ntfy.sh/opencode-ntfy.schema.json",
  "topic": "my-notifications",
  "server": "https://ntfy.sh",
  "priority": "default",
  "iconMode": "dark",
  "fetchTimeout": "PT10S",
  "events": {
    "session.idle": {
      "titleCmd": "printf \"%s\" \"Agent Idle\"",
      "messageCmd": "printf \"%s\" \"The agent has finished and is waiting for input.\"",
      "tagsCmd": "printf \"%s\" \"hourglass_done\"",
      "priorityCmd": "printf \"%s\" \"default\""
    }
  }
}
```

#### Config Loading

The `loadConfig()` function in `src/config.ts` must:

1. Construct the config file path via `join(homedir(), ".config", "opencode", "opencode-ntfy.json")` using Node.js `os.homedir()` and `path.join()`
2. Check if the file exists -- if not, return `undefined` (plugin is disabled)
3. Read the file with `readFileSync()` and parse with `JSON.parse()`
4. Validate the parsed object against the expected schema (required fields, valid enum values, valid ISO 8601 duration for `fetchTimeout` where applicable)
5. Throw an error if the file exists but contains invalid JSON or fails validation
6. Return the typed `NtfyConfig` object with defaults applied for omitted optional fields

#### JSON Schema

The JSON Schema file (`opencode-ntfy.schema.json`) must:

- Be a valid JSON Schema (draft 2020-12 or later)
- Define all configuration properties with their types, descriptions, defaults, and constraints
- Use `enum` for fields with a fixed set of valid values (e.g., `priority`, `iconMode`)
- Use `pattern` for fields with specific formats where appropriate
- Mark `topic` as required
- Include `additionalProperties: false` at the top level to catch typos
- Include `$schema` as an allowed property so users can reference the schema from within their config file
- Be included in the npm package `files` list in `package.json`

### Custom Notification Commands

Each notification field (title, message, tags, priority) can be customized per event by setting a shell command in the `events` section of the config file. The command's stdout (trimmed) is used as the field value. If the command is not set or fails, the hardcoded default is used silently.

Commands are executed via the Bun `$` shell provided by the OpenCode plugin input. Before execution, template variables in the command string are substituted with their values. Unset variables are substituted with empty strings.

#### Event Command Fields

Per-event commands are specified in the `events` object of the config file, keyed by event type. Each event object supports the following optional fields:

| Field | Description |
|---|---|
| `titleCmd` | Shell command whose stdout is used as the notification title |
| `messageCmd` | Shell command whose stdout is used as the notification message body |
| `tagsCmd` | Shell command whose stdout is used as the notification tags |
| `priorityCmd` | Shell command whose stdout is used as the notification priority |

The supported event keys are: `session.idle`, `session.error`, `permission.asked`.

#### Template Variables

| Variable | Available In | Description |
|---|---|---|
| `${event}` | All events | The event type string (e.g., `session.idle`) |
| `${time}` | All events | ISO 8601 timestamp |
| `${error}` | `session.error` only | The error message (empty string for other events) |
| `${permission_type}` | `permission.asked` only | The permission type (empty string for other events) |
| `${permission_patterns}` | `permission.asked` only | Comma-separated list of patterns (empty string for other events) |

#### Default Values

When a custom command field is not set in the config, the following POSIX-compliant commands are used as defaults to populate the notification title and message content. These commands intentionally omit a trailing newline.

##### Title Defaults

| Event | Default Command |
|---|---|
| `session.idle` | `printf "%s" "Agent Idle"` |
| `session.error` | `printf "%s" "Agent Error"` |
| `permission.asked` | `printf "%s" "Permission Asked"` |

##### Message Content Defaults

| Event | Default Command |
|---|---|
| `session.idle` | `printf "%s" "The agent has finished and is waiting for input."` |
| `session.error` | `printf "%s" "An error has occurred. Check the session for details."` |
| `permission.asked` | `printf "%s" "The agent needs permission to continue. Review and respond."` |

##### Tag Defaults

Each event type has a default tag used when no custom `tagsCmd` is set. These tags correspond to emoji shortcodes supported by ntfy.sh:

| Event | Default Tag | Emoji |
|---|---|---|
| `session.idle` | `hourglass_done` | ⌛ |
| `session.error` | `warning` | ⚠️ |
| `permission.asked` | `lock` | 🔒 |

The README must document these default tags alongside the default title and message values.

#### Execution Details

The module `src/exec.ts` provides a `resolveField` function that:

1. Takes the Bun `$` shell, a command template string (or `undefined`), a variables record, and a fallback default value
2. If the command template is `undefined` or empty, returns the fallback
3. Substitutes all `${var_name}` placeholders in the command with values from the variables record
4. Executes the substituted command via the Bun `$` shell, capturing stdout
5. Returns the trimmed stdout if the command succeeds
6. Returns the fallback value if the command fails (non-zero exit, exception, etc.)

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

- `iconMode` (optional, defaults to `"dark"`) -- determines which icon variant to use. Must be `"light"` or `"dark"`. If unset or set to any other value, defaults to `"dark"`. This setting reflects whether the target device receiving push notifications uses light or dark mode.
- `iconLight` (optional) -- custom URL to use as the notification icon when `iconMode` is `"light"`. When set, this overrides the default light mode icon URL. Must point to a JPEG or PNG image.
- `iconDark` (optional) -- custom URL to use as the notification icon when `iconMode` is `"dark"`. When set, this overrides the default dark mode icon URL. Must point to a JPEG or PNG image.

The icon resolution logic is:

1. Determine the mode from `iconMode` (default: `"dark"`).
2. If the mode is `"light"` and `iconLight` is set, use that URL.
3. If the mode is `"dark"` and `iconDark` is set, use that URL.
4. Otherwise, use the default `raw.githubusercontent.com` PNG URL for the corresponding mode.

### Publishing via ntfy.sh

Notifications are sent via HTTP POST:

```
POST https://ntfy.sh/<topic>
Headers:
  Title: <title>
  Priority: <priority>
  Tags: <tags>
  X-Icon: <resolved icon URL based on mode and config settings>
  Authorization: Bearer <token>  (if token is set)
Body: <message>
```

The `NotificationPayload` type must include an optional `priority` field. When set, it overrides the global `config.priority` for that specific notification. This allows per-event priority commands to take effect.

When `config.fetchTimeout` is set (parsed from the `fetchTimeout` config property), the `fetch` call must include a `signal` option set to `AbortSignal.timeout(config.fetchTimeout)` where `config.fetchTimeout` is the timeout in milliseconds. This ensures the HTTP request is aborted if the ntfy.sh server does not respond within the configured duration.

### Node.js Version Support

The plugin must support all currently supported versions of Node.js (i.e., versions that have not reached end-of-life). As of the time of writing, the supported versions are Node.js 20, 22, and 24. This support must be enforced in two ways:

1. **`engines` field in `package.json`**: Set the `engines.node` field to restrict the minimum supported Node.js version. Since the plugin relies on native `fetch` (available since Node.js 18) and uses ES module syntax, the minimum version must match the oldest currently supported Node.js release (e.g., `>=20`). Update this field as Node.js versions reach end-of-life.
2. **CI matrix in `.github/workflows/ci.yml`**: The CI pipeline must use a matrix strategy to run lint, build, and test steps against all currently supported Node.js versions. This ensures compatibility is verified on every pull request and push. The publish step must only run once (on the latest Node.js version) to avoid duplicate publishes.

### Tech Stack

- TypeScript
- ESLint with typescript-eslint for linting
- Vitest for testing
- Small third-party runtime dependencies are allowed and preferred for well-scoped problems. In particular:
  - Use a small library for parsing ISO 8601 duration strings (e.g., `iso8601-duration` or similar) instead of hand-rolling a parser in `parseISO8601Duration()`.
- Beyond the above, avoid unnecessary runtime dependencies. Node.js built-in `fetch` is used for HTTP requests.
- Publishable as an npm package

### Project Structure

```
opencode-ntfy.sh/
  assets/
    opencode-icon-light.png  # OpenCode icon for light mode (not published to npm)
    opencode-icon-dark.png   # OpenCode icon for dark mode (not published to npm)
  src/
    index.ts          # Plugin entry point and export
    notify.ts         # ntfy.sh HTTP client
    config.ts         # Configuration from JSON config file
    exec.ts           # Command execution and template variable substitution
  tests/
    notify.test.ts    # Tests for the notification client
    config.test.ts    # Tests for configuration loading
    plugin.test.ts    # Tests for the plugin hooks
    exec.test.ts      # Tests for command execution
    typecheck.test.ts # Compile-time type conformance tests
    mock-shell.ts     # Shared mock BunShell factory
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
