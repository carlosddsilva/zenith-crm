export type MessagingProviderId =
  | "meta"
  | "evolution";

export type MessagingPurpose =
  | "service"
  | "marketing";

export type MessagingMode =
  | "single"
  | "broadcast";

export type MessagingContentType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "video"
  | "template"
  | "interactive";

export interface MessagingInteractiveButton {
  id: string;
  title: string;
}

export interface MessagingInteractiveListRow {
  id: string;
  title: string;
  description?: string;
}

export interface MessagingInteractiveListSection {
  title?: string;
  rows: MessagingInteractiveListRow[];
}

export type MessagingInteractivePayload =
  | {
      kind: "buttons";
      bodyText: string;
      headerText?: string;
      footerText?: string;
      buttons: MessagingInteractiveButton[];
    }
  | {
      kind: "list";
      bodyText: string;
      buttonLabel: string;
      headerText?: string;
      footerText?: string;
      sections: MessagingInteractiveListSection[];
    };

export interface MessagingSendRequest {
  to: string;

  contentType:
    MessagingContentType;

  purpose?: MessagingPurpose;

  mode?: MessagingMode;

  text?: string | null;

  mediaUrl?: string | null;

  filename?: string | null;

  templateName?: string | null;

  templateLanguage?: string | null;

  templateParams?: string[];

  interactive?:
    | MessagingInteractivePayload
    | null;

  replyToProviderMessageId?:
    | string
    | null;
}

export interface MessagingSendResult {
  provider:
    MessagingProviderId;

  providerMessageId:
    string;

  acceptedAt:
    string;
}

export interface MetaMessagingConfig {
  provider: "meta";
  phoneNumberId: string;
  accessToken: string;
}

export interface EvolutionMessagingConfig {
  provider: "evolution";
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}

export type MessagingProviderConfig =
  | MetaMessagingConfig
  | EvolutionMessagingConfig;

export interface MessagingProvider {
  readonly id:
    MessagingProviderId;

  readonly capabilities:
    MessagingProviderCapabilities;

  send(
    request: MessagingSendRequest,
    config: MessagingProviderConfig,
  ): Promise<MessagingSendResult>;
}

export interface MessagingProviderCapabilities {
  serviceText: boolean;
  media: boolean;
  templates: boolean;
  interactive: boolean;
  marketing: boolean;
  broadcast: boolean;
}

export class MessagingProviderError
  extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    message: string,
    status = 400,
  ) {
    super(message);

    this.name =
      "MessagingProviderError";

    this.code = code;
    this.status = status;
  }
}
