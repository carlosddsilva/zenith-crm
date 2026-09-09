import {
  sendInteractiveButtons,
  sendInteractiveList,
  sendMediaMessage,
  sendTemplateMessage,
  sendTextMessage,
  type MediaKind,
} from "@/lib/whatsapp/meta-api";

import {
  assertProviderCanSend,
  messagingCapabilities,
} from "../capabilities";

import type {
  MessagingProvider,
  MessagingProviderConfig,
  MessagingSendRequest,
  MessagingSendResult,
  MetaMessagingConfig,
} from "../types";

import {
  MessagingProviderError,
} from "../types";

function requireMetaConfig(
  config:
    MessagingProviderConfig,
): MetaMessagingConfig {
  if (
    config.provider !== "meta"
  ) {
    throw new MessagingProviderError(
      "invalid_provider_config",
      "Configuração Meta inválida.",
      500,
    );
  }

  if (
    !config.phoneNumberId ||
    !config.accessToken
  ) {
    throw new MessagingProviderError(
      "meta_not_configured",
      "Meta Cloud API não configurada.",
      400,
    );
  }

  return config;
}

function requireText(
  request:
    MessagingSendRequest,
): string {
  const text =
    request.text?.trim();

  if (!text) {
    throw new MessagingProviderError(
      "invalid_message",
      "Texto da mensagem é obrigatório.",
      400,
    );
  }

  return text;
}

async function sendMeta(
  request:
    MessagingSendRequest,
  config:
    MetaMessagingConfig,
): Promise<string> {
  const common = {
    phoneNumberId:
      config.phoneNumberId,

    accessToken:
      config.accessToken,

    to: request.to,
  };

  if (
    request.contentType ===
    "text"
  ) {
    const result =
      await sendTextMessage({
        ...common,

        text:
          requireText(
            request,
          ),

        contextMessageId:
          request.replyToProviderMessageId ??
          undefined,
      });

    return result.messageId;
  }

  if (
    request.contentType ===
      "image" ||
    request.contentType ===
      "video" ||
    request.contentType ===
      "document" ||
    request.contentType ===
      "audio"
  ) {
    if (!request.mediaUrl) {
      throw new MessagingProviderError(
        "invalid_message",
        "mediaUrl é obrigatório para mensagens de mídia.",
        400,
      );
    }

    const result =
      await sendMediaMessage({
        ...common,

        kind:
          request.contentType as
            MediaKind,

        link:
          request.mediaUrl,

        caption:
          request.text ??
          undefined,

        filename:
          request.filename ??
          undefined,

        contextMessageId:
          request.replyToProviderMessageId ??
          undefined,
      });

    return result.messageId;
  }

  if (
    request.contentType ===
    "template"
  ) {
    if (
      !request.templateName
    ) {
      throw new MessagingProviderError(
        "invalid_message",
        "templateName é obrigatório.",
        400,
      );
    }

    const result =
      await sendTemplateMessage({
        ...common,

        templateName:
          request.templateName,

        language:
          request.templateLanguage ??
          "pt_BR",

        params:
          request.templateParams,

        contextMessageId:
          request.replyToProviderMessageId ??
          undefined,
      });

    return result.messageId;
  }

  if (
    request.contentType ===
    "interactive"
  ) {
    const payload =
      request.interactive;

    if (!payload) {
      throw new MessagingProviderError(
        "invalid_message",
        "Payload interativo é obrigatório.",
        400,
      );
    }

    if (
      payload.kind ===
      "buttons"
    ) {
      const result =
        await sendInteractiveButtons({
          ...common,

          bodyText:
            payload.bodyText,

          headerText:
            payload.headerText,

          footerText:
            payload.footerText,

          buttons:
            payload.buttons,

          contextMessageId:
            request.replyToProviderMessageId ??
            undefined,
        });

      return result.messageId;
    }

    const result =
      await sendInteractiveList({
        ...common,

        bodyText:
          payload.bodyText,

        buttonLabel:
          payload.buttonLabel,

        headerText:
          payload.headerText,

        footerText:
          payload.footerText,

        sections:
          payload.sections,

        contextMessageId:
          request.replyToProviderMessageId ??
          undefined,
      });

    return result.messageId;
  }

  throw new MessagingProviderError(
    "unsupported_message_type",
    `Tipo ${request.contentType} não suportado pelo Meta provider.`,
    400,
  );
}

export const metaMessagingProvider:
  MessagingProvider = {
  id: "meta",

  capabilities:
    messagingCapabilities.meta,

  async send(
    request,
    providerConfig,
  ): Promise<MessagingSendResult> {
    assertProviderCanSend(
      "meta",
      request,
    );

    const config =
      requireMetaConfig(
        providerConfig,
      );

    const providerMessageId =
      await sendMeta(
        request,
        config,
      );

    return {
      provider: "meta",
      providerMessageId,
      acceptedAt:
        new Date().toISOString(),
    };
  },
};
