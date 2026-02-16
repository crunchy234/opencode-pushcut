import {
  createNotificationPlugin,
  getBackendConfig,
  loadConfig,
} from "opencode-notification-sdk";
import { parseNtfyBackendConfig } from "./config.js";
import { createNtfyBackend } from "./backend.js";

const config = loadConfig("ntfy");
const backendRaw = getBackendConfig(config);
const backendConfig = parseNtfyBackendConfig(backendRaw);
const backend = createNtfyBackend(backendConfig);

const plugin = createNotificationPlugin(backend, {
  backendConfigKey: "ntfy",
  config,
});

export default plugin;
