export interface ChannelSummary {
  id: string;
  displayName: string;
  type: string;
}

export interface SmtpChannelConfig extends ChannelSummary {
  type: "smtp";
  from: string;
  host: string;
  port: number;
  secure: boolean;
  auth: {
    userEnv: string;
    passEnv: string;
  };
}

export type ChannelConfig = SmtpChannelConfig;
