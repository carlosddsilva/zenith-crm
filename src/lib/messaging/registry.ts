import {
  evolutionMessagingProvider,
} from "./providers/evolution";

import {
  metaMessagingProvider,
} from "./providers/meta";

import type {
  MessagingProvider,
  MessagingProviderId,
} from "./types";

const providers:
  Record<
    MessagingProviderId,
    MessagingProvider
  > = {
  meta:
    metaMessagingProvider,

  evolution:
    evolutionMessagingProvider,
};

export function getMessagingProvider(
  providerId:
    MessagingProviderId,
): MessagingProvider {
  return providers[
    providerId
  ];
}
