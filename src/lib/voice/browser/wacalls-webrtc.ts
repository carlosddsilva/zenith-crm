import {
  float32ToInt16LE,
  int16LEToFloat32,
} from "./pcm";

import {
  CAPTURE_PROCESSOR_NAME,
  CAPTURE_WORKLET_URL,
  PCM_CHANNEL_LABEL,
  PLAYBACK_PROCESSOR_NAME,
  PLAYBACK_WORKLET_URL,
  SAMPLE_RATE,
} from "./audio";

export type OpenVoiceCall = {
  pc:
    RTCPeerConnection;

  micStream:
    MediaStream;

  remoteStream:
    MediaStream;

  close:
    () => void;
};

interface WebRtcResponse {
  ok?: boolean;
  sdp_answer?: string;
  error?: string;
}

async function waitForIceGathering(
  pc: RTCPeerConnection,
) {
  if (
    pc.iceGatheringState ===
    "complete"
  ) {
    return;
  }

  await new Promise<void>(
    (resolve) => {
      const handleChange =
        () => {
          if (
            pc.iceGatheringState ===
            "complete"
          ) {
            pc.removeEventListener(
              "icegatheringstatechange",
              handleChange,
            );

            resolve();
          }
        };

      pc.addEventListener(
        "icegatheringstatechange",
        handleChange,
      );
    },
  );
}

export async function openWaCallsVoiceCall(
  callId: string,
  clientId: string,
  micDeviceId:
    string | null = null,
): Promise<OpenVoiceCall> {
  let micStream:
    MediaStream | null = null;

  let pc:
    RTCPeerConnection | null =
      null;

  let audioContext:
    AudioContext | null = null;

  let stage =
    "initializing";

  try {
    stage =
      "getUserMedia";

    stage =
      "getUserMedia";

    micStream =
      await navigator.mediaDevices
        .getUserMedia({
          audio:
            micDeviceId
              ? {
                  deviceId: {
                    exact:
                      micDeviceId,
                  },
                }
              : true,
        });

    pc =
      new RTCPeerConnection({
        iceServers: [],
      });

    const dataChannel =
      pc.createDataChannel(
        PCM_CHANNEL_LABEL,
        {
          ordered: true,
        },
      );

    dataChannel.binaryType =
      "arraybuffer";

    audioContext =
      new AudioContext({
        sampleRate:
          SAMPLE_RATE,
      });

    await audioContext
      .audioWorklet
      .addModule(
        CAPTURE_WORKLET_URL,
      );

    await audioContext
      .audioWorklet
      .addModule(
        PLAYBACK_WORKLET_URL,
      );

    await audioContext.resume();

    const micSource =
      audioContext
        .createMediaStreamSource(
          micStream,
        );

    const captureNode =
      new AudioWorkletNode(
        audioContext,
        CAPTURE_PROCESSOR_NAME,
      );

    captureNode.port.onmessage =
      (
        event:
          MessageEvent<Float32Array>,
      ) => {
        if (
          dataChannel.readyState ===
          "open"
        ) {
          dataChannel.send(
            float32ToInt16LE(
              event.data,
            ),
          );
        }
      };

    micSource.connect(
      captureNode,
    );

    /*
     * Mantem o AudioWorklet de captura
     * processando no grafo de audio.
     */
    captureNode.connect(
      audioContext.destination,
    );

    const playbackNode =
      new AudioWorkletNode(
        audioContext,
        PLAYBACK_PROCESSOR_NAME,
      );

    const streamDestination =
      audioContext
        .createMediaStreamDestination();

    playbackNode.connect(
      streamDestination,
    );

    dataChannel.onmessage =
      (
        event:
          MessageEvent<ArrayBuffer>,
      ) => {
        playbackNode.port
          .postMessage(
            int16LEToFloat32(
              event.data,
            ),
          );
      };

    stage =
      "createOffer";

    stage =
      "createOffer";

    const offer =
      await pc.createOffer();

    stage =
      "setLocalDescription";

    stage =
      "setLocalDescription";

    await pc.setLocalDescription(
      offer,
    );

    stage =
      "iceGathering";

    stage =
      "iceGathering";

    await waitForIceGathering(
      pc,
    );

    const localSdp =
      pc.localDescription
        ?.sdp;

    if (!localSdp) {
      throw new Error(
        "Browser nao gerou SDP offer.",
      );
    }

    stage =
      "zenithWebRtcApi";

    stage =
      "zenithWebRtcApi";

    const response =
      await fetch(
        `/api/zenith/calls/${encodeURIComponent(
          callId,
        )}/webrtc`,
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
              sdp_offer:
                localSdp,

              client_id:
                clientId,
            }),
        },
      );

    const payload =
      (await response
        .json()
        .catch(
          () => null,
        )) as
        | WebRtcResponse
        | null;

    if (
      !response.ok
    ) {
      throw new Error(
        payload?.error ??
          `Falha WebRTC HTTP ${response.status}.`,
      );
    }

    const sdpAnswer =
      payload?.sdp_answer;

    if (
      typeof sdpAnswer !==
        "string" ||
      !sdpAnswer.trim()
    ) {
      throw new Error(
        "Zenith Calls nao retornou sdp_answer.",
      );
    }

    stage =
      "setRemoteDescription";

    stage =
      "setRemoteDescription";

    await pc
      .setRemoteDescription({
        type:
          "answer",

        sdp:
          sdpAnswer,
      });

    const finalPc =
      pc;

    const finalMicStream =
      micStream;

    const finalAudioContext =
      audioContext;

    const remoteStream =
      streamDestination.stream;

    return {
      pc:
        finalPc,

      micStream:
        finalMicStream,

      remoteStream,

      close: () => {
        try {
          dataChannel.close();
        } catch {}

        try {
          finalMicStream
            .getTracks()
            .forEach(
              (track) =>
                track.stop(),
            );
        } catch {}

        try {
          void finalAudioContext
            .close();
        } catch {}

        try {
          finalPc.close();
        } catch {}
      },
    };
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      "[zenith-calls][webrtc]",
      {
        callId,
        stage,
        error:
          detail,
      },
    );

    try {
      micStream
        ?.getTracks()
        .forEach(
          (track) =>
            track.stop(),
        );
    } catch {}

    try {
      await audioContext
        ?.close();
    } catch {}

    try {
      pc?.close();
    } catch {}

    throw new Error(
      `WebRTC falhou em ${stage}: ${detail}`,
    );
  }
}