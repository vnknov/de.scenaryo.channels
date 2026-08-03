export interface NotificationAction {
  label: string;
  url: string;
}

export interface NotificationMessage {
  title: string;
  summary: string;
  details?: string[] | undefined;
  actions?: NotificationAction[] | undefined;
}

export interface RenderedNotification {
  subject: string;
  html: string;
  text: string;
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
