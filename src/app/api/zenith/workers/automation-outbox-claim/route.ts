import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { automationEventsOutbox } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { verifyWorkerRequest } from '@/lib/workers/auth';

export async function POST(req: Request) {
  try {
    const auth = verifyWorkerRequest(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Attempt to claim up to 10 events that are pending or failed and ready for retry
    // using FOR UPDATE SKIP LOCKED
    const limit = 10;
    
    // 5 minutes lease
    const claimedEvents = await db.execute(sql`
      UPDATE automation_events_outbox
      SET status = 'processing',
          locked_at = NOW(),
          lease_expires_at = NOW() + INTERVAL '5 minutes'
      WHERE id IN (
        SELECT id
        FROM automation_events_outbox
        WHERE (status = 'pending' OR status = 'failed')
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
        ORDER BY created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);

    // Drizzle execute returns rows in .rows for Postgres
    const events = ((claimedEvents as any).rows || claimedEvents || []).map((row: any) => ({
      ...row,
      // map snake_case to camelCase since it's raw SQL
      accountId: row.account_id,
      eventId: row.event_id,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      correlationId: row.correlation_id,
      causationId: row.causation_id,
      lockedAt: row.locked_at,
      leaseExpiresAt: row.lease_expires_at,
      nextAttemptAt: row.next_attempt_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      processedAt: row.processed_at,
    }));

    return NextResponse.json({ success: true, events });
  } catch (error) {
    console.error('[OutboxClaim] Error during outbox claim.', {
      errorCode: error instanceof Error ? error.name : 'unknown_error',
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
