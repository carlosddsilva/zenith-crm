const APP_BASE_URL =
  normalizeBaseUrl(
    process.env.VOICE_WORKER_APP_URL ??
      "http://127.0.0.1:3000",
  );

const VOICE_WEBHOOK_TOKEN =
  process.env.VOICE_WEBHOOK_TOKEN ?? "";

const DISCOVERY_INTERVAL_MS =
  parsePositiveInteger(
    process.env
      .VOICE_WORKER_DISCOVERY_INTERVAL_MS,
    30000,
  );

const RECONNECT_MIN_MS =
  2000;

const RECONNECT_MAX_MS =
  30000;

const listeners =
  new Map();

/*
 * Cache limitado aos registros que ainda
 * aparecem no history do WaCalls.
 *
 * Impede reenviar os mesmos call-ended em
 * todo ciclo de discovery.
 */
const reconciledHistoryCalls =
  new Map();

const shutdownController =
  new AbortController();

function normalizeBaseUrl(
  value,
) {
  return String(value)
    .trim()
    .replace(/\/+$/, "");
}

function parsePositiveInteger(
  value,
  fallback,
) {
  const parsed =
    Number.parseInt(
      value ?? "",
      10,
    );

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return parsed;
}

function wait(
  milliseconds,
  signal,
) {
  return new Promise(
    (resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }

      const timer =
        setTimeout(
          resolve,
          milliseconds,
        );

      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(
              timer,
            );

            resolve();
          },
          {
            once:
              true,
          },
        );
      }
    },
  );
}

async function discoverChannels() {
  const response =
    await fetch(
      `${APP_BASE_URL}/api/internal/voice/wacalls/channels`,
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/json",

          "x-zenith-webhook-token":
            VOICE_WEBHOOK_TOKEN,
        },

        signal:
          AbortSignal.timeout(
            15000,
          ),
      },
    );

  if (!response.ok) {
    throw new Error(
      `Channel discovery failed: HTTP ${response.status}`,
    );
  }

  const payload =
    await response.json();

  if (
    !payload ||
    payload.ok !== true ||
    !Array.isArray(
      payload.channels,
    )
  ) {
    throw new Error(
      "Invalid channel discovery response",
    );
  }

  return payload.channels;
}

function groupChannels(
  channels,
) {
  const groups =
    new Map();

  for (
    const channel of
      channels
  ) {
    const channelId =
      typeof channel.channelId ===
        "string"
        ? channel.channelId.trim()
        : "";

    const baseUrl =
      typeof channel.baseUrl ===
        "string"
        ? normalizeBaseUrl(
            channel.baseUrl,
          )
        : "";

    const sessionId =
      typeof channel.sessionId ===
        "string"
        ? channel.sessionId.trim()
        : "";

    const apiKey =
      typeof channel.apiKey ===
        "string"
        ? channel.apiKey.trim()
        : "";

    if (
      !channelId ||
      !baseUrl ||
      !sessionId
    ) {
      console.warn(
        "[voice-worker] Ignoring invalid WaCalls channel",
        {
          channelId:
            channelId || null,

          hasBaseUrl:
            Boolean(baseUrl),

          hasSessionId:
            Boolean(sessionId),

          hasApiKey:
            Boolean(apiKey),
        },
      );

      continue;
    }

    /*
     * Uma conexao SSE por Gateway.
     *
     * Quando configurada, a chave fica somente
     * na memoria e nunca deve ser escrita em log.
     */
    const key =
      `${baseUrl}\u0000${apiKey}`;

    let group =
      groups.get(
        key,
      );

    if (!group) {
      group = {
        key,
        baseUrl,
        apiKey,
        channels:
          [],
      };

      groups.set(
        key,
        group,
      );
    }

    group.channels.push({
      channelId,
      sessionId,
    });
  }

  return groups;
}

function parseEventBlock(
  block,
) {
  const dataLines =
    block
      .split("\n")
      .filter(
        (line) =>
          line.startsWith(
            "data:",
          ),
      )
      .map(
        (line) =>
          line
            .slice(5)
            .trimStart(),
      );

  if (
    dataLines.length === 0
  ) {
    return null;
  }

  const data =
    dataLines.join(
      "\n",
    );

  if (!data.trim()) {
    return null;
  }

  try {
    return JSON.parse(
      data,
    );
  } catch {
    console.warn(
      "[voice-worker] Invalid JSON event received",
    );

    return null;
  }
}

function getEventType(
  event,
) {
  if (
    !event ||
    typeof event !==
      "object" ||
    Array.isArray(
      event,
    )
  ) {
    return "unknown";
  }

  if (
    typeof event.type ===
      "string"
  ) {
    return event.type;
  }

  if (
    typeof event.event ===
      "string"
  ) {
    return event.event;
  }

  return "unknown";
}

