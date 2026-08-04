import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse, YAMLParseError } from "yaml";
import type { ChannelConfig } from "../domain/channel.js";
import { ConfigurationError } from "../domain/errors.js";
import type { Recipient } from "../domain/recipient.js";
import { configKindSchema, recipientFileSchema, smtpChannelFileSchema } from "./schemas.js";

export interface LoadedConfiguration {
  channels: ReadonlyMap<string, ChannelConfig>;
  recipients: ReadonlyMap<string, Recipient>;
}

export async function loadConfiguration(
  configDirectory: string,
  environment: NodeJS.ProcessEnv,
): Promise<LoadedConfiguration> {
  const entries = await readdir(configDirectory, { withFileTypes: true }).catch(
    (error: unknown) => {
      throw new ConfigurationError(`Cannot read config directory '${configDirectory}'.`, {
        cause: error,
      });
    },
  );
  const files = entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (files.length === 0) {
    throw new ConfigurationError(`No YAML configuration files found in '${configDirectory}'.`);
  }

  const channels = new Map<string, ChannelConfig>();
  const recipients = new Map<string, Recipient>();

  for (const file of files) {
    const filePath = path.join(configDirectory, file.name);
    const document = await parseFile(filePath);
    const kindResult = configKindSchema.safeParse(document);
    if (!kindResult.success) {
      throw invalidFile(file.name, kindResult.error.message);
    }

    if (kindResult.data.kind === "channel") {
      const result = smtpChannelFileSchema.safeParse(document);
      if (!result.success) {
        throw invalidFile(file.name, result.error.message);
      }
      if (channels.has(result.data.id)) {
        throw invalidFile(file.name, `duplicate channel ID '${result.data.id}'`);
      }
      assertCredential(result.data.auth.userEnv, environment, file.name);
      assertCredential(result.data.auth.passEnv, environment, file.name);
      channels.set(result.data.id, {
        id: result.data.id,
        type: result.data.type,
        displayName: result.data.displayName,
        from: result.data.from,
        host: result.data.host,
        port: result.data.port,
        secure: result.data.secure,
        auth: result.data.auth,
      });
      continue;
    }

    const result = recipientFileSchema.safeParse(document);
    if (!result.success) {
      throw invalidFile(file.name, result.error.message);
    }
    if (recipients.has(result.data.id)) {
      throw invalidFile(file.name, `duplicate recipient ID '${result.data.id}'`);
    }
    recipients.set(result.data.id, {
      id: result.data.id,
      displayName: result.data.displayName,
      channels: result.data.channels,
    });
  }

  for (const recipient of recipients.values()) {
    for (const channelId of Object.keys(recipient.channels)) {
      if (!channels.has(channelId)) {
        throw new ConfigurationError(
          `Recipient '${recipient.id}' references unknown channel '${channelId}'.`,
        );
      }
    }
  }

  return { channels, recipients };
}

async function parseFile(filePath: string): Promise<unknown> {
  try {
    return parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error instanceof YAMLParseError) {
      const location = error.linePos?.[0];
      const position = location ? ` at line ${location.line}, column ${location.col}` : "";
      throw new ConfigurationError(
        `Cannot parse configuration file '${path.basename(filePath)}': ${error.code}${position}.`,
        { cause: error },
      );
    }
    throw new ConfigurationError(`Cannot parse configuration file '${path.basename(filePath)}'.`, {
      cause: error,
    });
  }
}

function assertCredential(
  variableName: string,
  environment: NodeJS.ProcessEnv,
  filename: string,
): void {
  if (!environment[variableName]?.trim()) {
    throw invalidFile(filename, `environment variable '${variableName}' is missing or empty`);
  }
}

function invalidFile(filename: string, reason: string): ConfigurationError {
  return new ConfigurationError(`Invalid configuration file '${filename}': ${reason}`);
}
