import { describe, expect, it } from 'vitest';

import { oauthStateMatches } from './oauth';

describe('Google Calendar OAuth state binding', () => {
  const state = {
    accountId: 'account-a',
    userId: 'user-a',
    sessionId: 'session-a',
    expiresAt: new Date('2030-01-01T00:10:00Z'),
    consumedAt: null,
  };
  const expected = {
    accountId: 'account-a',
    userId: 'user-a',
    sessionId: 'session-a',
  };

  it('accepts only the same tenant, user and session', () => {
    expect(
      oauthStateMatches(state, expected, new Date('2030-01-01T00:00:00Z'))
    ).toBe(true);
    expect(
      oauthStateMatches(
        state,
        { ...expected, accountId: 'account-b' },
        new Date('2030-01-01T00:00:00Z')
      )
    ).toBe(false);
    expect(
      oauthStateMatches(
        state,
        { ...expected, userId: 'user-b' },
        new Date('2030-01-01T00:00:00Z')
      )
    ).toBe(false);
    expect(
      oauthStateMatches(
        state,
        { ...expected, sessionId: 'session-b' },
        new Date('2030-01-01T00:00:00Z')
      )
    ).toBe(false);
  });

  it('rejects replayed and expired states', () => {
    expect(
      oauthStateMatches(
        { ...state, consumedAt: new Date() },
        expected,
        new Date('2030-01-01T00:00:00Z')
      )
    ).toBe(false);
    expect(
      oauthStateMatches(state, expected, new Date('2030-01-01T00:11:00Z'))
    ).toBe(false);
  });
});
