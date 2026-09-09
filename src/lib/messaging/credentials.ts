import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function getKey(): Buffer {
  const raw =
    process.env.MESSAGING_CREDENTIALS_KEY;

  if (!raw) {
    throw new Error(
      "MESSAGING_CREDENTIALS_KEY is not configured",
    );
  }

  const key =
    Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error(
      "MESSAGING_CREDENTIALS_KEY must decode to exactly 32 bytes",
    );
  }

  return key;
}

export function encryptMessagingCredentials(
  credentials: Record<string, string>,
): string {
  const iv = randomBytes(12);

  const cipher =
    createCipheriv(
      ALGORITHM,
      getKey(),
      iv,
    );

  const plaintext =
    JSON.stringify(
      credentials,
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        plaintext,
        "utf8",
      ),
      cipher.final(),
    ]);

  const tag =
    cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptMessagingCredentials(
  payload: string,
): Record<string, string> {
  const [
    version,
    ivValue,
    tagValue,
    encryptedValue,
  ] = payload.split(".");

  if (
    version !== VERSION ||
    !ivValue ||
    !tagValue ||
    !encryptedValue
  ) {
    throw new Error(
      "Invalid encrypted credentials format",
    );
  }

  const decipher =
    createDecipheriv(
      ALGORITHM,
      getKey(),
      Buffer.from(
        ivValue,
        "base64url",
      ),
    );

  decipher.setAuthTag(
    Buffer.from(
      tagValue,
      "base64url",
    ),
  );

  const plaintext =
    Buffer.concat([
      decipher.update(
        Buffer.from(
          encryptedValue,
          "base64url",
        ),
      ),
      decipher.final(),
    ]).toString("utf8");

  const parsed =
    JSON.parse(
      plaintext,
    ) as unknown;

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      "Invalid decrypted credentials payload",
    );
  }

  return parsed as Record<
    string,
    string
  >;
}
