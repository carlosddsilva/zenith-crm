"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Loader2,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  X,
} from "lucide-react";

import {
  toast,
} from "sonner";

import {
  Button,
} from "@/components/ui/button";

import {
  getVoiceClientId,
} from "@/lib/voice/browser/client-id";

import {
  openWaCallsVoiceCall,
  type OpenVoiceCall,
} from "@/lib/voice/browser/wacalls-webrtc";

type VoiceCallState =
  | "new"
  | "ringing"
  | "connecting"
  | "active"
  | "ended"
  | "failed"
  | "rejected";

type VoiceCallDirection =
  | "inbound"
  | "outbound";

type VoiceAction =
  | "accept"
  | "reject"
  | "hangup";

interface VoiceCallControlsProps {
  callId: string;

  state:
    VoiceCallState;

  direction:
    VoiceCallDirection;

  fromPhone?:
    string | null;

  toPhone?:
    string | null;

  contactName?:
    string | null;

  contactPhone?:
    string | null;

  onStateChange?:
    (
      state:
        VoiceCallState,
    ) => void;
}

async function requestCallAction(
  callId: string,
  action: VoiceAction,
  clientId: string,
) {
  const response =
    await fetch(
      `/api/zenith/calls/${encodeURIComponent(
        callId,
      )}/action`,
      {
        method:
          "POST",

        credentials:
          "include",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            action,

            client_id:
              clientId,
          }),
      },
    );

  const body =
    (await response
      .json()
      .catch(
        () => null,
      )) as
      | {
          error?: string;
          state?: VoiceCallState;
        }
      | null;

  if (!response.ok) {
    throw new Error(
      body?.error ??
        `Falha ao executar ${action} (${response.status}).`,
    );
  }

  return body;
}

function formatVoicePhone(
  value:
    string | null | undefined,
) {
  const raw =
    value?.trim() ?? "";

  if (!raw) {
    return "";
  }

  const digits =
    raw.replace(
      /\D/g,
      "",
    );

  /*
   * Brasil com codigo do pais:
   * 55 + DDD + numero.
   */
  if (
    digits.startsWith("55") &&
    digits.length === 13
  ) {
    return `+55 ${digits.slice(
      2,
      4,
    )} ${digits.slice(
      4,
      9,
    )}-${digits.slice(
      9,
    )}`;
  }

  if (
    digits.startsWith("55") &&
    digits.length === 12
  ) {
    return `+55 ${digits.slice(
      2,
      4,
    )} ${digits.slice(
      4,
      8,
    )}-${digits.slice(
      8,
    )}`;
  }

  return raw;
}

