import type { Plugin } from "@opencode-ai/plugin";
import { createNotificationPlugin, getBackendConfig, loadConfig } from "opencode-notification-sdk";
import { parsePushcutBackendConfig } from "./config.js";
import { createPushcutBackend } from "./backend.js";

const config = loadConfig("pushcut");
const backendRaw = getBackendConfig(config, "pushcut");
const backendConfig = parsePushcutBackendConfig(backendRaw);

const plugin: Plugin = async (input) => {
  const backend = createPushcutBackend(backendConfig, input.$);
  const sdkPlugin = createNotificationPlugin(backend, {
    backendConfigKey: "pushcut",
    config,
  });
  return sdkPlugin(input);
};

export default plugin;
