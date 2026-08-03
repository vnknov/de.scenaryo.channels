import type { ChannelConfig, ChannelSummary } from "../domain/channel.js";
import { UnknownRecipientError } from "../domain/errors.js";
import type { Recipient, RecipientSummary } from "../domain/recipient.js";

export class RecipientService {
  public constructor(
    private readonly channels: ReadonlyMap<string, ChannelConfig>,
    private readonly recipients: ReadonlyMap<string, Recipient>,
  ) {}

  public listRecipients(): RecipientSummary[] {
    return [...this.recipients.values()]
      .map((recipient) => ({
        id: recipient.id,
        displayName: recipient.displayName,
        channels: Object.keys(recipient.channels).sort(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  public listChannels(recipientId?: string): ChannelSummary[] {
    let availableIds: ReadonlySet<string> | undefined;
    if (recipientId !== undefined) {
      const recipient = this.recipients.get(recipientId);
      if (!recipient) {
        throw new UnknownRecipientError(recipientId);
      }
      availableIds = new Set(Object.keys(recipient.channels));
    }

    return [...this.channels.values()]
      .filter((channel) => !availableIds || availableIds.has(channel.id))
      .map(({ id, displayName, type }) => ({ id, displayName, type }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }
}
