import { createServer, type Server } from "node:http";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, type McpHttpHandler } from "@modelcontextprotocol/server";
import type { Express } from "express";
import type { McpServices } from "./mcpServer.js";
import { createChannelsMcpServer } from "./mcpServer.js";
import { createBearerAuth } from "../security/bearerAuth.js";

export interface HttpServerOptions {
  token: string;
  allowedHosts?: string[];
}

export interface ChannelsHttpApplication {
  app: Express;
  mcpHandler: McpHttpHandler;
}

export function createHttpApplication(
  services: McpServices,
  options: HttpServerOptions,
): ChannelsHttpApplication {
  const app = createMcpExpressApp({
    host: "0.0.0.0",
    ...(options.allowedHosts?.length
      ? { allowedHosts: options.allowedHosts, allowedOrigins: options.allowedHosts }
      : {}),
    jsonLimit: "100kb",
  });
  const mcpHandler = createMcpHandler(() => createChannelsMcpServer(services), {
    legacy: "stateless",
    onerror: (error) => console.error("MCP request failed", { error: error.name }),
  });
  const nodeHandler = toNodeHandler(mcpHandler, {
    onerror: (error) => console.error("MCP HTTP adapter failed", { error: error.name }),
  });
  const authenticate = createBearerAuth(options.token);

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });
  app.all("/mcp", authenticate, (request, response) => {
    void nodeHandler(request, response, request.body);
  });

  return { app, mcpHandler };
}

export function startHttpServer(app: Express, port: number): Promise<Server> {
  const server = createServer(app);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}
