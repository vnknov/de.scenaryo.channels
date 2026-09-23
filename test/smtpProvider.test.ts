import { describe, expect, it, vi } from "vitest";
import type { SmtpChannelConfig } from "../src/domain/channel.js";
import { SmtpProvider, type MailTransportFactory } from "../src/providers/smtpProvider.js";

describe("SmtpProvider", () => {
  it("uses the selected channel settings and recipient address", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "message-id" });
    const close = vi.fn();
    const createTransport = vi.fn<MailTransportFactory>(() => ({ sendMail, close }));
    const provider = new SmtpProvider(
      { WORK_USER: "smtp-user", WORK_PASS: "smtp-pass" },
      createTransport,
    );
    const channel: SmtpChannelConfig = {
      id: "work-email",
      type: "smtp",
      displayName: "Work Email",
      from: "Agent <agent@company.example>",
      host: "smtp.company.example",
      port: 465,
      secure: true,
      auth: { userEnv: "WORK_USER", passEnv: "WORK_PASS" },
    };

    await provider.send({
      channelId: channel.id,
      channel,
      recipient: { email: "max@company.example" },
      message: {
        subject: "Status",
        html: "<p>Status</p>",
        text: "Status",
        attachments: [
          {
            filename: "status.txt",
            contentType: "text/plain",
            content: Buffer.from("Build passed", "utf8"),
          },
        ],
      },
    });

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.company.example",
      port: 465,
      secure: true,
      auth: { user: "smtp-user", pass: "smtp-pass" },
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "Agent <agent@company.example>",
      to: "max@company.example",
      subject: "Status",
      html: "<p>Status</p>",
      text: "Status",
      attachments: [
        {
          filename: "status.txt",
          contentType: "text/plain",
          content: Buffer.from("Build passed", "utf8"),
        },
      ],
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the transport when delivery fails", async () => {
    const deliveryError = new Error("provider detail");
    const sendMail = vi.fn().mockRejectedValue(deliveryError);
    const close = vi.fn();
    const provider = new SmtpProvider({ USER: "smtp-user", PASS: "smtp-pass" }, () => ({
      sendMail,
      close,
    }));
    const channel: SmtpChannelConfig = {
      id: "mail",
      type: "smtp",
      displayName: "Mail",
      from: "Agent <agent@example.org>",
      host: "smtp.example.org",
      port: 587,
      secure: false,
      auth: { userEnv: "USER", passEnv: "PASS" },
    };

    await expect(
      provider.send({
        channelId: channel.id,
        channel,
        recipient: { email: "max@example.org" },
        message: { subject: "Status", html: "<p>Status</p>", text: "Status" },
      }),
    ).rejects.toBe(deliveryError);
    expect(close).toHaveBeenCalledOnce();
  });

  it("attaches safe credential diagnostics when delivery fails", async () => {
    const deliveryError = new Error("auth rejected");
    const sendMail = vi.fn().mockRejectedValue(deliveryError);
    const close = vi.fn();
    const provider = new SmtpProvider({ USER: "smtp-user", PASS: " 'smtp-pass' " }, () => ({
      sendMail,
      close,
    }));
    const channel: SmtpChannelConfig = {
      id: "mail",
      type: "smtp",
      displayName: "Mail",
      from: "Agent <agent@example.org>",
      host: "smtp.example.org",
      port: 587,
      secure: false,
      auth: { userEnv: "USER", passEnv: "PASS" },
    };

    await expect(
      provider.send({
        channelId: channel.id,
        channel,
        recipient: { email: "max@example.org" },
        message: { subject: "Status", html: "<p>Status</p>", text: "Status" },
      }),
    ).rejects.toMatchObject({
      smtpCredentialDiagnostics: {
        smtpUserEnvResolved: true,
        smtpUserEnvNonEmpty: true,
        smtpUserValueLength: 9,
        smtpUserSha256Prefix: "2b99a653ca08",
        smtpUserHasLeadingOrTrailingWhitespace: false,
        smtpUserContainsControlCharacters: false,
        smtpUserContainsQuoteCharacters: false,
        smtpPassEnvResolved: true,
        smtpPassEnvNonEmpty: true,
        smtpPassValueLength: 13,
        smtpPassSha256Prefix: "f366dd6a40be",
        smtpPassHasLeadingOrTrailingWhitespace: true,
        smtpPassContainsControlCharacters: false,
        smtpPassContainsQuoteCharacters: true,
      },
    });
    expect(JSON.stringify(deliveryError)).not.toContain("smtp-pass");
  });
});
