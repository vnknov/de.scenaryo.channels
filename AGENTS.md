# Channels MCP Implementation Plan

## Purpose

Build a clean, independently deployed MCP server that allows agents to send notifications to
configured recipients without exposing delivery protocols, credentials, or recipient addresses to
the agent.

The primary client is OpenCode. The server runs continuously in Docker on a machine in the local
network, and OpenCode connects to it as a remote MCP server over HTTP.

## Core Requirements

- Use Node.js and TypeScript with strict compiler settings.
- Expose a remote HTTP MCP endpoint at `/mcp`.
- Expose a health endpoint at `/health`.
- Require bearer-token authentication for the MCP endpoint.
- Run as a long-lived Docker service, independently of OpenCode.
- Discover all channel and recipient definitions from YAML files located directly in the mounted
  `config/` directory.
- Keep credentials in environment variables. Configuration files only name the environment variables
  containing credentials.
- Accept structured notification content and render HTML and plain text in the server. Agents must
  not submit arbitrary HTML.
- Initially support SMTP while making additional delivery protocols easy to add without changing the
  MCP or application layers.

## Architectural Principles

Apply SOLID principles and maintain explicit boundaries between transport, application logic, domain
models, configuration, rendering, and delivery providers.

- HTTP and MCP adapters translate external requests into application calls.
- Application services orchestrate use cases and depend on abstractions.
- Domain types contain protocol-independent notification concepts.
- Providers implement delivery protocols such as SMTP.
- Configuration loading and validation are infrastructure concerns.
- Renderers convert structured messages into delivery-ready representations.
- MCP handlers must not access Nodemailer, YAML files, or environment variables directly.

Prefer small, cohesive modules and constructor injection. Do not add layers, interfaces, factories,
or abstractions unless they enforce an actual boundary or enable provider substitution.

## Proposed Project Structure

```text
.
├── config/
│   ├── work-email.yaml
│   ├── private-email.yaml
│   └── max.yaml
├── src/
│   ├── main.ts
│   ├── application/
│   │   ├── channelRegistry.ts
│   │   ├── notificationService.ts
│   │   └── recipientService.ts
│   ├── config/
│   │   ├── configLoader.ts
│   │   ├── configValidator.ts
│   │   └── schemas.ts
│   ├── domain/
│   │   ├── channel.ts
│   │   ├── errors.ts
│   │   ├── notification.ts
│   │   └── recipient.ts
│   ├── providers/
│   │   ├── notificationProvider.ts
│   │   └── smtpProvider.ts
│   ├── rendering/
│   │   ├── htmlRenderer.ts
│   │   └── textRenderer.ts
│   ├── security/
│   │   └── bearerAuth.ts
│   └── server/
│       ├── httpServer.ts
│       └── mcpServer.ts
├── test/
├── .env.example
├── Dockerfile
├── docker-compose.yaml
├── package.json
└── tsconfig.json
```

Adjust exact filenames when implementation details justify it, but preserve the architectural
boundaries.

## Channel Model

A provider type is not a channel ID.

- A provider type identifies a transport implementation, such as `smtp`.
- A channel is one configured instance of that provider.
- Multiple channels may use the same provider type.
- Every channel declares a stable `id`; filenames are used only for discovery and diagnostics.
- Recipients refer to concrete channel IDs, never provider types.

For example, `work-email.yaml` and `private-email.yaml` are two distinct channels that both use the
single SMTP provider implementation.

### SMTP Channel Example

`config/work-email.yaml`:

```yaml
kind: channel
id: work-email
type: smtp
displayName: Work Email
from: "Agent Work <agent@company.example>"
host: smtp.company.example
port: 587
secure: false
auth:
  userEnv: WORK_SMTP_USER
  passEnv: WORK_SMTP_PASS
```

`config/private-email.yaml`:

```yaml
kind: channel
id: private-email
type: smtp
displayName: Private Email
from: "Agent Private <agent@example.org>"
host: smtp.example.org
port: 465
secure: true
auth:
  userEnv: PRIVATE_SMTP_USER
  passEnv: PRIVATE_SMTP_PASS
```

The resulting channel IDs are `work-email` and `private-email`, independently of the filenames.

## Recipient Model

Each recipient file has `kind: recipient`, a stable recipient ID, a display name, and delivery
details keyed by concrete channel ID. Provider-specific details remain internal and must not be
returned by listing tools.

`config/max.yaml`:

