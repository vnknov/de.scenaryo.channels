import type { NotificationMessage } from "../domain/notification.js";

export function renderText(message: NotificationMessage): string {
  const sections = [message.title, "", message.summary];

  if (message.details?.length) {
    sections.push("", ...message.details.map((detail) => `- ${detail}`));
  }
  if (message.actions?.length) {
    sections.push("", ...message.actions.map((action) => `${action.label}: ${action.url}`));
  }

  return sections.join("\n");
}
