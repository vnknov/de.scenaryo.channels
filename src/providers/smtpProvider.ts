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
  }): Promise<unknown>;
  close(): void;
}

export type MailTransportFactory = (options: SMTPTransport.Options) => MailTransport;

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
    if (!user?.trim() || !pass?.trim()) {
      throw new Error("SMTP credentials are unavailable.");
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
      });
    } finally {
      transport.close();
    }
  }
}

function defaultTransportFactory(options: SMTPTransport.Options): MailTransport {
  const transport = nodemailer.createTransport(options);
  return {
    sendMail: (message) => transport.sendMail(message) as Promise<SentMessageInfo>,
    close: () => transport.close(),
  };
}
