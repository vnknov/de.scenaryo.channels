# Channels MCP

Channels MCP is a remote Model Context Protocol server that lets agents send structured
notifications without learning delivery credentials or recipient addresses. It runs independently in
Docker and is designed primarily for OpenCode.

The initial provider is SMTP. Multiple configured channels can use the same SMTP provider, allowing
separate outgoing accounts such as work and private email.

## MCP Tools

- `list_recipients` returns public recipient IDs, names, and available channel IDs.
- `list_channels` returns configured channel instances and can filter them by recipient.
- `send_notification` accepts a recipient, concrete channel, and structured message.

The server never returns delivery addresses, SMTP settings, credential names, or credentials through
MCP.

## Message Format

Agents send structured content rather than raw HTML:

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

The server escapes all content and renders both HTML and plain text. Action URLs are restricted to
HTTP and HTTPS.

## Configuration

Every `.yaml` or `.yml` file directly inside `config/` is loaded at startup. Files are classified by
`kind`. Missing or unknown kinds, invalid schemas, missing credentials, duplicate IDs, and invalid
channel references stop startup with an error.

### Channels

Each channel declares its stable `id` in YAML. Filenames are used only for discovery and error
messages, so files may be renamed without changing recipient mappings. Provider type and channel ID
are deliberately different concepts: any number of channel files can use `type: smtp`.

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

Credentials stay in environment variables. `userEnv` and `passEnv` contain variable names, not
credential values.

### Recipients

Recipient delivery details are keyed by concrete channel ID:

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

Restart the container after changing configuration. Hot reload is not implemented.

## Docker Deployment

1. Copy the environment template and replace every placeholder:

   ```sh
   cp .env.example .env
   ```

2. Replace the example YAML files in `config/` with your channel and recipient definitions.

3. Start the long-running service:

   ```sh
   docker compose up -d --build
   ```

4. Check its health:

   ```sh
   curl http://127.0.0.1:3000/health
   ```

The Compose service publishes port `3000` by default. Set `CHANNELS_PORT` to change the host-side
port. `CHANNELS_ALLOWED_HOSTS` should list every hostname or IP address clients use to reach the
server, plus `localhost` and `127.0.0.1` for local health checks.

## OpenCode

Set `CHANNELS_MCP_TOKEN` in the environment that starts OpenCode. It must equal the server token.
Then add the remote server to the appropriate `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "channels": {
      "type": "remote",
      "url": "http://192.168.1.50:3000/mcp",
      "enabled": true,
      "oauth": false,
      "headers": {
        "Authorization": "Bearer {env:CHANNELS_MCP_TOKEN}"
      }
    }
  }
}
```

Use the actual hostname or LAN IP of the Docker host. Do not put the token directly in
`opencode.json`. Quit and restart OpenCode after changing its configuration because OpenCode does
not hot-reload MCP settings.

Bearer authentication does not encrypt traffic. Plain HTTP is appropriate only on a trusted network.
Use HTTPS through a reverse proxy when traffic can cross an untrusted network.

## Development

Requires Node.js 20 or newer.

```sh
npm ci
npm run verify
```

Tests use injected transports and never contact a real SMTP server.

## Endpoints

- `POST /mcp` serves MCP Streamable HTTP. Legacy stateless requests used by current OpenCode
  releases are supported by the SDK.
- `GET /mcp` and `DELETE /mcp` are handled according to the negotiated MCP protocol and require
  authentication.
- `GET /health` returns public process health for Docker and operators.
