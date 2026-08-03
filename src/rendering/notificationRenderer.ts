import type { NotificationMessage, RenderedNotification } from "../domain/notification.js";
import { renderHtml } from "./htmlRenderer.js";
import { renderText } from "./textRenderer.js";

export interface NotificationRenderer {
  render(message: NotificationMessage): RenderedNotification;
}

export class StructuredNotificationRenderer implements NotificationRenderer {
  public render(message: NotificationMessage): RenderedNotification {
    return {
      subject: message.title,
      html: renderHtml(message),
      text: renderText(message),
    };
  }
}
