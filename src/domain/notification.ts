export interface NotificationAction {
  label: string;
  url: string;
}

export interface NotificationAttachment {
  filename: string;
  contentType: string;
  contentBase64: string;
}

export interface NotificationMessage {
  title: string;
  summary: string;
  details?: string[] | undefined;
  actions?: NotificationAction[] | undefined;
  attachments?: NotificationAttachment[] | undefined;
}

export interface RenderedNotificationAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface RenderedNotification {
  subject: string;
  html: string;
  text: string;
  attachments?: RenderedNotificationAttachment[] | undefined;
}

export interface SendNotificationCommand {
  recipientId: string;
  channelId: string;
  message: NotificationMessage;
}

export interface SendNotificationResult {
  accepted: true;
  deliveryId: string;
  recipientId: string;
  channelId: string;
  provider: string;
}
