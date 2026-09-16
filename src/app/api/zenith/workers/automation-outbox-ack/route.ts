import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { automationEventsOutbox } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { verifyWorkerRequest } from '@/lib/workers/auth';

export async function POST(req: Request) {
  try {
    const auth = verifyWorkerRequest(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { id, success, error } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing event ID' }, { status: 400 });
    }

    if (success) {
      await db.update(automationEventsOutbox)
        .set({
          status: 'processed',
          processedAt: sql`now()`,
          lockedAt: null,
          leaseExpiresAt: null,
          lastError: null,
        })
        .where(eq(automationEventsOutbox.id, id));
    } else {
      // Fetch current attempts to calculate backoff
      const [current] = await db
        .select({ attempts: automationEventsOutbox.attempts })
        .from(automationEventsOutbox)
        .where(eq(automationEventsOutbox.id, id))
        .limit(1);

      const attempts = (current?.attempts || 0) + 1;
      
      // Simple exponential backoff: attempts^2 minutes
      // e.g., 1m, 4m, 9m, 16m
      const backoffMinutes = Math.pow(attempts, 2);

      const isFinalFailure = attempts >= 5;

      await db.update(automationEventsOutbox)
        .set({
          status: isFinalFailure ? 'failed' : 'failed', // stays failed but retriable if nextAttemptAt is set
          attempts,
          lastError: error ? String(error).substring(0, 500) : 'Unknown error',
          lockedAt: null,
          leaseExpiresAt: null,
          nextAttemptAt: isFinalFailure ? null : sql`now() + interval '${sql.raw(backoffMinutes.toString())} minutes'`,
        })
        .where(eq(automationEventsOutbox.id, id));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[OutboxAck] Error during outbox ack.', {
      errorCode: error instanceof Error ? error.name : 'unknown_error',
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
