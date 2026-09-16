import { describe, it, expect, vi } from 'vitest';
import { GET } from './route';
import { db } from '@/lib/db/client';

vi.mock('@/lib/db/client', () => ({
  db: {
    execute: vi.fn(),
  },
}));

vi.mock('@/lib/auth/zenith-account', () => ({
  requireZenithRole: vi.fn().mockResolvedValue({ accountId: 'acc-1', userId: 'user-1' }),
}));

describe('GET /api/zenith/timeline', () => {
  it('returns timeline items', async () => {
    (db.execute as any).mockResolvedValue([
      { id: '1', type: 'message', title: 'Hello', status: 'sent', occurred_at: new Date() },
      { id: '2', type: 'call', title: 'inbound', status: 'completed', occurred_at: new Date() }
    ]);

    const req = new Request('http://localhost/api/zenith/timeline?contactId=contact-1');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].type).toBe('message');
    expect(body[1].type).toBe('call');
  });

  it('requires contactId or dealId', async () => {
    const req = new Request('http://localhost/api/zenith/timeline');
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('is required');
  });
});
