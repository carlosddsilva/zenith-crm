import {
  asteriskVoiceProvider,
} from "./providers/asterisk";

import {
  waCallsVoiceProvider,
} from "./providers/wacalls";

import type {
  VoiceProvider,
  VoiceProviderId,
} from "./types";

import {
  VoiceProviderError,
} from "./types";

const providers:
  Record<
    VoiceProviderId,
    VoiceProvider
  > = {
  wacalls:
    waCallsVoiceProvider,

  asterisk:
    asteriskVoiceProvider,
};

export function getVoiceProvider(
  provider:
    VoiceProviderId,
): VoiceProvider {
  const implementation =
    providers[provider];

  if (!implementation) {
    throw new VoiceProviderError(
      "voice_provider_not_found",
      `Voice provider ${provider} nao encontrado.`,
      500,
    );
  }

  return implementation;
}