```yaml
kind: recipient
id: max
displayName: Max Mustermann
channels:
  work-email:
    email: max@company.example
  private-email:
    email: max@example.org
```

This model allows one recipient to use multiple channels of the same provider type, potentially with
a different destination for each channel.

## Configuration Discovery and Validation

Load every `.yaml` and `.yml` file directly under `config/`. Do not require channel or recipient
subdirectories.

Use `kind` to discriminate file contents:

- `kind: channel` defines a configured channel instance.
- `kind: recipient` defines one recipient.
- Missing or unknown `kind` values are startup errors.

Validate configuration eagerly at startup and terminate with actionable error messages when it is
invalid. At minimum, validate:

- YAML syntax and schema using Zod.
- Safe channel and recipient IDs from YAML, using a documented pattern such as `^[a-zA-Z0-9._-]+$`.
- Unique channel IDs and recipient IDs.
- Known provider type for every channel.
- Existing channel references for every recipient.
- Provider-specific channel and recipient settings.
- Referenced SMTP credential environment variables exist and are non-empty.
- SMTP ports and security settings are valid.

Multiple channels sharing the same provider type are valid and expected.

Configuration is loaded at process startup. Hot reload is out of scope for the initial
implementation; restart the container after changing configuration.

## Provider Contract

Create a protocol-independent `NotificationProvider` abstraction. The application resolves a
configured channel's `type` to one provider implementation and passes that implementation both the
concrete channel configuration and recipient details.

Conceptually:

```ts
interface NotificationProvider {
  readonly type: string;

  send(input: {
    channelId: string;
    channel: ChannelConfig;
    recipient: RecipientChannelDetails;
    message: RenderedNotification;
  }): Promise<void>;
}
```

Use a provider registry keyed by provider type:

```text
work-email    -> smtp -> SmtpProvider
private-email -> smtp -> SmtpProvider
alert-email   -> smtp -> SmtpProvider
```

Do not instantiate one provider class per configured channel unless a concrete technical need
emerges. The SMTP implementation must be able to send with the settings of the selected channel
instance.

## Structured Notification Contract

The agent sends structured data only:

```ts
interface NotificationMessage {
  title: string;
  summary: string;
  details?: string[];
  actions?: Array<{
    label: string;
    url: string;
  }>;
}
```

Enforce reasonable length and item-count limits in the input schema.

The server generates:

- The email subject from `title`.
- Safe HTML from all fields.
- A plain-text fallback from the same fields.

Escape every text value before embedding it in HTML. Accept action URLs only when they use `http:`
or `https:`. Never accept scripts, inline event handlers, raw HTML, or arbitrary CSS from MCP
clients.

## MCP Tools

### `list_recipients`

Return public recipient metadata only:

```json
[
  {
    "id": "max",
    "displayName": "Max Mustermann",
    "channels": ["work-email", "private-email"]
  }
]
```

Do not expose email addresses, phone numbers, SMTP settings, credential names, or credentials.

### `list_channels`

Accept an optional `recipientId`. Without it, return all configured channel instances. With it,
return only channels configured for that recipient.

```json
[
  {
    "id": "work-email",
    "displayName": "Work Email",
    "type": "smtp"
  },
  {
    "id": "private-email",
    "displayName": "Private Email",
    "type": "smtp"
  }
]
```

### `send_notification`

Input:

```json
{
  "recipientId": "max",
  "channelId": "work-email",
  "message": {
    "title": "Task is taking longer",
    "summary": "The analysis is still running.",
    "details": ["Current step: test execution", "No errors have occurred"],
    "actions": [
      {
        "label": "Open logs",
        "url": "https://example.org/logs/123"
      }
    ]
  }
}
```

Before sending, verify that the recipient and channel exist, the recipient has details for the
selected concrete channel, and the provider supports both configurations. Return a concise success
result without leaking delivery details or credentials.

## HTTP Transport and Security

Use the current MCP SDK HTTP transport supported by OpenCode. The service is stateful only where
required by that transport; notification and config services should remain transport-independent.

Required endpoints:

- `POST /mcp` and any additional MCP methods required by the selected SDK transport.
- `GET /health` for container and operator health checks.

Require this header on MCP requests:

```http
Authorization: Bearer <token>
```

Read the expected token from `CHANNELS_MCP_TOKEN`. Fail startup when it is missing or empty. Compare
credentials using a timing-safe operation and never log the token. Return `401` for missing or
invalid authentication.