export function VoiceCallControls({
  callId,
  state,
  direction,
  fromPhone,
  toPhone,
  contactName,
  contactPhone,
  onStateChange,
}: VoiceCallControlsProps) {
  const connectionRef =
    useRef<
      OpenVoiceCall | null
    >(null);

  const audioRef =
    useRef<
      HTMLAudioElement | null
    >(null);

  const [busyAction, setBusyAction] =
    useState<
      VoiceAction | "webrtc" | null
    >(null);

  const [localState, setLocalState] =
    useState<
      VoiceCallState
    >(state);

  const [muted, setMuted] =
    useState(false);

  useEffect(
    () => {
      setLocalState(
        state,
      );

      if (
        state === "ended" ||
        state === "failed" ||
        state === "rejected"
      ) {
        connectionRef.current
          ?.close();

        connectionRef.current =
          null;

        if (
          audioRef.current
        ) {
          audioRef.current
            .srcObject =
            null;
        }
      }
    },
    [
      state,
    ],
  );

  useEffect(
    () => {
      return () => {
        connectionRef.current
          ?.close();

        connectionRef.current =
          null;
      };
    },
    [],
  );

  function updateState(
    next:
      VoiceCallState,
  ) {
    setLocalState(
      next,
    );

    onStateChange?.(
      next,
    );
  }

  async function acceptCall() {
    if (
      busyAction
    ) {
      return;
    }

    const clientId =
      getVoiceClientId();

    setBusyAction(
      "accept",
    );

    let accepted =
      false;

    try {
      /*
       * 1. Claim/accept no provider.
       *
       * O mesmo clientId obrigatoriamente
       * sera usado na negociacao WebRTC.
       */
      await requestCallAction(
        callId,
        "accept",
        clientId,
      );

      accepted =
        true;

      updateState(
        "connecting",
      );

      setBusyAction(
        "webrtc",
      );

      /*
       * 2. Captura microfone, cria DataChannel PCM,
       * gera SDP offer e troca SDP pelo backend
       * do Zenith Calls.
       */
      const connection =
        await openWaCallsVoiceCall(
          callId,
          clientId,
          null,
        );

      connectionRef.current =
        connection;

      /*
       * 3. Reproducao do audio recebido
       * do DataChannel PCM.
       */
      if (
        audioRef.current
      ) {
        audioRef.current
          .srcObject =
          connection.remoteStream;

        try {
          await audioRef.current
            .play();
        } catch {
          /*
           * O elemento possui autoPlay.
           * Alguns browsers podem resolver
           * a reproducao pelo proprio evento
           * de MediaStream mesmo que play()
           * retorne NotAllowedError.
           */
        }
      }

      updateState(
        "active",
      );

      toast.success(
        "Chamada atendida.",
      );
    } catch (error) {
      connectionRef.current
        ?.close();

      connectionRef.current =
        null;

      /*
       * Caso o provider tenha aceitado,
       * mas a negociacao WebRTC tenha
       * falhado, encerramos a chamada
       * para nao deixar sessao presa.
       */
      if (accepted) {
        try {
          await requestCallAction(
            callId,
            "hangup",
            clientId,
          );
        } catch {}
      }

      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao atender chamada.",
      );
    } finally {
      setBusyAction(
        null,
      );
    }
  }

  async function rejectCall() {
    if (
      busyAction
    ) {
      return;
    }

    const clientId =
      getVoiceClientId();

    setBusyAction(
      "reject",
    );

    try {
      await requestCallAction(
        callId,
        "reject",
        clientId,
      );

      updateState(
        "rejected",
      );

      toast.success(
        "Chamada rejeitada.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao rejeitar chamada.",
      );
    } finally {
      setBusyAction(
        null,
      );
    }
  }

  async function hangupCall() {
    if (
      busyAction
    ) {
      return;
    }

    const clientId =
      getVoiceClientId();

    setBusyAction(
      "hangup",
    );

    try {
      await requestCallAction(
        callId,
        "hangup",
        clientId,
      );

      connectionRef.current
        ?.close();

      connectionRef.current =
        null;

      if (
        audioRef.current
      ) {
        audioRef.current
          .srcObject =
          null;
      }

      updateState(
        "ended",
      );

      toast.success(
        "Chamada encerrada.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao encerrar chamada.",
      );
    } finally {
      setBusyAction(
        null,
      );
    }
  }

  function toggleMute() {
    const connection =
      connectionRef.current;

    if (!connection) {
      return;
    }

    const nextMuted =
      !muted;

    connection.micStream
      .getAudioTracks()
      .forEach(
        (track) => {
          track.enabled =
            !nextMuted;
        },
      );

    setMuted(
      nextMuted,
    );
  }

  const displayNumber =
    direction ===
      "inbound"
      ? contactPhone ||
        fromPhone
      : toPhone;

  const formattedNumber =
    formatVoicePhone(
      displayNumber,
    );

  const displayContactName =
    contactName?.trim() ?? "";

  const canAnswer =
    direction ===
      "inbound" &&
    (
      localState ===
        "ringing" ||
      localState ===
        "connecting"
    );

  const canReject =
    direction ===
      "inbound" &&
    (
      localState ===
        "ringing" ||
      localState ===
        "connecting"
    );

  const canHangup =
    localState ===
      "connecting" ||
    localState ===
      "active";

  const callIsActive =
    Boolean(
      connectionRef.current,
    ) &&
    localState ===
      "active";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        className="hidden"
      />

      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <PhoneCall className="size-5" />
        </div>

        <div className="min-w-0">
          {displayContactName ? (
            <>
              <p className="truncate text-sm font-medium">
                {displayContactName}
              </p>

              <p className="truncate text-xs text-muted-foreground">
                {formattedNumber ||
                  "Número indisponível"}
              </p>
            </>
          ) : (
            <p className="truncate text-sm font-medium">
              {formattedNumber ||
                "Chamada de voz"}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            {direction ===
              "inbound"
              ? "Entrada"
              : "Saída"}
            {" · "}
            {localState}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canAnswer && (
          <Button
            type="button"
            size="sm"
            disabled={
              Boolean(
                busyAction,
              )
            }
            onClick={() =>
              void acceptCall()
            }
          >
            {busyAction ===
              "accept" ||
            busyAction ===
              "webrtc" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <PhoneCall className="mr-2 size-4" />
            )}

            {busyAction ===
            "webrtc"
              ? "Conectando..."
              : "Atender"}
          </Button>
        )}

        {canReject && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              Boolean(
                busyAction,
              )
            }
            onClick={() =>
              void rejectCall()
            }
          >
            {busyAction ===
            "reject" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <X className="mr-2 size-4" />
            )}

            Rejeitar
          </Button>
        )}

        {canHangup && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={
              Boolean(
                busyAction,
              )
            }
            onClick={() =>
              void hangupCall()
            }
          >
            {busyAction ===
            "hangup" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <PhoneOff className="mr-2 size-4" />
            )}

            Encerrar
          </Button>
        )}

        {callIsActive && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={
              toggleMute
            }
          >
            {muted ? (
              <MicOff className="mr-2 size-4" />
            ) : (
              <Mic className="mr-2 size-4" />
            )}

            {muted
              ? "Ativar microfone"
              : "Silenciar"}
          </Button>
        )}
      </div>
    </div>
  );
}