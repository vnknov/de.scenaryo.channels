import { describe, expect, it } from "vitest";
import { StructuredNotificationRenderer } from "../src/rendering/notificationRenderer.js";
import { MAX_ATTACHMENT_BYTES, notificationMessageSchema } from "../src/server/toolSchemas.js";

describe("notification attachments", () => {
  it("validates and decodes a Base64 attachment", () => {
    const message = {
      title: "Report",
      summary: "The report is attached.",
      attachments: [
        {
          filename: "report.txt",
          contentType: "text/plain",
          contentBase64: Buffer.from("report contents", "utf8").toString("base64"),
        },
      ],
    };

    expect(notificationMessageSchema.safeParse(message).success).toBe(true);
    const rendered = new StructuredNotificationRenderer().render(message);
    expect(rendered.attachments).toEqual([
      {
        filename: "report.txt",
        contentType: "text/plain",
        content: Buffer.from("report contents", "utf8"),
      },
    ]);
  });

  it.each(["../secret.txt", "folder/file.txt", "folder\\file.txt", ".", ".."])(
    "rejects unsafe filename %s",
    (filename) => {
      const result = notificationMessageSchema.safeParse({
        title: "Unsafe",
        summary: "Unsafe attachment",
        attachments: [
          {
            filename,
            contentType: "text/plain",
            contentBase64: "dGVzdA==",
          },
        ],
      });

      expect(result.success).toBe(false);
    },
  );

  it("rejects malformed Base64 and data URLs", () => {
    for (const contentBase64 of ["not base64", "data:text/plain;base64,dGVzdA==", "dGVzdA="]) {
      const result = notificationMessageSchema.safeParse({
        title: "Unsafe",
        summary: "Unsafe attachment",
        attachments: [{ filename: "test.txt", contentType: "text/plain", contentBase64 }],
      });

      expect(result.success).toBe(false);
    }
  });

  it("rejects an attachment larger than the per-file limit", () => {
    const contentBase64 = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1).toString("base64");
    const result = notificationMessageSchema.safeParse({
      title: "Too large",
      summary: "Oversized attachment",
      attachments: [
        { filename: "large.bin", contentType: "application/octet-stream", contentBase64 },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects attachments larger than the total limit", () => {
    const contentBase64 = Buffer.alloc(MAX_ATTACHMENT_BYTES).toString("base64");
    const attachments = ["one.bin", "two.bin", "three.bin"].map((filename) => ({
      filename,
      contentType: "application/octet-stream",
      contentBase64,
    }));
    const result = notificationMessageSchema.safeParse({
      title: "Too large",
      summary: "Oversized attachments",
      attachments,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ["attachments"] }),
      );
    }
  });
});
