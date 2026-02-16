# opencode-ntfy.sh

[![CI](https://github.com/lannuttia/opencode-ntfy.sh/actions/workflows/ci.yml/badge.svg)](https://github.com/lannuttia/opencode-ntfy.sh/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/lannuttia/opencode-ntfy.sh/graph/badge.svg)](https://codecov.io/gh/lannuttia/opencode-ntfy.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/lannuttia/opencode-ntfy.sh/blob/main/LICENSE)
[![Snyk Advisor](https://snyk.io/advisor/npm-package/opencode-ntfy.sh/badge.svg)](https://snyk.io/advisor/npm-package/opencode-ntfy.sh)

An [OpenCode](https://opencode.ai) plugin that sends push notifications via
[ntfy.sh](https://ntfy.sh) when your AI coding session finishes or encounters
an error. Start a long-running task, walk away, and get notified on your phone
or desktop when it needs your attention.

## Notifications

The plugin sends notifications for three events:

- **Session Idle** -- The AI agent has finished its work and is waiting for
  input. Includes the project name and timestamp.
- **Session Error** -- The session encountered an error. Includes the project
  name, timestamp, and error message (when available).
- **Permission Asked** -- The agent needs permission to perform an action.
  Includes the project name, timestamp, permission type, and patterns.

### Subagent Suppression

`session.idle` and `session.error` notifications from subagent (child) sessions
are automatically suppressed. When a subagent finishes or errors, control
returns to the parent agent, so there is nothing for the user to act on.
`permission.asked` events are never suppressed, since the user must respond
regardless of which agent requested permission.

If the session lookup fails (e.g., due to a network error), the notification
is sent anyway to avoid silently dropping notifications.

If the config file does not exist, the plugin does nothing.

## Install

Add the package name to the `plugin` array in your OpenCode config file.

opencode.json:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-ntfy.sh"]
}
```

## Configuration

Configuration is done through a JSON file at `~/.config/opencode/opencode-ntfy.json`.

You can reference the bundled JSON Schema for editor autocompletion and
validation by adding a `$schema` property:

```json
{
  "$schema": "node_modules/opencode-ntfy.sh/opencode-ntfy.schema.json",
  "topic": "my-notifications"
}
```

### Configuration Properties

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `$schema` | `string` | No | -- | Path or URL to the JSON Schema for editor validation and autocompletion. |
| `topic` | `string` | **Yes** | -- | The ntfy.sh topic to publish to. |
| `server` | `string` | No | `https://ntfy.sh` | The ntfy server URL. Set this to use a self-hosted instance. |
| `token` | `string` | No | -- | Bearer token for authenticated topics. |
| `priority` | `string` | No | `default` | Global notification priority. One of: `min`, `low`, `default`, `high`, `max`. |
| `iconMode` | `string` | No | `dark` | Icon variant to use: `light` or `dark`. Reflects whether the target device uses light or dark mode. |
| `iconLight` | `string` | No | -- | Custom icon URL override for light mode. Must be JPEG or PNG. |
| `iconDark` | `string` | No | -- | Custom icon URL override for dark mode. Must be JPEG or PNG. |
| `fetchTimeout` | `string` | No | -- | ISO 8601 duration for the HTTP request timeout (e.g., `PT10S`, `PT1M`). When set, the fetch call is aborted if the server does not respond in time. |
| `events` | `object` | No | -- | Per-event custom command overrides (see [Custom Notification Commands](#custom-notification-commands)). |

### Custom Notification Commands

Each notification field (title, message, tags, priority) can be customized
per event by setting a shell command in the `events` section of the config
file. The command's stdout (trimmed) is used as the field value. If the
command is not set or fails, the hardcoded default is used silently.

Commands are executed via the Bun `$` shell provided by the OpenCode plugin
input. Before execution, template variables in the command string are
substituted with their values. Unset variables are substituted with empty
strings.

#### Per-Event Command Fields

Per-event commands are specified in the `events` object of the config file,
keyed by event type. Each event object supports the following optional fields:

| Field | Description |
|---|---|
| `titleCmd` | Shell command whose stdout is used as the notification title. |
| `messageCmd` | Shell command whose stdout is used as the notification message body. |
| `tagsCmd` | Shell command whose stdout is used as the notification tags. |
| `priorityCmd` | Shell command whose stdout is used as the notification priority. |

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

When a custom command field is not set in the config, the following
POSIX-compliant defaults are used. These commands do not include a trailing
newline.

**Title defaults:**

| Event | Default Command |
|---|---|
| `session.idle` | `printf "%s" "Agent Idle"` |
| `session.error` | `printf "%s" "Agent Error"` |
| `permission.asked` | `printf "%s" "Permission Asked"` |

**Message content defaults:**

| Event | Default Command |
|---|---|
| `session.idle` | `printf "%s" "The agent has finished and is waiting for input."` |
| `session.error` | `printf "%s" "An error has occurred. Check the session for details."` |
| `permission.asked` | `printf "%s" "The agent needs permission to continue. Review and respond."` |

**Tag defaults:**

Each event type has a default tag corresponding to an
[emoji shortcode](https://docs.ntfy.sh/emojis/) supported by ntfy.sh:

| Event | Default Tag | Emoji |
|---|---|---|
| `session.idle` | `hourglass_done` | ⌛ |
| `session.error` | `warning` | ⚠️ |
| `permission.asked` | `lock` | 🔒 |

#### Example

```json
{
  "$schema": "node_modules/opencode-ntfy.sh/opencode-ntfy.schema.json",
  "topic": "my-notifications",
  "events": {
    "session.idle": {
      "titleCmd": "printf \"%s\" \"${event} is done\"",
      "messageCmd": "printf \"%s\" \"Finished at ${time}\""
    },
    "session.error": {
      "messageCmd": "printf \"%s\" \"Error at ${time}: ${error}\""
    },
    "permission.asked": {
      "priorityCmd": "printf \"%s\" \"high\""
    }
  }
}
```

### Subscribing to notifications

To receive notifications, subscribe to your topic using any
[ntfy client](https://docs.ntfy.sh/subscribe/):

- **Phone**: Install the ntfy app
  ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy),
  [iOS](https://apps.apple.com/us/app/ntfy/id1625396347)) and subscribe to
  your topic.
- **Desktop**: Open `https://ntfy.sh/<your-topic>` in a browser.
- **CLI**: `curl -s ntfy.sh/<your-topic>/json`

### Example

Minimal configuration (`~/.config/opencode/opencode-ntfy.json`):

```json
{
  "topic": "my-opencode-notifications"
}
```

With authentication and a self-hosted server:

```json
{
  "topic": "my-opencode-notifications",
  "server": "https://ntfy.example.com",
  "token": "tk_mytoken",
  "priority": "high"
}
```

## Development

### Prerequisites

- Node.js (v20+)
- npm

### Setup

```sh
git clone https://github.com/lannuttia/opencode-ntfy.sh.git
cd opencode-ntfy.sh
npm install
```

### Build

```sh
npm run build
```

This compiles TypeScript from `src/` to `dist/` via `tsc`.

### Test

```sh
npm test
```

Or in watch mode:

```sh
npm run test:watch
```

## License

MIT
