export interface SmtpRecipientDetails {
  email: string;
}

export type RecipientChannelDetails = SmtpRecipientDetails;

export interface Recipient {
  id: string;
  displayName: string;
  channels: Readonly<Record<string, RecipientChannelDetails>>;
}

export interface RecipientSummary {
  id: string;
  displayName: string;
  channels: string[];
}
