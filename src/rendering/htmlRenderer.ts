import type { NotificationMessage } from "../domain/notification.js";

export function renderHtml(message: NotificationMessage): string {
  const details = message.details?.length
    ? `<ul style="margin:16px 0;padding-left:24px">${message.details
        .map((detail) => `<li style="margin:8px 0">${escapeHtml(detail)}</li>`)
        .join("")}</ul>`
    : "";
  const actions = message.actions?.length
    ? `<div style="margin-top:24px">${message.actions
        .map(
          (action) =>
            `<a href="${escapeHtml(action.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 16px;background:#1f2937;color:#ffffff;text-decoration:none;border-radius:4px">${escapeHtml(action.label)}</a>`,
        )
        .join("")}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f3f4f6;color:#111827;font-family:Arial,sans-serif">
  <main style="max-width:640px;margin:0 auto;padding:32px;background:#ffffff;border-radius:8px">
    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3">${escapeHtml(message.title)}</h1>
    <p style="margin:0;font-size:16px;line-height:1.6">${escapeHtml(message.summary)}</p>
    ${details}
    ${actions}
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}
