# Implementation Plan

## Phase 1: Project Scaffolding

- [x] Initialize npm project with `package.json` (name: `opencode-ntfy.sh`, type: module, main/types entry points)
- [x] Create `tsconfig.json` with strict TypeScript config targeting ESNext
- [x] Create `vitest.config.ts`

## Phase 2: Core Implementation

- [x] Implement `src/config.ts` - read and validate environment variables (`OPENCODE_NTFY_TOPIC`, `OPENCODE_NTFY_SERVER`, `OPENCODE_NTFY_TOKEN`, `OPENCODE_NTFY_PRIORITY`)
- [x] Implement `src/notify.ts` - HTTP client that sends POST requests to ntfy.sh
- [x] Implement `src/index.ts` - OpenCode plugin export with `session.idle` and `session.error` event hooks

## Phase 3: Tests

- [x] Write tests for `src/config.ts` - valid config, missing topic, defaults, custom server
- [x] Write tests for `src/notify.ts` - successful send, auth header, error handling
- [x] Write tests for `src/index.ts` - plugin hooks fire notifications correctly

## Phase 4: Polish

- [x] Verify all tests pass
- [x] Verify the package builds cleanly (added `@types/node` dev dependency)

## Phase 5: Conform to OpenCode Plugin API

- [x] Rewrite `src/index.ts` to match the `@opencode-ai/plugin` `Plugin` type signature: `(input: PluginInput) => Promise<Hooks>`
- [x] Use the `event` hook in `Hooks` to listen for `session.idle` and `session.error` events from the `Event` union type
- [x] Derive project name from `PluginInput.directory` instead of per-event `cwd`
- [x] Extract error messages from `EventSessionError.properties.error` union type
- [x] Export the plugin as the default export
- [x] Rewrite `tests/plugin.test.ts` to test the new interface
- [x] Ensure all tests pass and package builds cleanly

## Phase 6: Import Real `@opencode-ai/plugin` Types

- [x] Add `@opencode-ai/plugin` as a dev dependency
- [x] Import `Plugin`, `PluginInput`, and `Hooks` types from `@opencode-ai/plugin` in `src/index.ts` (replacing hand-rolled types)
- [x] Remove custom `fetchFn` parameter from `sendNotification` — use `globalThis.fetch` directly
- [x] Remove custom `env` and `fetchFn` from plugin input — read `process.env` directly
- [x] Update `tests/notify.test.ts` to mock `globalThis.fetch` via `vi.stubGlobal`
- [x] Update `tests/plugin.test.ts` to use real `PluginInput` shape and `vi.stubEnv`/`vi.stubGlobal`
- [x] Add `tests/typecheck.test.ts` with compile-time type conformance checks
- [x] Ensure all tests pass and package builds cleanly

## Phase 7: Cleanup & Hardening

- [x] Exclude `_typecheck_*` temp files from `tsconfig.json` build to prevent polluting `dist/`
- [x] Add `src/_typecheck_*` to `.gitignore` to prevent stray files from being committed
- [x] Remove stray `src/_typecheck_plugin.ts` artifact and its `dist/` output
- [x] Add test to verify `_typecheck_*` files are not compiled into `dist/`
- [x] Ensure all tests pass and package builds cleanly

## Phase 8: Add `permission.asked` Event Support

- [x] Add `permission.ask` hook to send a notification when the agent requests permission
- [x] Include event type, project name, timestamp, and permission title in the notification
- [x] Write tests for the `permission.ask` hook in `tests/plugin.test.ts`
- [x] Ensure all tests pass and package builds cleanly

## Phase 9: Fix Test Isolation

- [x] Fix `plugin.test.ts` env isolation: stub `OPENCODE_NTFY_TOPIC` to empty string in "not set" tests to prevent host env leakage

## Phase 10: Rename Environment Variables to `OPENCODE_NTFY_*`

- [x] Rename `NTFY_TOPIC` → `OPENCODE_NTFY_TOPIC` in `src/config.ts` and all tests
- [x] Rename `NTFY_SERVER` → `OPENCODE_NTFY_SERVER` in `src/config.ts` and all tests
- [x] Rename `NTFY_TOKEN` → `OPENCODE_NTFY_TOKEN` in `src/config.ts` and all tests
- [x] Rename `NTFY_PRIORITY` → `OPENCODE_NTFY_PRIORITY` in `src/config.ts` and all tests
- [x] Ensure all tests pass and package builds cleanly

## Phase 11: Add `priority` Field to `NotificationPayload`

- [x] Add optional `priority` field to `NotificationPayload` in `src/notify.ts`
- [x] Update `sendNotification` to use `payload.priority` when set, falling back to `config.priority`
- [x] Write tests for per-notification priority override
- [x] Ensure all tests pass and package builds cleanly

## Phase 12: Implement `src/exec.ts` — Command Execution and Template Variable Substitution

