import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  getIvrCapabilitySupport,
} from "@/lib/ivr/capabilities";
import {
  waCallsIvrRuntime,
} from "@/lib/ivr/runtimes/wacalls";
import {
  validateIvrFlow,
} from "@/lib/ivr/validator";
import type {
  IvrFlowDefinition,
} from "@/lib/ivr/types";
import {
  canTransitionCallState,
  sanitizeCallEndReason,
  sanitizeCallFailureReason,
} from "./call-state";
import {
  voiceCapabilities,
} from "./capabilities";
import {
  waCallsVoiceProvider,
} from "./providers/wacalls";

const providerConfig = {
  provider: "wacalls" as const,
  baseUrl: "http://voice-gateway.test",
  sessionId: "session-a",
  apiKey: null,
};

function node(
  id: string,
  type: IvrFlowDefinition["nodes"][number]["type"],
  data: Record<string, unknown> = {},
) {
  return {
    id,
    type,
    position: {
      x: 0,
      y: 0,
    },
    data,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ZC-12 voice and IVR contracts", () => {
  it("keeps terminal calls terminal and accepts duplicate state delivery", () => {
    expect(
      canTransitionCallState(
        "active",
        "ended",
      ),
    ).toBe(true);
    expect(
      canTransitionCallState(
        "ended",
        "active",
      ),
    ).toBe(false);
    expect(
      canTransitionCallState(
        "ended",
        "ended",
      ),
    ).toBe(true);
  });

  it("maps arbitrary provider reasons to a finite public vocabulary", () => {
    expect(
      sanitizeCallEndReason(
        "secret upstream detail",
      ),
    ).toBe("provider_ended");
    expect(
      sanitizeCallFailureReason(
        "socket failed with token=abc",
      ),
    ).toBe("provider_error");
  });

  it("blocks WaCalls playback while allowing the implemented human handoff", () => {
    expect(
      voiceCapabilities.wacalls
        .serverPlayback,
    ).toBe(false);
    expect(
      getIvrCapabilitySupport(
        "wacalls",
        "audio.play",
      ),
    ).toBe("unsupported");
    expect(
      getIvrCapabilitySupport(
        "wacalls",
        "queue.route",
      ),
    ).toBe("ready");

    const audioFlow: IvrFlowDefinition = {
      nodes: [
        node(
          "start",
          "trigger.inbound",
        ),
        node(
          "audio",
          "audio.play",
          {
            audioUrl:
              "https://media.example.test/menu.wav",
          },
        ),
      ],
      edges: [
        {
          id: "start-audio",
          source: "start",
          target: "audio",
        },
      ],
    };

    const validation =
      validateIvrFlow(
        audioFlow,
        ["wacalls"],
      );

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code:
            "capability_unsupported",
          capability:
            "audio.play",
        }),
      ]),
    );
  });

  it("validates a publishable inbound handoff flow", () => {
    const handoffFlow: IvrFlowDefinition = {
      nodes: [
        node(
          "start",
          "trigger.inbound",
        ),
        node(
          "answer",
          "call.answer",
        ),
        node(
          "handoff",
          "queue.route",
          {
            queueKey: "support",
            timeoutSeconds: 30,
          },
        ),
      ],
      edges: [
        {
          id: "start-answer",
          source: "start",
          target: "answer",
        },
        {
          id: "answer-handoff",
          source: "answer",
          target: "handoff",
        },
      ],
      settings: {
        providers: ["wacalls"],
      },
    };

    expect(
      validateIvrFlow(
        handoffFlow,
        ["wacalls"],
      ).valid,
    ).toBe(true);
  });

  it("fails closed if an old published flow reaches audio playback", async () => {
    const fetchMock =
      vi.fn();
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    await expect(
      waCallsIvrRuntime.executeNode(
        {
          accountId:
            "00000000-0000-4000-8000-000000000001",
          executionId:
            "00000000-0000-4000-8000-000000000002",
          stepSequence: 1,
          callId:
            "00000000-0000-4000-8000-000000000003",
          providerCallId:
            "provider-call",
          clientId:
            "ivr-client",
          providerConfig,
        },
        node(
          "audio",
          "audio.play",
          {
            audioUrl:
              "https://media.example.test/menu.wav",
          },
        ),
      ),
    ).rejects.toMatchObject({
      code:
        "wacalls_playback_unsupported",
      status: 501,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("releases bot ownership through the documented WaCalls endpoint", async () => {
    const fetchMock =
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "ok",
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json",
            },
          },
        ),
      );
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    await waCallsVoiceProvider
      .releaseCall?.(
        {
          providerCallId:
            "provider/call",
          clientId:
            "bot-owner",
        },
        providerConfig,
      );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://voice-gateway.test/api/sessions/session-a/calls/provider%2Fcall/release",
      expect.objectContaining({
        method: "POST",
        headers:
          expect.objectContaining({
            "X-Client-Id":
              "bot-owner",
          }),
      }),
    );
  });
});
