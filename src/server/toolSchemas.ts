import { z } from "zod";

const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._-]+$/, "must contain only letters, numbers, '.', '_' or '-'");

export const notificationMessageSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[^\r\n]+$/, "must not contain line breaks"),
    summary: z.string().trim().min(1).max(2_000),
    details: z.array(z.string().trim().min(1).max(1_000)).max(20).optional(),
    actions: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(100),
            url: z
              .url()
              .max(2_048)
              .refine((url) => {
                const protocol = new URL(url).protocol;
                return protocol === "http:" || protocol === "https:";
              }, "only HTTP and HTTPS action URLs are allowed"),
          })
          .strict(),
      )
      .max(10)
      .optional(),
  })
  .strict();

export const sendNotificationInputSchema = z
  .object({
    recipientId: identifierSchema,
    channelId: identifierSchema,
    message: notificationMessageSchema,
  })
  .strict();

export const listChannelsInputSchema = z
  .object({
    recipientId: identifierSchema.optional(),
  })
  .strict();
