import { isIP } from "node:net";
import { z } from "zod";

const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._-]+$/, "must contain only letters, numbers, '.', '_' or '-'");

const environmentVariableSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "must be a valid environment variable name");

export const smtpChannelFileSchema = z
  .object({
    kind: z.literal("channel"),
    id: identifierSchema,
    type: z.literal("smtp"),
    displayName: z.string().trim().min(1).max(200),
    from: z
      .string()
      .trim()
      .min(1)
      .max(320)
      .regex(/^[^\r\n]+$/, "must not contain line breaks")
      .refine(isMailbox, "must contain a valid sender email address"),
    host: z
      .string()
      .trim()
      .min(1)
      .max(253)
      .refine(isHost, "must be a valid hostname or IP address"),
    port: z.number().int().min(1).max(65_535),
    secure: z.boolean(),
    auth: z.object({
      userEnv: environmentVariableSchema,
      passEnv: environmentVariableSchema,
    }),
  })
  .strict();

const smtpRecipientDetailsSchema = z
  .object({
    email: z.string().email().max(320),
  })
  .strict();

export const recipientFileSchema = z
  .object({
    kind: z.literal("recipient"),
    id: identifierSchema,
    displayName: z.string().trim().min(1).max(200),
    channels: z.record(identifierSchema, smtpRecipientDetailsSchema),
  })
  .strict();

export const configKindSchema = z.object({
  kind: z.enum(["channel", "recipient"]),
});

export type SmtpChannelFile = z.infer<typeof smtpChannelFileSchema>;
export type RecipientFile = z.infer<typeof recipientFileSchema>;

function isMailbox(value: string): boolean {
  const angleAddress = /<([^<>]+)>$/.exec(value);
  const address = angleAddress?.[1] ?? value;
  return z.email().safeParse(address.trim()).success;
}

function isHost(value: string): boolean {
  if (isIP(value) !== 0) {
    return true;
  }
  return (
    value.length <= 253 &&
    value.split(".").every((label) => /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)$/.test(label))
  );
}
