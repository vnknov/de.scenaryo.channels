import { z } from "zod";

export const MAX_ATTACHMENT_COUNT = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._-]+$/, "must contain only letters, numbers, '.', '_' or '-'");

const attachmentSchema = z
  .object({
    filename: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine(isSafeFilename, "must be a filename without paths or control characters")
      .refine((filename) => filename !== "." && filename !== "..", "must be a safe filename")
      .describe("Filename shown to the recipient; directory paths are not allowed"),
    contentType: z
      .string()
      .max(127)
      .regex(
        /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*$/,
        "must be a MIME type such as application/pdf",
      )
      .describe("MIME type such as application/pdf or image/png"),
    contentBase64: z
      .string()
      .min(4)
      .max(Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4)
      .refine(isCanonicalBase64, "must be canonical Base64 without whitespace or a data-URL prefix")
      .refine(
        (content) => decodedBase64Size(content) <= MAX_ATTACHMENT_BYTES,
        `decoded attachment must not exceed ${MAX_ATTACHMENT_BYTES} bytes`,
      )
      .describe("Raw file bytes encoded as Base64, without a data-URL prefix"),
  })
  .strict();

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
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENT_COUNT).optional(),
  })
  .strict()
  .superRefine((message, context) => {
    const totalBytes =
      message.attachments?.reduce(
        (total, attachment) => total + decodedBase64Size(attachment.contentBase64),
        0,
      ) ?? 0;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      context.addIssue({
        code: "custom",
        path: ["attachments"],
        message: `decoded attachments must not exceed ${MAX_TOTAL_ATTACHMENT_BYTES} bytes in total`,
      });
    }
  });

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

function decodedBase64Size(content: string): number {
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  return (content.length / 4) * 3 - padding;
}

function isSafeFilename(filename: string): boolean {
  for (const character of filename) {
    const code = character.codePointAt(0) ?? 0;
    if (character === "/" || character === "\\" || code <= 31 || code === 127) {
      return false;
    }
  }
  return true;
}

function isCanonicalBase64(content: string): boolean {
  if (content.length % 4 !== 0) {
    return false;
  }

  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  const dataLength = content.length - padding;
  for (let index = 0; index < dataLength; index += 1) {
    const code = content.charCodeAt(index);
    const isBase64Character =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 43 ||
      code === 47;
    if (!isBase64Character) {
      return false;
    }
  }

  for (let index = dataLength; index < content.length; index += 1) {
    if (content.charCodeAt(index) !== 61) {
      return false;
    }
  }
  return padding === 0 || (padding === 1 && dataLength % 4 === 3) || dataLength % 4 === 2;
}
