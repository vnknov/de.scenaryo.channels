import { describe, expect, it } from "vitest";
import { renderHtml } from "../src/rendering/htmlRenderer.js";
import { renderText } from "../src/rendering/textRenderer.js";
import { notificationMessageSchema } from "../src/server/toolSchemas.js";

describe("notification rendering", () => {
  it("escapes all HTML-controlled text", () => {
    const html = renderHtml({
      title: "<Status>",
      summary: "A & B <script>alert(1)</script>",
      details: ['Value "quoted"'],
      actions: [{ label: "Open >", url: "https://example.org/?a=1&b=2" }],
    });

    expect(html).toContain("&lt;Status&gt;");
    expect(html).toContain("A &amp; B &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Value &quot;quoted&quot;");
    expect(html).toContain("https://example.org/?a=1&amp;b=2");
    expect(html).not.toContain("<script>");
  });

  it("renders a readable plain-text fallback", () => {
    expect(
      renderText({
        title: "Build complete",
        summary: "The build passed.",
        details: ["Duration: 5 minutes"],
        actions: [{ label: "Open build", url: "https://example.org/build" }],
      }),
    ).toBe(
      "Build complete\n\nThe build passed.\n\n- Duration: 5 minutes\n\nOpen build: https://example.org/build",
    );
  });

  it("rejects non-HTTP action URLs", () => {
    const result = notificationMessageSchema.safeParse({
      title: "Unsafe",
      summary: "Unsafe action",
      actions: [{ label: "Run", url: "javascript:alert(1)" }],
    });

    expect(result.success).toBe(false);
  });
});
