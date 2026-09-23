import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import type { SentMessageInfo } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import type { NotificationProvider } from "./notificationProvider.js";

export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    attachments?:
      | Array<{
          filename: string;
          contentType: string;
          content: Buffer;
        }>
      | undefined;
  }): Promise<unknown>;
  close(): void;
}

export type MailTransportFactory = (options: SMTPTransport.Options) => MailTransport;

interface SmtpCredentialDiagnostics {
  smtpUserEnvResolved: boolean;
  smtpUserEnvNonEmpty: boolean;
  smtpUserValueLength: number | undefined;
  smtpUserSha256Prefix: string | undefined;
  smtpUserHasLeadingOrTrailingWhitespace: boolean;
  smtpUserContainsControlCharacters: boolean;
  smtpUserContainsQuoteCharacters: boolean;
  smtpPassEnvResolved: boolean;
  smtpPassEnvNonEmpty: boolean;
  smtpPassValueLength: number | undefined;
  smtpPassSha256Prefix: string | undefined;
  smtpPassHasLeadingOrTrailingWhitespace: boolean;
  smtpPassContainsControlCharacters: boolean;
  smtpPassContainsQuoteCharacters: boolean;
}

export class SmtpProvider implements NotificationProvider {
  public readonly type = "smtp";

  public constructor(
    private readonly environment: NodeJS.ProcessEnv,
    private readonly createTransport: MailTransportFactory = defaultTransportFactory,
  ) {}

  public async send(input: Parameters<NotificationProvider["send"]>[0]): Promise<void> {
    if (input.channel.type !== "smtp") {
      throw new Error("SmtpProvider received an unsupported channel type.");
    }

    const user = this.environment[input.channel.auth.userEnv];
    const pass = this.environment[input.channel.auth.passEnv];
    const credentialDiagnostics = smtpCredentialDiagnostics(user, pass);
    if (!user?.trim() || !pass?.trim()) {
      throw withSmtpCredentialDiagnostics(
        new Error("SMTP credentials are unavailable."),
        credentialDiagnostics,
      );
    }

    const transport = this.createTransport({
      host: input.channel.host,
      port: input.channel.port,
      secure: input.channel.secure,
      auth: { user, pass },
      disableFileAccess: true,
      disableUrlAccess: true,
    });

    try {
      await transport.sendMail({
        from: input.channel.from,
        to: input.recipient.email,
        subject: input.message.subject,
        html: input.message.html,
        text: input.message.text,
        ...(input.message.attachments?.length
          ? {
              attachments: input.message.attachments.map((attachment) => ({
                filename: attachment.filename,
                contentType: attachment.contentType,
                content: attachment.content,
              })),
            }
          : {}),
      });
    } catch (error) {
      throw withSmtpCredentialDiagnostics(error, credentialDiagnostics);
    } finally {
      transport.close();
    }
  }
}

function smtpCredentialDiagnostics(
  user: string | undefined,
  pass: string | undefined,
): SmtpCredentialDiagnostics {
  return {
    smtpUserEnvResolved: user !== undefined,
    smtpUserEnvNonEmpty: Boolean(user?.trim()),
    smtpUserValueLength: user?.length,
    smtpUserSha256Prefix: sha256Prefix(user),
    smtpUserHasLeadingOrTrailingWhitespace: hasLeadingOrTrailingWhitespace(user),
    smtpUserContainsControlCharacters: containsControlCharacters(user),
    smtpUserContainsQuoteCharacters: containsQuoteCharacters(user),
    smtpPassEnvResolved: pass !== undefined,
    smtpPassEnvNonEmpty: Boolean(pass?.trim()),
    smtpPassValueLength: pass?.length,
    smtpPassSha256Prefix: sha256Prefix(pass),
    smtpPassHasLeadingOrTrailingWhitespace: hasLeadingOrTrailingWhitespace(pass),
    smtpPassContainsControlCharacters: containsControlCharacters(pass),
    smtpPassContainsQuoteCharacters: containsQuoteCharacters(pass),
  };
}

function sha256Prefix(value: string | undefined): string | undefined {
  return value === undefined
    ? undefined
    : createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function hasLeadingOrTrailingWhitespace(value: string | undefined): boolean {
  return value !== undefined && value !== value.trim();
}

function containsControlCharacters(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

function containsQuoteCharacters(value: string | undefined): boolean {
  return value !== undefined && /["']/.test(value);
}

function withSmtpCredentialDiagnostics(
  error: unknown,
  diagnostics: SmtpCredentialDiagnostics,
): unknown {
  if (typeof error === "object" && error !== null) {
    Object.assign(error, { smtpCredentialDiagnostics: diagnostics });
  }
  return error;
}

function defaultTransportFactory(options: SMTPTransport.Options): MailTransport {
  const transport = nodemailer.createTransport(options);
  return {
    sendMail: (message) => transport.sendMail(message) as Promise<SentMessageInfo>,
    close: () => transport.close(),
  };
}
