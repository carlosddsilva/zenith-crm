import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SQL } from 'drizzle-orm';

const mocks = vi.hoisted(() => {
  const selectResults: unknown[] = [];
  const insertResults: unknown[] = [];
  const updateResults: unknown[] = [];
  const whereClauses: unknown[] = [];

  function createBuilder(result: unknown) {
    const promise = Promise.resolve(result);
    const builder: Record<string, unknown> = {};

    builder.from = vi.fn(() => builder);
    builder.leftJoin = vi.fn(() => builder);
    builder.where = vi.fn((clause: unknown) => {
      whereClauses.push(clause);
      return builder;
    });
    builder.orderBy = vi.fn(() => builder);
    builder.limit = vi.fn(() => promise);
    builder.set = vi.fn(() => builder);
    builder.values = vi.fn(() => builder);
    builder.returning = vi.fn(() => promise);
    builder.then = promise.then.bind(promise);

    return builder;
  }

  return {
    selectResults,
    insertResults,
    updateResults,
    whereClauses,
    requireZenithRole: vi.fn(),
    db: {
      select: vi.fn(() => createBuilder(selectResults.shift() ?? [])),
      insert: vi.fn(() => createBuilder(insertResults.shift() ?? [])),
      update: vi.fn(() => createBuilder(updateResults.shift() ?? [])),
      delete: vi.fn(() => createBuilder([])),
    },
  };
});

vi.mock('@/lib/db/client', () => ({ db: mocks.db }));
vi.mock('@/lib/auth/zenith-account', () => ({
  requireZenithRole: mocks.requireZenithRole,
}));

import { DELETE, GET, PATCH } from './[id]/route';
import { GET as GET_HISTORY } from './[id]/history/route';
import { POST as PUBLISH } from './[id]/publish/route';

const accountId = '20000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000001';
const sequenceId = '30000000-0000-4000-8000-000000000001';

function routeContext(id = sequenceId) {
  return { params: Promise.resolve({ id }) };
}

function compiledWhere(index: number) {
  return new PgDialect().sqlToQuery(mocks.whereClauses[index] as SQL);
}

describe('follow-up route handlers', () => {
  beforeEach(() => {
    mocks.selectResults.length = 0;
    mocks.insertResults.length = 0;
    mocks.updateResults.length = 0;
    mocks.whereClauses.length = 0;
    vi.clearAllMocks();
    mocks.requireZenithRole.mockResolvedValue({ accountId, userId });
  });

  it('awaits dynamic params and scopes GET by sequence and tenant', async () => {
    mocks.selectResults.push([{ id: sequenceId, accountId, name: 'Sequence' }]);

    const response = await GET(
      new Request(`http://localhost/api/zenith/followups/${sequenceId}`),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: sequenceId, accountId });
    expect(mocks.requireZenithRole).toHaveBeenCalledWith('agent');

    const where = compiledWhere(0);
    expect(where.sql).toContain('"followup_sequences"."id"');
    expect(where.sql).toContain('"followup_sequences"."account_id"');
    expect(where.params).toEqual([sequenceId, accountId]);
  });

  it('returns 404 and does not mutate for an id outside the authenticated tenant', async () => {
    mocks.selectResults.push([]);

    const response = await PATCH(
      new Request(`http://localhost/api/zenith/followups/${sequenceId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Must not update' }),
      }),
      routeContext(),
    );

    expect(response.status).toBe(404);
    expect(mocks.db.update).not.toHaveBeenCalled();
    const where = compiledWhere(0);
    expect(where.params).toEqual([sequenceId, accountId]);
  });

  it('preserves authorization and rejects a forbidden caller before querying', async () => {
    mocks.requireZenithRole.mockRejectedValue(
      Object.assign(new Error('forbidden'), { status: 403 }),
    );

    const response = await DELETE(
      new Request(`http://localhost/api/zenith/followups/${sequenceId}`, {
        method: 'DELETE',
      }),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(mocks.requireZenithRole).toHaveBeenCalledWith('admin');
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.db.delete).not.toHaveBeenCalled();
  });

  it('keeps tenant scope on PATCH and DELETE mutations', async () => {
    const sequence = { id: sequenceId, accountId, status: 'draft' };
    mocks.selectResults.push([sequence]);
    mocks.updateResults.push([{ ...sequence, name: 'Updated' }]);

    const patchResponse = await PATCH(
      new Request(`http://localhost/api/zenith/followups/${sequenceId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      }),
      routeContext(),
    );
    expect(patchResponse.status).toBe(200);
    expect(compiledWhere(1).params).toEqual([sequenceId, accountId]);

    mocks.selectResults.push([sequence]);
    const deleteResponse = await DELETE(
      new Request(`http://localhost/api/zenith/followups/${sequenceId}`, {
        method: 'DELETE',
      }),
      routeContext(),
    );
    expect(deleteResponse.status).toBe(200);
    expect(compiledWhere(3).params).toEqual([sequenceId, accountId]);
  });

  it('publishes with promised params and tenant-scopes the final update', async () => {
    const sequence = {
      id: sequenceId,
      accountId,
      status: 'draft',
      triggerType: 'contact.created',
      conditions: [],
      steps: [],
      cancelOnReply: true,
      cancelOnDealClosed: true,
      timeZone: 'America/Cuiaba',
      quietHoursStart: null,
      quietHoursEnd: null,
    };
    mocks.selectResults.push([sequence], [{ version: 1 }]);
    mocks.insertResults.push([{ id: 'version-2', version: 2 }]);
    mocks.updateResults.push([{ ...sequence, status: 'active' }]);

    const response = await PUBLISH(
      new Request(`http://localhost/api/zenith/followups/${sequenceId}/publish`, {
        method: 'POST',
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireZenithRole).toHaveBeenCalledWith('admin');
    expect(compiledWhere(2).params).toEqual([sequenceId, accountId]);
  });

  it('loads history with promised params and both tenant predicates', async () => {
    mocks.selectResults.push([]);

    const response = await GET_HISTORY(
      new Request(`http://localhost/api/zenith/followups/${sequenceId}/history`),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(mocks.requireZenithRole).toHaveBeenCalledWith('agent');
    const where = compiledWhere(0);
    expect(where.sql).toContain('"followup_enrollments"."sequence_id"');
    expect(where.sql).toContain('"followup_enrollments"."account_id"');
    expect(where.params).toEqual([sequenceId, accountId]);
  });
});
