import type {
  VoiceProviderId,
} from "@/lib/voice";

export type IvrProviderId =
  VoiceProviderId;

export type IvrCapabilitySupport =
  | "ready"
  | "planned"
  | "unsupported";

export type IvrCapabilityId =
  | "logic.condition"
  | "time.business_hours"

  | "call.answer"
  | "call.hangup"

  | "audio.play"
  | "tts.speak"

  | "input.dtmf"
  | "input.voice"

  | "queue.route"
  | "extension.route"
  | "call.transfer";

export type IvrNodeType =
  | "trigger.inbound"

  | "call.answer"

  | "audio.play"
  | "tts.speak"

  | "input.dtmf"
  | "input.voice"

  | "time.business_hours"
  | "logic.condition"

  | "queue.route"
  | "extension.route"
  | "call.transfer"

  | "call.hangup";

export interface IvrFlowNode {
  id:
    string;

  type:
    IvrNodeType;

  position: {
    x:
      number;

    y:
      number;
  };

  data:
    Record<
      string,
      unknown
    >;
}

export interface IvrFlowEdge {
  id:
    string;

  source:
    string;

  target:
    string;

  sourceHandle?:
    string | null;

  targetHandle?:
    string | null;

  label?:
    string | null;
}

export interface IvrFlowViewport {
  x:
    number;

  y:
    number;

  zoom:
    number;
}

export interface IvrFlowDefinition {
  nodes:
    IvrFlowNode[];

  edges:
    IvrFlowEdge[];

  viewport?:
    IvrFlowViewport;

  settings?: {
    providers?:
      IvrProviderId[];

    maxSteps?:
      number;

    [key:
      string]:
      unknown;
  };
}

export type IvrNodeCategory =
  | "trigger"
  | "call"
  | "media"
  | "input"
  | "logic"
  | "routing";

export type IvrNodeOutputMode =
  | "none"
  | "single"
  | "branches"
  | "dynamic";

export interface IvrNodeDefinition {
  type:
    IvrNodeType;

  label:
    string;

  description:
    string;

  category:
    IvrNodeCategory;

  requiredCapabilities:
    IvrCapabilityId[];

  outputMode:
    IvrNodeOutputMode;

  outputs?:
    Array<{
      id:
        string;

      label:
        string;
    }>;
}

export interface IvrValidationIssue {
  severity:
    "error"
    | "warning";

  code:
    string;

  message:
    string;

  nodeId?:
    string;

  edgeId?:
    string;

  provider?:
    IvrProviderId;

  capability?:
    IvrCapabilityId;
}

export interface IvrValidationResult {
  valid:
    boolean;

  errors:
    IvrValidationIssue[];

  warnings:
    IvrValidationIssue[];
}
