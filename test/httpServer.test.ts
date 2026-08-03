import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ChannelRegistry } from "../src/application/channelRegistry.js";
import { NotificationService } from "../src/application/notificationService.js";
import { RecipientService } from "../src/application/recipientService.js";
import type { SmtpChannelConfig } from "../src/domain/channel.js";
import type { Recipient } from "../src/domain/recipient.js";
import type { NotificationProvider } from "../src/providers/notificationProvider.js";
import { createHttpApplication } from "../src/server/httpServer.js";

function testApplication() {
  const channels = new Map();
  const recipients = new Map();
  return createHttpApplication(
    {
      recipientService: new RecipientService(channels, recipients),
      notificationService: new NotificationService(
        channels,
        recipients,
        new ChannelRegistry([]),
        { render: (message) => ({ subject: message.title, html: "html", text: "text" }) },
        { info: vi.fn(), error: vi.fn() },
      ),
    },
    { token: "test-token", allowedHosts: ["127.0.0.1"] },
  );
}

describe("HTTP server", () => {
  it("serves an unauthenticated health endpoint", async () => {
    const { app, mcpHandler } = testApplication();

    await request(app).get("/health").expect(200, { status: "ok" });
    await mcpHandler.close();
  });

  it("rejects missing and invalid bearer tokens", async () => {
    const { app, mcpHandler } = testApplication();

    await request(app).post("/mcp").send({}).expect(401, { error: "Unauthorized" });
    await request(app)
      .post("/mcp")
      .set("Authorization", "Bearer invalid")
      .send({})
      .expect(401, { error: "Unauthorized" });
    await mcpHandler.close();
  });

  it("serves MCP tools to authenticated clients", async () => {
    const { app, mcpHandler } = testApplication();

    const response = await request(app)
      .post("/mcp")
      .set("Authorization", "Bearer test-token")
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });

    expect(response.status).toBe(200);
    const payload = parseSse(response.text) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(payload.result.tools.map((tool) => tool.name)).toEqual([
      "list_recipients",
      "list_channels",
      "send_notification",
    ]);
    await mcpHandler.close();
  });

  it("rejects unsafe notification input before invoking the provider", async () => {
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
    const recipient: Recipient = {
      id: "max",
      displayName: "Max",
      channels: { mail: { email: "max@example.org" } },
    };
    const send = vi.fn<NotificationProvider["send"]>();
    const channels = new Map([[channel.id, channel]]);
    const recipients = new Map([[recipient.id, recipient]]);
    const { app, mcpHandler } = createHttpApplication(
      {
        recipientService: new RecipientService(channels, recipients),
        notificationService: new NotificationService(
          channels,
          recipients,
          new ChannelRegistry([{ type: "smtp", send }]),
          { render: (message) => ({ subject: message.title, html: "html", text: "text" }) },
          { info: vi.fn(), error: vi.fn() },
        ),
      },
      { token: "test-token", allowedHosts: ["127.0.0.1"] },
    );

    const response = await request(app)
      .post("/mcp")
      .set("Authorization", "Bearer test-token")
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "send_notification",
          arguments: {
            recipientId: "max",
            channelId: "mail",
            message: {
              title: "Unsafe",
              summary: "Unsafe action",
              actions: [{ label: "Run", url: "javascript:alert(1)" }],
            },
          },
        },
      });

    expect(response.status).toBe(200);
    const payload = parseSse(response.text) as { result: { isError: boolean } };
    expect(payload.result.isError).toBe(true);
    expect(send).not.toHaveBeenCalled();
    await mcpHandler.close();
  });
});

function parseSse(body: string): unknown {
  const dataLine = body.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) {
    throw new Error("MCP response did not contain an SSE data frame.");
  }
  return JSON.parse(dataLine.slice("data: ".length)) as unknown;
}