function resolveEventChannel(
  event,
  group,
) {
  const eventSessionId =
    typeof event.sessionId ===
      "string"
      ? event.sessionId.trim()
      : "";

  if (eventSessionId) {
    const channel =
      group.channels.find(
        (candidate) =>
          candidate.sessionId ===
          eventSessionId,
      );

    if (!channel) {
      console.warn(
        "[voice-worker] Event session does not match any configured channel",
        {
          gateway:
            group.baseUrl,

          sessionId:
            eventSessionId,
        },
      );

      return null;
    }

    return channel;
  }

  /*
   * Sem sessionId so existe fallback seguro
   * quando este Gateway possui exatamente
   * um canal configurado.
   *
   * Com multiplos canais nunca adivinhamos
   * o tenant/session de destino.
   */
  if (
    group.channels.length ===
    1
  ) {
    return group.channels[0];
  }

  console.warn(
    "[voice-worker] Ambiguous voice event without sessionId",
    {
      gateway:
        group.baseUrl,

      channels:
        group.channels.length,

      eventType:
        getEventType(
          event,
        ),
    },
  );

  return null;
}

async function forwardVoiceEvent(
  event,
  group,
) {
  const eventType =
    getEventType(
      event,
    );

  const supportedEvent =
    eventType ===
      "incoming" ||
    eventType ===
      "call.incoming" ||
    eventType ===
      "call-status" ||
    eventType ===
      "call-ended" ||
    eventType ===
      "playback.completed" ||
    eventType ===
      "playback.failed" ||
    eventType ===
      "playback.stopped";

  if (!supportedEvent) {
    return false;
  }

  const channel =
    resolveEventChannel(
      event,
      group,
    );

  if (!channel) {
    return false;
  }

  /*
   * Canonicalizamos o sessionId.
   *
   * Isso tambem cobre o caso de Gateway
   * com somente um canal onde o evento
   * SSE nao incluiu sessionId.
   */
  const payload = {
    ...event,

    sessionId:
      channel.sessionId,
  };

  const response =
    await fetch(
      `${APP_BASE_URL}/api/webhooks/zenith/voice/wacalls/${encodeURIComponent(
        channel.channelId,
      )}`,
      {
        method:
          "POST",

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",

          "x-zenith-webhook-token":
            VOICE_WEBHOOK_TOKEN,
        },

        body:
          JSON.stringify(
            payload,
          ),

        signal:
          AbortSignal.timeout(
            15000,
          ),
      },
    );

  if (!response.ok) {
    const responseBody =
      await response
        .text()
        .catch(
          () => "",
        );

    console.error(
      "[voice-worker] Voice event forwarding failed",
      {
        gateway:
          group.baseUrl,

        channelId:
          channel.channelId,

        sessionId:
          channel.sessionId,

        eventType,

        status:
          response.status,

        response:
          responseBody.slice(
            0,
            500,
          ),
      },
    );

    return false;
  }

  console.log(
    "[voice-worker] Voice event forwarded",
    {
      gateway:
        group.baseUrl,

      channelId:
        channel.channelId,

      sessionId:
        channel.sessionId,

      eventType,
    },
  );

  return true;
}

async function consumeSse(
  body,
  group,
  signal,
) {
  const decoder =
    new TextDecoder();

  let buffer =
    "";

  for await (
    const chunk of
      body
  ) {
    if (signal.aborted) {
      return;
    }

    buffer +=
      decoder.decode(
        chunk,
        {
          stream:
            true,
        },
      );

    /*
     * Normaliza CRLF/CR para facilitar
     * separacao dos blocos SSE.
     */
    buffer =
      buffer
        .replace(
          /\r\n/g,
          "\n",
        )
        .replace(
          /\r/g,
          "\n",
        );

    let separatorIndex =
      buffer.indexOf(
        "\n\n",
      );

    while (
      separatorIndex !==
      -1
    ) {
      const block =
        buffer.slice(
          0,
          separatorIndex,
        );

      buffer =
        buffer.slice(
          separatorIndex +
            2,
        );

      const event =
        parseEventBlock(
          block,
        );

      if (event) {
        const eventType =
          getEventType(
            event,
          );

        console.log(
          "[voice-worker] SSE event",
          {
            gateway:
              group.baseUrl,

            type:
              eventType,
          },
        );

        try {
          await forwardVoiceEvent(
            event,
            group,
          );
        } catch (error) {
          console.error(
            "[voice-worker] Event processing failed",
            {
              gateway:
                group.baseUrl,

              type:
                eventType,

              error:
                error instanceof
                Error
                  ? error.message
                  : String(
                      error,
                    ),
            },
          );
        }
      }

      separatorIndex =
        buffer.indexOf(
          "\n\n",
        );
    }
  }
}

