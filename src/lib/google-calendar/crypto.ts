import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const PREFIX = 'gcal:v1';

function key() {
  const raw =
    process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY ?? process.env.ENCRYPTION_KEY;
  if (!raw || !/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error('GOOGLE_CALENDAR_ENCRYPTION_KEY must be a 32-byte hex key');
  }
  return Buffer.from(raw, 'hex');
}

export function encryptGoogleSecret(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [
    PREFIX,
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join(':');
}

export function decryptGoogleSecret(value: string) {
  const [namespace, version, ivRaw, ciphertextRaw, tagRaw] = value.split(':');
  if (
    `${namespace}:${version}` !== PREFIX ||
    !ivRaw ||
    !ciphertextRaw ||
    !tagRaw
  ) {
    throw new Error('Unsupported Google Calendar credential format');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(ivRaw, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function sha256Base64Url(value: string) {
  return createHash('sha256').update(value).digest('base64url');
}

export function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
