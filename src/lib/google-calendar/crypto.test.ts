import { describe, expect, it } from 'vitest';

import { decryptGoogleSecret, encryptGoogleSecret, sha256Hex } from './crypto';

describe('Google Calendar credential protection', () => {
  it('round-trips credentials without putting plaintext in storage', () => {
    const value = JSON.stringify({
      accessToken: 'access-test',
      refreshToken: 'refresh-test',
    });
    const encrypted = encryptGoogleSecret(value);
    expect(encrypted).not.toContain('refresh-test');
    expect(decryptGoogleSecret(encrypted)).toBe(value);
  });

  it('rejects ciphertext tampering', () => {
    const encrypted = encryptGoogleSecret('secret');
    const parts = encrypted.split(':');
    parts[3] = `${parts[3].slice(0, -1)}A`;
    expect(() => decryptGoogleSecret(parts.join(':'))).toThrow();
  });

  it('hashes channel tokens deterministically without retaining the token', () => {
    expect(sha256Hex('channel-token')).toHaveLength(64);
    expect(sha256Hex('channel-token')).not.toContain('channel-token');
  });
});
