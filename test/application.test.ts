import { describe, expect, it, vi } from "vitest";
import { ChannelRegistry } from "../src/application/channelRegistry.js";
import { NotificationService } from "../src/application/notificationService.js";
import { RecipientService } from "../src/application/recipientService.js";
import type { SmtpChannelConfig } from "../src/domain/channel.js";
import type { Recipient } from "../src/domain/recipient.js";
import type { NotificationProvider } from "../src/providers/notificationProvider.js";

const workChannel = smtpChannel("work-email", "Work Email");
const privateChannel = smtpChannel("private-email", "Private Email");
const channels = new Map([
  [workChannel.id, workChannel],
  [privateChannel.id, privateChannel],
]);
const max: Recipient = {
  id: "max",
  displayName: "Max Mustermann",
  channels: {
    "work-email": { email: "max@company.example" },
    "private-email": { email: "max@example.org" },
  },
};

describe("application services", () => {
  it("filters concrete channels by recipient without exposing details", () => {
    const service = new RecipientService(channels, new Map([[max.id, max]]));

    expect(service.listChannels("max")).toEqual([
      { id: "private-email", displayName: "Private Email", type: "smtp" },
      { id: "work-email", displayName: "Work Email", type: "smtp" },
    ]);
    expect(service.listRecipients()).toEqual([
      {
        id: "max",
        displayName: "Max Mustermann",
        channels: ["private-email", "work-email"],
      },
    ]);
  });

  it("routes multiple SMTP channels through the same provider implementation", async () => {
    const send = vi.fn<NotificationProvider["send"]>().mockResolvedValue(undefined);
    const provider: NotificationProvider = { type: "smtp", send };
    const service = new NotificationService(
      channels,
      new Map([[max.id, max]]),
      new ChannelRegistry([provider]),
      { render: (message) => ({ subject: message.title, html: "html", text: "text" }) },
      { info: vi.fn(), error: vi.fn() },
    );

    await service.send({
      recipientId: "max",
      channelId: "work-email",
      message: { title: "Work", summary: "Summary" },
    });
    await service.send({
      recipientId: "max",
      channelId: "private-email",
      message: { title: "Private", summary: "Summary" },
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      channelId: "work-email",
      channel: workChannel,
      recipient: { email: "max@company.example" },
    });
    expect(send.mock.calls[1]?.[0]).toMatchObject({
      channelId: "private-email",
      channel: privateChannel,
      recipient: { email: "max@example.org" },
    });
  });

  it("rejects a channel not configured for the recipient", async () => {
    const limited: Recipient = {
      ...max,
      channels: { "work-email": max.channels["work-email"]! },
    };
    const provider: NotificationProvider = { type: "smtp", send: vi.fn() };
    const service = new NotificationService(
      channels,
      new Map([[limited.id, limited]]),
      new ChannelRegistry([provider]),
      { render: (message) => ({ subject: message.title, html: "html", text: "text" }) },
      { info: vi.fn(), error: vi.fn() },
    );

    await expect(
      service.send({
        recipientId: "max",
        channelId: "private-email",
        message: { title: "Test", summary: "Summary" },
      }),
    ).rejects.toThrow("not available for recipient");
  });

  it("logs safe provider diagnostics without exposing raw error details", async () => {
    const providerError = Object.assign(
      new Error("Authentication failed for max@example.org using secret-password"),
      {
        code: "EAUTH",
        command: "AUTH PLAIN",
        response: "535 5.7.8 Authentication failed for max@example.org password=secret-password",
        responseCode: 535,
      },
    );
    const provider: NotificationProvider = {
      type: "smtp",
      send: vi.fn().mockRejectedValue(providerError),
    };
    const error = vi.fn();
    const service = new NotificationService(
      channels,
      new Map([[max.id, max]]),
      new ChannelRegistry([provider]),
      { render: (message) => ({ subject: message.title, html: "html", text: "text" }) },
      { info: vi.fn(), error },
    );

    await expect(
      service.send({
        recipientId: "max",
        channelId: "private-email",
        message: { title: "Test", summary: "Summary" },
      }),
    ).rejects.toThrow("Delivery failed");

    expect(error).toHaveBeenCalledWith(
      "Notification delivery failed",
      expect.objectContaining({
        errorType: "Error",
        errorCode: "EAUTH",
        reason: "SMTP authentication was rejected",
        command: "AUTH PLAIN",
        smtpAuthMechanism: "PLAIN",
        responseCode: 535,
        smtpResponse: "535 5.7.8 Authentication failed for [redacted-email] password=[redacted]",
        smtpEnhancedStatusCode: "5.7.8",
        smtpHost: "smtp.example.org",
        smtpPort: 587,
        smtpSecure: false,
        smtpUserEnv: "SMTP_USER",
        smtpPassEnv: "SMTP_PASS",
      }),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("max@example.org");
    expect(JSON.stringify(error.mock.calls)).not.toContain("secret-password");
  });
});

function smtpChannel(id: string, displayName: string): SmtpChannelConfig {
  return {
    id,
    type: "smtp",
    displayName,
    from: "Agent <agent@example.org>",
    host: "smtp.example.org",
    port: 587,
    secure: false,
    auth: { userEnv: "SMTP_USER", passEnv: "SMTP_PASS" },
  };
}
