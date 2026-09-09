import type {
  MessagingProviderCapabilities,
  MessagingProviderId,
  MessagingSendRequest,
} from "./types";

import {
  MessagingProviderError,
} from "./types";

export const messagingCapabilities:
  Record<
    MessagingProviderId,
    MessagingProviderCapabilities
  > = {
  meta: {
    serviceText: true,
    media: true,
    templates: true,
    interactive: true,
    marketing: true,
    broadcast: true,
  },

  evolution: {
    serviceText: true,
    media: true,

    // Mantidos bloqueados até termos
    // contrato real comprovado e,
    // principalmente, por política
    // do Zenith CRM.
    templates: false,
    interactive: false,
    marketing: false,
    broadcast: false,
  },
};

const mediaTypes = [
  "image",
  "document",
  "audio",
  "video",
] as const;

export function assertProviderCanSend(
  providerId: MessagingProviderId,
  request: MessagingSendRequest,
): void {
  const capabilities =
    messagingCapabilities[
      providerId
    ];

  const purpose =
    request.purpose ??
    "service";

  const mode =
    request.mode ??
    "single";

  if (
    purpose === "marketing" &&
    !capabilities.marketing
  ) {
    throw new MessagingProviderError(
      "marketing_not_supported",
      `O provider ${providerId} não permite mensagens de marketing.`,
      400,
    );
  }

  if (
    mode === "broadcast" &&
    !capabilities.broadcast
  ) {
    throw new MessagingProviderError(
      "broadcast_not_supported",
      `O provider ${providerId} não permite broadcast.`,
      400,
    );
  }

  if (
    request.contentType ===
      "text" &&
    !capabilities.serviceText
  ) {
    throw new MessagingProviderError(
      "text_not_supported",
      `O provider ${providerId} não permite mensagens de texto.`,
      400,
    );
  }

  if (
    mediaTypes.includes(
      request.contentType as
        (typeof mediaTypes)[number],
    ) &&
    !capabilities.media
  ) {
    throw new MessagingProviderError(
      "media_not_supported",
      `O provider ${providerId} não permite mídia.`,
      400,
    );
  }

  if (
    request.contentType ===
      "template" &&
    !capabilities.templates
  ) {
    throw new MessagingProviderError(
      "template_not_supported",
      `O provider ${providerId} não permite templates.`,
      400,
    );
  }

  if (
    request.contentType ===
      "interactive" &&
    !capabilities.interactive
  ) {
    throw new MessagingProviderError(
      "interactive_not_supported",
      `O provider ${providerId} não permite mensagens interativas neste runtime.`,
      400,
    );
  }
}
