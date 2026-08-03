export class ApplicationError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ConfigurationError extends ApplicationError {}

export class UnknownRecipientError extends ApplicationError {
  public constructor(recipientId: string) {
    super(`Unknown recipient '${recipientId}'. Call list_recipients for valid IDs.`);
  }
}

export class UnknownChannelError extends ApplicationError {
  public constructor(channelId: string) {
    super(`Unknown channel '${channelId}'. Call list_channels for valid IDs.`);
  }
}

export class ChannelUnavailableError extends ApplicationError {
  public constructor(recipientId: string, channelId: string) {
    super(`Channel '${channelId}' is not available for recipient '${recipientId}'.`);
  }
}

export class ProviderNotFoundError extends ApplicationError {
  public constructor(type: string) {
    super(`No notification provider is registered for channel type '${type}'.`);
  }
}

export class DeliveryError extends ApplicationError {
  public constructor(deliveryId: string, options?: ErrorOptions) {
    super(`Delivery failed. Reference: ${deliveryId}.`, options);
  }
}
