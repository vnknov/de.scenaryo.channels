import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfiguration } from "../src/config/configLoader.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("loadConfiguration", () => {
  it("discovers mixed channel and recipient files in one directory", async () => {
    const directory = await fixtureDirectory({
      "outgoing-account-a.yaml": channelYaml("work-email", "WORK_USER", "WORK_PASS"),
      "outgoing-account-b.yml": channelYaml("private-email", "PRIVATE_USER", "PRIVATE_PASS"),
      "max.yaml": `
kind: recipient
id: max
displayName: Max Mustermann
channels:
  work-email:
    email: max@company.example
  private-email:
    email: max@example.org
`,
      "ignored.txt": "not configuration",
    });

    const result = await loadConfiguration(directory, {
      WORK_USER: "work-user",
      WORK_PASS: "work-pass",
      PRIVATE_USER: "private-user",
      PRIVATE_PASS: "private-pass",
    });

    expect([...result.channels.keys()].sort()).toEqual(["private-email", "work-email"]);
    expect(result.channels.get("work-email")).toMatchObject({
      id: "work-email",
      type: "smtp",
    });
    expect(result.recipients.get("max")?.channels).toEqual({
      "work-email": { email: "max@company.example" },
      "private-email": { email: "max@example.org" },
    });
  });

  it("rejects files without a kind", async () => {
    const directory = await fixtureDirectory({ "broken.yaml": "name: broken\n" });

    await expect(loadConfiguration(directory, {})).rejects.toThrow(
      "Invalid configuration file 'broken.yaml'",
    );
  });

  it("rejects duplicate recipient IDs", async () => {
    const directory = await fixtureDirectory({
      "mail.yaml": channelYaml("mail", "USER", "PASS"),
      "max-one.yaml": recipientYaml("max", "mail"),
      "max-two.yaml": recipientYaml("max", "mail"),
    });

    await expect(loadConfiguration(directory, { USER: "user", PASS: "pass" })).rejects.toThrow(
      "duplicate recipient ID 'max'",
    );
  });

  it("rejects duplicate channel IDs across differently named files", async () => {
    const directory = await fixtureDirectory({
      "first-account.yaml": channelYaml("mail", "USER", "PASS"),
      "second-account.yml": channelYaml("mail", "USER", "PASS"),
    });

    await expect(loadConfiguration(directory, { USER: "user", PASS: "pass" })).rejects.toThrow(
      "duplicate channel ID 'mail'",
    );
  });

  it("uses the configured channel ID independently of the filename", async () => {
    const directory = await fixtureDirectory({
      "descriptive outgoing account.yaml": channelYaml("stable-mail-id", "USER", "PASS"),
    });

    const result = await loadConfiguration(directory, { USER: "user", PASS: "pass" });

    expect([...result.channels.keys()]).toEqual(["stable-mail-id"]);
  });

  it("rejects recipients referencing unknown channels", async () => {
    const directory = await fixtureDirectory({
      "max.yaml": recipientYaml("max", "missing"),
    });

    await expect(loadConfiguration(directory, {})).rejects.toThrow(
      "Recipient 'max' references unknown channel 'missing'",
    );
  });

  it("rejects missing credential environment variables", async () => {
    const directory = await fixtureDirectory({
      "mail.yaml": channelYaml("mail", "SMTP_USER", "SMTP_PASS"),
    });

    await expect(loadConfiguration(directory, { SMTP_USER: "user" })).rejects.toThrow(
      "environment variable 'SMTP_PASS' is missing or empty",
    );
  });

  it("reports YAML syntax error locations", async () => {
    const directory = await fixtureDirectory({
      "broken.yaml": "kind: channel\nauth: [\n",
    });

    await expect(loadConfiguration(directory, {})).rejects.toThrow(
      /Cannot parse configuration file 'broken\.yaml': \w+ at line \d+, column \d+\./,
    );
  });

  it("rejects malformed SMTP sender and host settings", async () => {
    const directory = await fixtureDirectory({
      "mail.yaml": channelYaml("mail", "USER", "PASS")
        .replace("Agent <agent@example.org>", "not-an-address")
        .replace("smtp.example.org", "bad host"),
    });

    await expect(loadConfiguration(directory, { USER: "user", PASS: "pass" })).rejects.toThrow(
      "Invalid configuration file 'mail.yaml'",
    );
  });
});

async function fixtureDirectory(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "channels-config-"));
  directories.push(directory);
  await Promise.all(
    Object.entries(files).map(([filename, contents]) =>
      writeFile(path.join(directory, filename), contents.trimStart(), "utf8"),
    ),
  );
  return directory;
}

function channelYaml(id: string, userEnv: string, passEnv: string): string {
  return `
kind: channel
id: ${id}
type: smtp
displayName: Email
from: Agent <agent@example.org>
host: smtp.example.org
port: 587
secure: false
auth:
  userEnv: ${userEnv}
  passEnv: ${passEnv}
`;
}

function recipientYaml(id: string, channelId: string): string {
  return `
kind: recipient
id: ${id}
displayName: Max
channels:
  ${channelId}:
    email: max@example.org
`;
}
