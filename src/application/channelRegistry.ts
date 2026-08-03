import { ProviderNotFoundError } from "../domain/errors.js";
import type { NotificationProvider } from "../providers/notificationProvider.js";

export class ChannelRegistry {
  private readonly providers: ReadonlyMap<string, NotificationProvider>;

  public constructor(providers: NotificationProvider[]) {
    const providerMap = new Map<string, NotificationProvider>();
    for (const provider of providers) {
      if (providerMap.has(provider.type)) {
        throw new Error(`Duplicate notification provider type '${provider.type}'.`);
      }
      providerMap.set(provider.type, provider);
    }
    this.providers = providerMap;
  }

  public get(type: string): NotificationProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new ProviderNotFoundError(type);
    }
    return provider;
  }
}
