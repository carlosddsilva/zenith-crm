const KEY =
  "zenith.voice.clientId";

const generate = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }

  return (
    "zenith-" +
    Math.random()
      .toString(36)
      .slice(2) +
    Date.now()
      .toString(36)
  );
};

export const getVoiceClientId =
  (): string => {
    let id =
      localStorage.getItem(
        KEY,
      );

    if (!id) {
      id =
        generate();

      localStorage.setItem(
        KEY,
        id,
      );
    }

    return id;
  };