- [x] Create `src/exec.ts` with a `resolveField` function that:
  1. Takes the Bun `$` shell, a command template string (or `undefined`), a variables record, and a fallback default value
  2. If the command template is `undefined` or empty, returns the fallback
  3. Substitutes all `${VAR_NAME}` placeholders in the command with values from the variables record
  4. Executes the substituted command via the Bun `$` shell, capturing stdout
  5. Returns the trimmed stdout if the command succeeds
  6. Returns the fallback value if the command fails (non-zero exit, exception, etc.)
- [x] Write tests for `resolveField` in `tests/exec.test.ts`
- [x] Ensure all tests pass and package builds cleanly

## Phase 13: Wire Up Custom Notification Commands in Plugin

- [x] Build template variables record per event (PROJECT, EVENT, TIME, ERROR, PERMISSION_TYPE, PERMISSION_PATTERNS)
- [x] Use `resolveField` to resolve title, message, tags, and priority per event from environment variable commands
- [x] Use the correct per-event env var names (e.g., `OPENCODE_NTFY_SESSION_IDLE_TITLE_CMD`)
- [x] Update `tests/plugin.test.ts` with tests for custom commands
- [x] Ensure all tests pass and package builds cleanly

## Phase 14: Fix Template Variable Names to Match Spec

- [x] Change template variable names from uppercase/underscored (`${PROJECT}`, `${PERMISSION_TYPE}`) to lowercase/underscored (`${project}`, `${permission_type}`) per prompt spec
- [x] Update `buildVars` in `src/index.ts` to use lowercase keys
- [x] Update tests in `tests/exec.test.ts` and `tests/plugin.test.ts` to use new variable names
- [x] Ensure all tests pass and package builds cleanly

## Phase 15: Add Notification Icons

- [x] Add `iconUrl` field to `NtfyConfig` interface in `src/config.ts`
- [x] Implement icon URL resolution logic: mode (dark/light), custom URL overrides, default GitHub raw URLs using package version
- [x] Read `OPENCODE_NTFY_ICON_MODE`, `OPENCODE_NTFY_ICON_LIGHT`, `OPENCODE_NTFY_ICON_DARK` environment variables
- [x] Send `X-Icon` header in `sendNotification` using `config.iconUrl`
- [x] Bundle OpenCode branded PNG icons in `assets/` directory (not published to npm)
- [x] Write tests for icon URL resolution in `tests/config.test.ts` (8 tests: default dark, explicit dark, explicit light, invalid mode, dark override, light override, ignore wrong-mode overrides)
- [x] Write test for `X-Icon` header in `tests/notify.test.ts`
- [x] Write integration tests for icon header in `tests/plugin.test.ts` (default dark, light mode, custom dark URL)
- [x] Ensure all tests pass and package builds cleanly

## Phase 16: Conform Default Notification Content to Spec

- [x] Change default titles to match spec: `"Agent Idle"`, `"Agent Error"`, `"Permission Asked"` (was `"${project} - Session Idle"`, etc.)
- [x] Change default messages to match spec: simple descriptive strings (was multi-line event/project/time format)
  - `session.idle`: `"The agent has finished and is waiting for input."`
  - `session.error`: `"An error has occurred. Check the session for details."`
  - `permission.asked`: `"The agent needs permission to continue. Review and respond."`
- [x] Remove `permission.ask` hook — spec only uses the `event` hook for all three event types
- [x] Remove dead code (`getProjectName`, unused `detail` variable)
- [x] Update tests to assert spec-compliant defaults
- [x] Ensure all tests pass and package builds cleanly

## Phase 17: Remove All Type Casts (Code Quality)

- [x] Remove `as string` and `as any` casts from `src/index.ts` — use a type guard helper to handle `permission.asked` events without type assertions
- [x] Remove `as any` and `as unknown` casts from `tests/plugin.test.ts` — build a fully-typed mock shell and event factories
- [x] Remove `as any` and `as unknown` casts from `tests/exec.test.ts` — build a fully-typed mock shell
- [x] Extract shared `createMockShell` into `tests/mock-shell.ts` to eliminate duplication
- [x] Add `fireEvent` helper for testing events not yet in the SDK's `Event` union (e.g., `permission.asked`)
- [x] Add typecheck test enforcing no-cast rule in `tests/` files
- [x] Ensure all tests pass and package builds cleanly

## Phase 18: Add Fetch Timeout Support

- [x] Add `fetchTimeout?: number` field to `NtfyConfig` in `src/config.ts`
- [x] Parse `OPENCODE_NTFY_FETCH_TIMEOUT` via `parseISO8601Duration()` in `loadConfig`
- [x] Use `AbortSignal.timeout(config.fetchTimeout)` in `sendNotification` when `fetchTimeout` is set
- [x] Write tests for config parsing (default undefined, valid value, invalid throws)
- [x] Write tests for fetch signal behavior (present when set, absent when not set)
- [x] Ensure all tests pass and package builds cleanly

## Phase 19: Node.js Version Support & CI Matrix

- [x] Add `engines.node` field (`>=20`) to `package.json`
- [x] Update CI workflow to use matrix strategy for Node.js 20, 22, and 24
- [x] Separate publish step to run only once on the latest Node.js version
- [x] Upload coverage only once (on Node.js 24)

## Phase 20: README Updates

