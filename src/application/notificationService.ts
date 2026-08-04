import { randomUUID } from "node:crypto";
import type { ChannelConfig } from "../domain/channel.js";
import {
  ChannelUnavailableError,
  DeliveryError,
  UnknownChannelError,
  UnknownRecipientError,
} from "../domain/errors.js";
import type { SendNotificationCommand, SendNotificationResult } from "../domain/notification.js";
import type { Recipient } from "../domain/recipient.js";
import type { NotificationRenderer } from "../rendering/notificationRenderer.js";
import type { ChannelRegistry } from "./channelRegistry.js";

export interface OperationalLogger {
  info(message: string, metadata: Record<string, unknown>): void;
  error(message: string, metadata: Record<string, unknown>): void;
}

export class NotificationService {
  public constructor(
    private readonly channels: ReadonlyMap<string, ChannelConfig>,
    private readonly recipients: ReadonlyMap<string, Recipient>,
    private readonly registry: ChannelRegistry,
    private readonly renderer: NotificationRenderer,
    private readonly logger: OperationalLogger,
  ) {}

  public async send(command: SendNotificationCommand): Promise<SendNotificationResult> {
    const recipient = this.recipients.get(command.recipientId);
    if (!recipient) {
      throw new UnknownRecipientError(command.recipientId);
    }
    const channel = this.channels.get(command.channelId);
    if (!channel) {
      throw new UnknownChannelError(command.channelId);
    }
    const recipientDetails = recipient.channels[command.channelId];
    if (!recipientDetails) {
      throw new ChannelUnavailableError(command.recipientId, command.channelId);
    }

    const provider = this.registry.get(channel.type);
    const deliveryId = randomUUID();
    try {
      await provider.send({
        channelId: channel.id,
        channel,
        recipient: recipientDetails,
        message: this.renderer.render(command.message),
      });
      this.logger.info("Notification delivered", {
        deliveryId,
        recipientId: recipient.id,
        channelId: channel.id,
        provider: provider.type,
      });
    } catch (error) {
      this.logger.error("Notification delivery failed", {
        deliveryId,
        recipientId: recipient.id,
        channelId: channel.id,
        provider: provider.type,
        ...deliveryFailureMetadata(error),
      });
      throw new DeliveryError(deliveryId, { cause: error });
    }

    return {
      accepted: true,
      deliveryId,
      recipientId: recipient.id,
      channelId: channel.id,
      provider: provider.type,
    };
  }
}

function deliveryFailureMetadata(error: unknown): Record<string, unknown> {
  if (!isRecord(error)) {
    return { errorType: "unknown" };
  }

  const code = safeDiagnosticString(error.code);
  const metadata: Record<string, unknown> = {
    errorType: error instanceof Error ? (safeDiagnosticString(error.name) ?? "Error") : "unknown",
  };

  if (code) {
    metadata.errorCode = code;
    metadata.reason = deliveryFailureReason(code);
  }

  const command = safeDiagnosticString(error.command);
  if (command) {
    metadata.command = command;
  }
  if (typeof error.responseCode === "number" && Number.isInteger(error.responseCode)) {
    metadata.responseCode = error.responseCode;
  }
  const syscall = safeDiagnosticString(error.syscall);
  if (syscall) {
    metadata.syscall = syscall;
  }

  return metadata;
}

function deliveryFailureReason(code: string): string {
  const reasons: Readonly<Record<string, string>> = {
    EAUTH: "SMTP authentication was rejected",
    ECONNECTION: "Could not connect to the SMTP server",
    ECONNREFUSED: "The SMTP server refused the connection",
    EDNS: "The SMTP hostname could not be resolved",
    EENVELOPE: "The SMTP server rejected the sender or recipient",
    EMESSAGE: "The SMTP server rejected the message",
    ESOCKET: "The SMTP socket or TLS connection failed",
    ETIMEDOUT: "The SMTP operation timed out",
  };
  return reasons[code] ?? "The delivery provider reported an error";
}

function safeDiagnosticString(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9 _-]{1,64}$/.test(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
