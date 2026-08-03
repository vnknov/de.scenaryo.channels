import path from "node:path";
import { ChannelRegistry } from "./application/channelRegistry.js";
import { NotificationService } from "./application/notificationService.js";
import { RecipientService } from "./application/recipientService.js";
import { loadConfiguration } from "./config/configLoader.js";
import { ConfigurationError } from "./domain/errors.js";
import { ConsoleLogger } from "./observability/consoleLogger.js";
import { SmtpProvider } from "./providers/smtpProvider.js";
import { StructuredNotificationRenderer } from "./rendering/notificationRenderer.js";
import { createHttpApplication, startHttpServer } from "./server/httpServer.js";

async function main(): Promise<void> {
  const token = process.env.CHANNELS_MCP_TOKEN;
  if (!token?.trim()) {
    throw new ConfigurationError("CHANNELS_MCP_TOKEN is missing or empty.");
  }

  const port = parsePort(process.env.PORT ?? "3000");
  const configDirectory = path.resolve(process.env.CONFIG_DIR ?? "config");
  const configuration = await loadConfiguration(configDirectory, process.env);
  const registry = new ChannelRegistry([new SmtpProvider(process.env)]);
  const recipientService = new RecipientService(configuration.channels, configuration.recipients);
  const notificationService = new NotificationService(
    configuration.channels,
    configuration.recipients,
    registry,
    new StructuredNotificationRenderer(),
    new ConsoleLogger(),
  );
  const allowedHosts = process.env.CHANNELS_ALLOWED_HOSTS?.split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  const { app, mcpHandler } = createHttpApplication(
    { recipientService, notificationService },
    { token, ...(allowedHosts?.length ? { allowedHosts } : {}) },
  );
  const server = await startHttpServer(app, port);
  console.info("Channels MCP server listening", {
    port,
    configDirectory,
    channels: configuration.channels.size,
    recipients: configuration.recipients.size,
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.info("Shutting down Channels MCP server", { signal });
    await mcpHandler.close();
    server.close((error) => {
      if (error) {
        console.error("HTTP server shutdown failed", { error: error.name });
        process.exitCode = 1;
      }
    });
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigurationError(`PORT must be an integer between 1 and 65535, got '${value}'.`);
  }
  return port;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  console.error("Channels MCP server failed to start", { message });
  process.exitCode = 1;
});