- [x] Add icon configuration environment variables to the configuration table
- [x] Add `OPENCODE_NTFY_FETCH_TIMEOUT` to the configuration table
- [x] Add default tag documentation alongside title and message defaults
- [x] Fix title/message default table ordering for consistency (idle, error, permission)
- [x] Update Node.js version prerequisite from v18+ to v20+

## Phase 21: Replace Hand-Rolled ISO 8601 Duration Parser with Third-Party Library

- [x] Install `iso8601-duration` as a runtime dependency
- [x] Rewrite `parseISO8601Duration` to delegate to `iso8601-duration` (parse + toSeconds) instead of hand-rolled regex
- [x] Ensure all tests pass, lint is clean, and package builds cleanly

## Phase 22: Code Simplification Refactoring

- [x] Simplify `resolveIconUrl` in `src/config.ts`
- [x] Simplify `buildVars` in `src/index.ts` — replace manual `Partial<Record<...>>` destructuring with `?? ""` defaults with a spread-based approach using `Record<string, string>`
- [x] Ensure all tests pass, lint is clean, and package builds cleanly

## Phase 23: Migrate Config from Environment Variables to JSON Config File

- [x] Rewrite `src/config.ts` to read config from `~/.config/opencode/opencode-ntfy.json` instead of environment variables
  - `loadConfig()` takes no arguments; uses `os.homedir()` and `path.join()` to locate the file
  - Returns `NtfyConfig | undefined`: `undefined` when file doesn't exist (plugin disabled), `NtfyConfig` when valid
  - Throws an error if the file exists but contains invalid JSON or fails validation
  - Validates required `topic` field, valid enum values for `priority`/`iconMode`, valid ISO 8601 durations
  - Applies defaults for omitted optional fields (`server`, `priority`, `iconMode`)
  - Resolves `iconUrl` from `iconMode`, `iconLight`, `iconDark` config properties
  - Parses `fetchTimeout` ISO 8601 duration into milliseconds
  - Supports `events` object with per-event custom command overrides (`titleCmd`, `messageCmd`, `tagsCmd`, `priorityCmd`)
- [x] Rewrite `tests/config.test.ts` to test JSON-file-based config loading (mock `readFileSync` and `existsSync`)
- [x] Rewrite `src/index.ts` to use JSON-file-based config
  - Read custom commands from `config.events[eventType]` instead of env vars
  - Use `loadConfig()` with no arguments; return empty hooks when it returns `undefined`
- [x] Rewrite `tests/plugin.test.ts` to mock JSON config file instead of env vars
- [x] Create `opencode-ntfy.schema.json` — JSON Schema (draft 2020-12) for the config file
- [x] Add `opencode-ntfy.schema.json` to `package.json` `files` list
- [x] Add tests for JSON Schema (existence, property coverage, package.json inclusion)
- [x] Ensure all 95 tests pass, lint is clean, and package builds cleanly

## Phase 24: Update README to Document JSON Config File

- [x] Rewrite README.md to replace all environment variable documentation with JSON config file documentation
  - Replace environment variable table with JSON config properties table
  - Replace custom command env var docs with `events` object documentation
  - Update examples to use JSON config file instead of `export` commands
  - Update "plugin does nothing" note to reference missing config file instead of env var
  - Document `$schema` property and JSON Schema reference
  - Keep template variables, default values, subscribing, install, and development sections

## Phase 25: Subagent Suppression

- [x] Implement `isSubagentSession()` helper in `src/index.ts` that uses `client.session.get()` to check for `parentID`
- [x] Suppress `session.idle` notifications from child sessions (parentID is set)
- [x] Suppress `session.error` notifications from child sessions (parentID is set)
- [x] Fall through and send notification when session lookup fails (error handling)
- [x] Verify `permission.asked` events are NOT subject to subagent suppression
- [x] Write tests for all subagent suppression scenarios (child suppressed, parent allowed, lookup failure, permission.asked unaffected)
- [x] Extract `createMockClient` test helper to reduce test duplication
- [x] Update PLAN.md and README.md
- [x] Ensure all 100 tests pass, lint is clean, and package builds cleanly

## Phase 26: Remove Cooldown Feature (Not in Spec)

- [x] Delete `src/cooldown.ts` and `tests/cooldown.test.ts`
- [x] Inline `parseISO8601Duration` into `src/config.ts` (still needed for `fetchTimeout`)
- [x] Remove `cooldown` and `cooldownEdge` from `NtfyConfig` interface and `loadConfig()`
- [x] Remove cooldown import and usage from `src/index.ts`
- [x] Remove `cooldown` and `cooldownEdge` from `opencode-ntfy.schema.json`
- [x] Remove cooldown tests from `tests/config.test.ts` and `tests/plugin.test.ts`
- [x] Update schema property test to not expect `cooldown`/`cooldownEdge`
- [x] Remove `throttle-debounce` (and `@types/throttle-debounce`) dependencies
- [x] Remove cooldown documentation from `README.md`
- [x] Update `PLAN.md` to match spec (remove stale cooldown references from earlier phases)
- [x] Ensure all tests pass, lint is clean, and package builds cleanly
