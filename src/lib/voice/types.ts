export type VoiceProviderId =
  | "wacalls"
  | "asterisk";

export type VoiceBrowserMediaMode =
  | "provider_sdp"
  | "sip_wss"
  | "none";

export type VoiceOutboundStartMode =
  | "server"
  | "browser_sip";

export type VoiceCallDirection =
  | "inbound"
  | "outbound";

export type VoiceCallState =
  | "new"
  | "ringing"
  | "connecting"
  | "active"
  | "ended"
  | "failed"
  | "rejected";

export interface VoiceProviderCapabilities {
  inboundCalls:
    boolean;

  outboundCalls:
    boolean;

  browserWebRtc:
    boolean;

  browserMediaMode:
    VoiceBrowserMediaMode;

  outboundStartMode:
    VoiceOutboundStartMode;

  acceptCall:
    boolean;

  rejectCall:
    boolean;

  hangupCall:
    boolean;

  recording:
    boolean;

  hold:
    boolean;

  mute:
    boolean;

  dtmf:
    boolean;

  serverPlayback:
    boolean;

  serverTts:
    boolean;
}

export interface WaCallsVoiceConfig {
  provider:
    "wacalls";

  baseUrl:
    string;

  sessionId:
    string;

  apiKey?:
    string | null;
}

export interface AsteriskVoiceConfig {
  provider:
    "asterisk";

  /*
   * Ex:
   * http://10.0.0.10:8088
   */
  ariBaseUrl:
    string;

  ariUsername:
    string;

  ariPassword:
    string;

  /*
   * Aplicacao Stasis dedicada ao Zenith.
   */
  stasisApp:
    string;

  /*
   * Nome do endpoint PJSIP do tronco.
   *
   * Ex:
   * operadora_principal
   */
  trunkEndpoint:
    string;

  /*
   * URL WSS entregue ao navegador.
   *
   * Ex:
   * wss://pbx.exemplo.com:8089/ws
   */
  webrtcWsUrl:
    string;

  sipDomain?:
    string | null;

  callerId?:
    string | null;
}

export type VoiceProviderConfig =
  | WaCallsVoiceConfig
  | AsteriskVoiceConfig;

export interface VoiceOperatorContext {
  clientId:
    string;
}

export interface StartVoiceCallRequest
  extends VoiceOperatorContext {
  to:
    string;
}

export interface StartVoiceCallResult {
  providerCallId:
    string;

  state:
    VoiceCallState;
}

export interface WebRtcExchangeRequest
  extends VoiceOperatorContext {
  providerCallId:
    string;

  sdpOffer:
    string;
}

export interface WebRtcExchangeResult {
  sdpAnswer:
    string;
}

export interface VoiceCallActionRequest
  extends VoiceOperatorContext {
  providerCallId:
    string;
}

export interface PlayVoiceAudioRequest
  extends VoiceOperatorContext {
  providerCallId:
    string;

  audioUrl:
    string;

  playbackId?:
    string;
}

export interface PlayVoiceAudioResult {
  playbackId:
    string;
}
export interface VoiceProvider {
  id:
    VoiceProviderId;

  capabilities:
    VoiceProviderCapabilities;

  /*
   * WaCalls inicia pelo backend.
   *
   * Asterisk usara browser SIP/WSS,
   * portanto este metodo pode nao existir.
   */
  startCall?(
    request:
      StartVoiceCallRequest,

    config:
      VoiceProviderConfig,
  ):
    Promise<
      StartVoiceCallResult
    >;

  /*
   * Usado pelo WaCalls.
   *
   * Asterisk negocia WebRTC diretamente
   * entre browser e PJSIP/WSS.
   */
  exchangeWebRtc?(
    request:
      WebRtcExchangeRequest,

    config:
      VoiceProviderConfig,
  ):
    Promise<
      WebRtcExchangeResult
    >;

  /*
   * Playback server-side.
   *
   * WaCalls usa
   * URL HTTP(S) de um WAV.
   *
   * Providers que nao implementarem
   * playback podem omitir este metodo.
   */
  playAudio?(
    request:
      PlayVoiceAudioRequest,

    config:
      VoiceProviderConfig,
  ):
    Promise<
      PlayVoiceAudioResult
    >;
  acceptCall(
    request:
      VoiceCallActionRequest,

    config:
      VoiceProviderConfig,
  ):
    Promise<void>;

  rejectCall(
    request:
      VoiceCallActionRequest,

    config:
      VoiceProviderConfig,
  ):
    Promise<void>;

  hangupCall(
    request:
      VoiceCallActionRequest,

    config:
      VoiceProviderConfig,
  ):
    Promise<void>;
}

export class VoiceProviderError
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
      "VoiceProviderError";
  }
}