async function runGatewayListener(
  entry,
) {
  let reconnectDelay =
    RECONNECT_MIN_MS;

  while (
    !entry.controller
      .signal.aborted
  ) {
    const group =
      entry.group;

    try {
      const response =
        await fetch(
          `${group.baseUrl}/api/events`,
          {
            method:
              "GET",

            headers: {
              Accept:
                "text/event-stream",

              "Cache-Control":
                "no-cache",

              ...(group.apiKey
                ? {
                    "X-API-Key":
                      group.apiKey,
                  }
                : {}),
            },

            signal:
              entry.controller
                .signal,
          },
        );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`,
        );
      }

      if (!response.body) {
        throw new Error(
          "SSE response has no body",
        );
      }

      console.log(
        "[voice-worker] SSE connected",
        {
          gateway:
            group.baseUrl,

          channels:
            group.channels
              .length,

          sessions:
            group.channels.map(
              (channel) =>
                channel.sessionId,
            ),
        },
      );

      reconnectDelay =
        RECONNECT_MIN_MS;

      await consumeSse(
        response.body,
        group,
        entry.controller
          .signal,
      );

      if (
        !entry.controller
          .signal.aborted
      ) {
        throw new Error(
          "SSE connection closed",
        );
      }
    } catch (error) {
      if (
        entry.controller
          .signal.aborted
      ) {
        break;
      }

      console.error(
        "[voice-worker] SSE connection failed",
        {
          gateway:
            group.baseUrl,

          error:
            error instanceof
            Error
              ? error.message
              : String(
                  error,
                ),

          retryInMs:
            reconnectDelay,
        },
      );

      await wait(
        reconnectDelay,
        entry.controller
          .signal,
      );

      reconnectDelay =
        Math.min(
          reconnectDelay *
            2,
          RECONNECT_MAX_MS,
        );
    }
  }

  console.log(
    "[voice-worker] SSE listener stopped",
    {
      gateway:
        entry.group
          .baseUrl,
    },
  );
}

function reconciliationCacheKey(
  group,
  channel,
) {
  return `${group.baseUrl}\u0000${channel.sessionId}`;
}

async function fetchWaCallsHistory(
  group,
  channel,
) {
  const headers = {
    Accept:
      "application/json",
  };

  /*
   * WaCalls upstream atualmente nao exige
   * autenticacao. Mantemos compatibilidade
   * caso um gateway futuro use API key.
   */
  if (group.apiKey) {
    headers["X-API-Key"] =
      group.apiKey;
  }

  const response =
    await fetch(
      `${group.baseUrl}/api/sessions/${encodeURIComponent(
        channel.sessionId,
      )}/history?limit=50`,
      {
        method:
          "GET",

        headers,

        signal:
          AbortSignal.timeout(
            15000,
          ),
      },
    );

  if (!response.ok) {
    throw new Error(
      `History HTTP ${response.status}`,
    );
  }

  const body =
    await response.json();

  return Array.isArray(
    body?.rows,
  )
    ? body.rows
    : [];
}

async function reconcileChannelHistory(
  group,
  channel,
) {
  const rows =
    await fetchWaCallsHistory(
      group,
      channel,
    );

  const cacheKey =
    reconciliationCacheKey(
      group,
      channel,
    );

  let seen =
    reconciledHistoryCalls.get(
      cacheKey,
    );

  if (!seen) {
    seen =
      new Set();

    reconciledHistoryCalls.set(
      cacheKey,
      seen,
    );
  }

  /*
   * O history oficial retorna somente uma
   * janela limitada. Mantemos no cache apenas
   * os callIds ainda presentes nessa janela,
   * evitando crescimento ilimitado.
   */
  const currentHistoryCallIds =
    new Set();

  for (const row of rows) {
    const callId =
      typeof row?.callId ===
        "string"
        ? row.callId.trim()
        : "";

    if (callId) {
      currentHistoryCallIds.add(
        callId,
      );
    }

    /*
     * Neste momento o webhook lifecycle
     * existente esta implementado para inbound.
     * Nao tentamos reconciliar outbound aqui.
     */
    if (
      row?.direction !==
        "inbound" ||
      row?.status !==
        "ended" ||
      !callId
    ) {
      continue;
    }

    const endedAt =
      Number(
        row?.endedAt,
      );

    if (
      !Number.isFinite(
        endedAt,
      ) ||
      endedAt <= 0
    ) {
      continue;
    }

    if (
      seen.has(
        callId,
      )
    ) {
      continue;
    }

    const reason =
      typeof row?.endReason ===
        "string"
        ? row.endReason.trim()
        : "";

    const reconciledEvent = {
      type:
        "call-ended",

      sessionId:
        channel.sessionId,

      id:
        callId,

      endedAt,

      reason,

      reconciliationSource:
        "wacalls-history",
    };

    const forwarded =
      await forwardVoiceEvent(
        reconciledEvent,
        group,
      );

    /*
     * So marcamos como reconciliado depois
     * que o webhook Zenith respondeu sucesso.
     * Em falha HTTP o proximo ciclo tenta
     * novamente.
     */
    if (forwarded) {
      seen.add(
        callId,
      );

      console.log(
        "[voice-worker] History call reconciled",
        {
          gateway:
            group.baseUrl,

          channelId:
            channel.channelId,

          sessionId:
            channel.sessionId,

          callId,

          endedAt,

          reason:
            reason || null,
        },
      );
    }
  }

  for (
    const callId
    of Array.from(
      seen,
    )
  ) {
    if (
      !currentHistoryCallIds.has(
        callId,
      )
    ) {
      seen.delete(
        callId,
      );
    }
  }
}

async function reconcileGatewayHistories(
  groups,
) {
  for (
    const group
    of groups.values()
  ) {
    for (
      const channel
      of group.channels
    ) {
      try {
        await reconcileChannelHistory(
          group,
          channel,
        );
      } catch (error) {
        console.error(
          "[voice-worker] History reconciliation failed",
          {
            gateway:
              group.baseUrl,

            channelId:
              channel.channelId,

            sessionId:
              channel.sessionId,

            error:
              error instanceof Error
                ? error.message
                : String(
                    error,
                  ),
          },
        );
      }
    }
  }
}

function reconcileListeners(
  groups,
) {
  for (
    const [
      key,
      entry,
    ] of listeners
  ) {
    if (
      groups.has(
        key,
      )
    ) {
      entry.group =
        groups.get(
          key,
        );

      continue;
    }

    entry.controller.abort();

    listeners.delete(
      key,
    );
  }

  for (
    const [
      key,
      group,
    ] of groups
  ) {
    if (
      listeners.has(
        key,
      )
    ) {
      continue;
    }

    const entry = {
      group,
      controller:
        new AbortController(),
      task:
        null,
    };

    entry.task =
      runGatewayListener(
        entry,
      );

    listeners.set(
      key,
      entry,
    );
  }
}

async function stopAllListeners() {
  const tasks =
    [];

  for (
    const entry of
      listeners.values()
  ) {
    entry.controller.abort();

    if (entry.task) {
      tasks.push(
        entry.task,
      );
    }
  }

  listeners.clear();

  await Promise.allSettled(
    tasks,
  );
}

async function main() {
  if (!VOICE_WEBHOOK_TOKEN) {
    throw new Error(
      "VOICE_WEBHOOK_TOKEN is required",
    );
  }

  console.log(
    "[voice-worker] Starting",
    {
      appBaseUrl:
        APP_BASE_URL,

      discoveryIntervalMs:
        DISCOVERY_INTERVAL_MS,
    },
  );

  while (
    !shutdownController
      .signal.aborted
  ) {
    try {
      const channels =
        await discoverChannels();

      const groups =
        groupChannels(
          channels,
        );

      reconcileListeners(
        groups,
      );

      await reconcileGatewayHistories(
        groups,
      );

      console.log(
        "[voice-worker] Discovery complete",
        {
          channels:
            channels.length,

          gateways:
            groups.size,
        },
      );
    } catch (error) {
      if (
        !shutdownController
          .signal.aborted
      ) {
        console.error(
          "[voice-worker] Discovery failed",
          error instanceof
          Error
            ? error.message
            : String(
                error,
              ),
        );
      }
    }

    await wait(
      DISCOVERY_INTERVAL_MS,
      shutdownController
        .signal,
    );
  }

  await stopAllListeners();
}

function shutdown(
  signalName,
) {
  console.log(
    `[voice-worker] ${signalName} received`,
  );

  shutdownController.abort();
}

process.once(
  "SIGINT",
  () =>
    shutdown(
      "SIGINT",
    ),
);

process.once(
  "SIGTERM",
  () =>
    shutdown(
      "SIGTERM",
    ),
);

main().catch(
  (error) => {
    console.error(
      "[voice-worker] Fatal error",
      error,
    );

    process.exitCode =
      1;
  },
);





