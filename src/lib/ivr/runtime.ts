import type {
  VoiceProviderConfig,
} from "@/lib/voice/types";

import type {
  IvrFlowNode,
  IvrProviderId,
} from "./types";

export interface IvrRuntimeContext {
  /*
   * Tenant da execucao. Toda consulta do runtime
   * deve usar este escopo junto com o ID do recurso.
   */
  accountId:
    string;

  /*
   * ID da execucao IVR.
   */
  executionId:
    string;

  /*
   * Numero sequencial do step.
   * Torna operacoes externas idempotentes
   * sem quebrar loops do fluxo.
   */
  stepSequence:
    number;

  /*
   * ID interno da chamada Zenith.
   */
  callId:
    string;

  /*
   * ID da chamada no provider.
   */
  providerCallId:
    string;

  clientId:
    string;

  providerConfig:
    VoiceProviderConfig;
}

export interface IvrRuntimeResult {
  status:
    "completed"
    | "waiting";

  output?:
    Record<
      string,
      unknown
    >;
}

export interface IvrRuntime {
  provider:
    IvrProviderId;

  executeNode(
    context:
      IvrRuntimeContext,

    node:
      IvrFlowNode,
  ):
    Promise<
      IvrRuntimeResult
    >;
}

export class IvrRuntimeError
  extends Error {
  constructor(
    public code:
      string,

    message:
      string,

    public status:
      number = 500,
  ) {
    super(message);

    this.name =
      "IvrRuntimeError";
  }
}
