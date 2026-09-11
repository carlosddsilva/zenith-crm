import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { automationEventsOutbox } from '@/lib/db/schema';
import { redis } from '@/lib/redis';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('x-zenith-worker-token');
    const workerSecret = process.env.ZENITH_WORKER_SECRET || 'dev-secret';

    if (!authHeader || authHeader.length !== workerSecret.length || !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(workerSecret))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch pending outbox events (limit 100 to avoid overloading memory)
    const pendingEvents = await db
      .select()
      .from(automationEventsOutbox)
      .where(eq(automationEventsOutbox.status, 'pending'))
      .limit(100);

    let pushedCount = 0;
    let failedCount = 0;

    for (const eventRow of pendingEvents) {
      try {
        const payloadObj = typeof eventRow.payload === 'object' && eventRow.payload !== null ? eventRow.payload : {};
        const payloadWithAttempts = { ...payloadObj, attempts: 0 };
        // Push to main queue
        await redis.lpush('zenith:automation:events', JSON.stringify(payloadWithAttempts));
        
        // Mark as processed
        await db.update(automationEventsOutbox)
          .set({ status: 'processed', processedAt: sql`now()` })
          .where(eq(automationEventsOutbox.id, eventRow.id));
          
        pushedCount++;
      } catch (e) {
        console.error(`[OutboxSweep] Failed to sweep event ${eventRow.eventId} to Redis:`, e);
        failedCount++;
        // If Redis is down, we abort the sweep for now
        break; 
      }
    }

    return NextResponse.json({ success: true, pushedCount, failedCount });
  } catch (error) {
    console.error('[OutboxSweep] Error during outbox sweep:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
