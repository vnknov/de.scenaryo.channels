import type { OperationalLogger } from "../application/notificationService.js";

export class ConsoleLogger implements OperationalLogger {
  public info(message: string, metadata: Record<string, unknown>): void {
    console.info(message, metadata);
  }

  public error(message: string, metadata: Record<string, unknown>): void {
    console.error(message, metadata);
  }
}
