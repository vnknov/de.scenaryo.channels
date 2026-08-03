import type { ChannelConfig } from "../domain/channel.js";
import type { RenderedNotification } from "../domain/notification.js";
import type { RecipientChannelDetails } from "../domain/recipient.js";

export interface NotificationProvider {
  readonly type: string;

  send(input: {
    channelId: string;
    channel: ChannelConfig;
    recipient: RecipientChannelDetails;
    message: RenderedNotification;
  }): Promise<void>;
}