The initial deployment may use plain HTTP on a trusted local network, but the README must recommend
HTTPS through a reverse proxy when traffic crosses an untrusted network. Bearer authentication does
not encrypt traffic.

Do not include secrets, recipient delivery details, or full message bodies in logs. Log operational
metadata such as channel ID, recipient ID, provider type, result, and a generated request or
delivery ID.

## Docker Deployment

Provide a multi-stage `Dockerfile` that builds TypeScript and runs only the production output and
production dependencies as a non-root user.

Provide `docker-compose.yaml` with:

- A published HTTP port, defaulting to `3000`.
- `./config:/app/config:ro`.
- Environment loading suitable for the bearer token and SMTP credentials.
- `restart: unless-stopped`.
- A health check against `/health` when practical.
- No TTY or stdin requirements.

Conceptual service definition:

```yaml
services:
  channels-mcp:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - ./config:/app/config:ro
    restart: unless-stopped
```

Add `.dockerignore` and `.env.example`. Never commit a populated `.env` file or real credentials.

## OpenCode Integration

Document the server as a remote MCP in OpenCode. OpenCode must not start the container itself.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "channels": {
      "type": "remote",
      "url": "http://192.168.1.50:3000/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:CHANNELS_MCP_TOKEN}"
      }
    }
  }
}
```

The token in the OpenCode host environment must equal the server token. Do not put the token
directly in `opencode.json`. After changing OpenCode configuration, quit and restart OpenCode
because configuration is not hot reloaded.

## Error Handling

Use typed domain/application errors and map them at the MCP boundary. Expected errors include:

- Unknown recipient.
- Unknown channel.
- Channel unavailable for recipient.
- Invalid message.
- Provider configuration error.
- Delivery failure.

Errors returned to the agent should be actionable but must not reveal SMTP credentials, recipient
addresses, stack traces, or sensitive provider responses. Log internal causes safely on the server.

## Testing Strategy

At minimum, add tests for:

- Discovery and classification of mixed YAML files in one directory.
- Invalid, duplicate, and cross-referenced configuration.
- Multiple SMTP channels using the same provider implementation.
- Filtering channels by recipient.
- Notification use-case routing by concrete channel ID and provider type.
- HTML escaping, plain-text rendering, and unsafe action URL rejection.
- Missing and invalid bearer tokens.
- MCP tool input validation and safe errors.
- SMTP provider behavior with Nodemailer mocked or injected behind a narrow mail transport boundary.

Tests must not contact a real SMTP server. Keep application tests independent of HTTP and MCP where
possible, and add focused integration tests for adapter wiring.

## Initial Dependencies

Use maintained, focused packages:

- `@modelcontextprotocol/server`
- `@modelcontextprotocol/node`
- `@modelcontextprotocol/express`
- `express`, if the MCP SDK does not provide sufficient HTTP routing
- `nodemailer`
- `yaml`
- `zod`
- TypeScript and relevant type packages

Confirm the current MCP SDK HTTP transport API before implementation rather than relying on outdated
examples.

## Implementation Sequence

1. Create the strict TypeScript project and test setup.
2. Define domain types and structured notification schemas.
3. Implement YAML discovery, parsing, and startup validation.
4. Implement renderers with escaping and URL validation.
5. Define the provider abstraction and provider registry.
6. Implement SMTP delivery using per-channel settings and environment-backed credentials.
7. Implement recipient listing, channel listing, and notification use cases.
8. Register the three MCP tools against application services.
9. Add the HTTP transport, bearer authentication, health endpoint, and safe logging.
10. Add Docker packaging and Compose deployment.
11. Add example configs, `.env.example`, and comprehensive README setup instructions for Docker and
    OpenCode.
12. Run formatting, linting, unit tests, integration tests, TypeScript build, and a container health
    smoke test.

## Definition of Done

- OpenCode can connect to a separately running Docker container over the local network using a
  remote MCP configuration and bearer token.
- OpenCode can list recipients and concrete channel instances without seeing private delivery
  details.
- A recipient can have multiple SMTP channels backed by different outgoing accounts.
- A structured notification is rendered safely to HTML and plain text and is delivered through the
  selected SMTP channel.
- Invalid configuration fails fast with a useful message.
- No secrets or recipient addresses are exposed through MCP results or logs.
- The project builds cleanly, tests pass, and the documented Compose setup starts a healthy service.
