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
