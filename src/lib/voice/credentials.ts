import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

type VoiceCredentials =
  Record<string, string>;

function getKey() {
  const encoded =
    process.env
      .VOICE_CREDENTIALS_KEY;

  if (!encoded) {
    throw new Error(
      "VOICE_CREDENTIALS_KEY is not configured",
    );
  }

  const key =
    Buffer.from(
      encoded,
      "base64",
    );

  if (key.length !== 32) {
    throw new Error(
      "VOICE_CREDENTIALS_KEY must decode to exactly 32 bytes",
    );
  }

  return key;
}

export function encryptVoiceCredentials(
  credentials:
    VoiceCredentials,
) {
  const key =
    getKey();

  const iv =
    randomBytes(12);

  const cipher =
    createCipheriv(
      "aes-256-gcm",
      key,
      iv,
    );

  const plaintext =
    Buffer.from(
      JSON.stringify(
        credentials,
      ),
      "utf8",
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        plaintext,
      ),
      cipher.final(),
    ]);

  const tag =
    cipher.getAuthTag();

  return [
    "v1",
    iv.toString(
      "base64url",
    ),
    tag.toString(
      "base64url",
    ),
    encrypted.toString(
      "base64url",
    ),
  ].join(".");
}

export function decryptVoiceCredentials(
  value:
    string | null | undefined,
): VoiceCredentials {
  if (!value) {
    return {};
  }

  const parts =
    value.split(".");

  if (
    parts.length !== 4 ||
    parts[0] !== "v1"
  ) {
    throw new Error(
      "Unsupported voice credentials format",
    );
  }

  const key =
    getKey();

  const iv =
    Buffer.from(
      parts[1],
      "base64url",
    );

  const tag =
    Buffer.from(
      parts[2],
      "base64url",
    );

  const encrypted =
    Buffer.from(
      parts[3],
      "base64url",
    );

  const decipher =
    createDecipheriv(
      "aes-256-gcm",
      key,
      iv,
    );

  decipher.setAuthTag(
    tag,
  );

  const decrypted =
    Buffer.concat([
      decipher.update(
        encrypted,
      ),
      decipher.final(),
    ]);

  return JSON.parse(
    decrypted.toString(
      "utf8",
    ),
  ) as VoiceCredentials;
}
