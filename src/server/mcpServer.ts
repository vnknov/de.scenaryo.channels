import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { NotificationService } from "../application/notificationService.js";
import type { RecipientService } from "../application/recipientService.js";
import { ApplicationError } from "../domain/errors.js";
import { listChannelsInputSchema, sendNotificationInputSchema } from "./toolSchemas.js";

const recipientSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  channels: z.array(z.string()),
});

const channelSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  type: z.string(),
});

const listRecipientsOutputSchema = z.object({
  recipients: z.array(recipientSummarySchema),
});

const listChannelsOutputSchema = z.object({
  channels: z.array(channelSummarySchema),
});

const sendNotificationOutputSchema = z.object({
  accepted: z.literal(true),
  deliveryId: z.string(),
  recipientId: z.string(),
  channelId: z.string(),
  provider: z.string(),
});

export interface McpServices {
  recipientService: RecipientService;
  notificationService: NotificationService;
}

export function createChannelsMcpServer(services: McpServices): McpServer {
  const server = new McpServer({
    name: "channels-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "list_recipients",
    {
      title: "List notification recipients",
      description:
        "Lists public recipient IDs, display names, and available channel IDs. Delivery addresses are never exposed.",
      outputSchema: listRecipientsOutputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    () => {
      const recipients = services.recipientService.listRecipients();
      const output = { recipients };
      return {
        content: [{ type: "text", text: JSON.stringify(recipients) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "list_channels",
    {
      title: "List notification channels",
      description:
        "Lists configured channel instances, optionally limited to channels available for one recipient.",
      inputSchema: listChannelsInputSchema,
      outputSchema: listChannelsOutputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    ({ recipientId }) => {
      try {
        const channels = services.recipientService.listChannels(recipientId);
        const output = { channels };
        return {
          content: [{ type: "text", text: JSON.stringify(channels) }],
          structuredContent: output,
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "send_notification",
    {
      title: "Send a notification",
      description:
        "Sends a structured notification with optional Base64 attachments to a recipient through one concrete channel instance. Raw HTML and file paths are not accepted.",
      inputSchema: sendNotificationInputSchema,
      outputSchema: sendNotificationOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const output = await services.notificationService.send(input);
        return {
          content: [
            {
              type: "text",
              text: `Notification delivered. Reference: ${output.deliveryId}.`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

function toolError(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const message =
    error instanceof ApplicationError
      ? error.message
      : "The notification operation failed unexpectedly.";
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
