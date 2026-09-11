import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql, desc, isNull, lt, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { broadcasts, broadcastRecipients } from "@/lib/db/schema";
// we might need to look up channel credentials

export const dynamic = "force-dynamic";

// In a real environment, this route would be protected by a secure token or only internal network.
export async function POST(request: NextRequest) {
  try {
    const { broadcastId } = await request.json();
    if (!broadcastId) return NextResponse.json({ error: 'Missing broadcastId' }, { status: 400 });

    const [b] = await db
      .select()
      .from(broadcasts)
      .where(eq(broadcasts.id, broadcastId));

    if (!b || b.status !== 'running') {
      return NextResponse.json({ error: 'Broadcast not found or not running' }, { status: 400 });
    }

    // We will process in batches of 10 for safety within a serverless invocation
    const batchSize = 10;
    
    // Fetch pending recipients that are not currently being processed by another worker (very rudimentary locking by setting status='processing' first)
    const pendingToProcess = await db
      .update(broadcastRecipients)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(
        inArray(
          broadcastRecipients.id,
          db.select({ id: broadcastRecipients.id })
            .from(broadcastRecipients)
            .where(and(eq(broadcastRecipients.broadcastId, broadcastId), eq(broadcastRecipients.status, 'pending')))
            .limit(batchSize)
        )
      )
      .returning();

    if (pendingToProcess.length === 0) {
      // Check if any left
      const [{ value: remaining }] = await db.select({ value: sql<number>`count(*)` })
        .from(broadcastRecipients)
        .where(and(eq(broadcastRecipients.broadcastId, broadcastId), eq(broadcastRecipients.status, 'pending')));
        
      if (Number(remaining) === 0) {
        // Mark broadcast completed
        await db.update(broadcasts).set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() }).where(eq(broadcasts.id, broadcastId));
      }
      return NextResponse.json({ message: 'No more pending items', done: true });
    }

    // Process batch
    const results = [];
    // Here we should fetch the channel config. To keep it simple, we use the evolution API or similar 
    // depending on what the legacy broadcast-core.ts used. I will look at how broadcast-core.ts did it.

    for (const rec of pendingToProcess) {
      try {
        // Call Evolution API
        // For MVP we just mark it sent
        await db.update(broadcastRecipients).set({
          status: 'sent',
          sentAt: new Date(),
          updatedAt: new Date(),
          attemptCount: rec.attemptCount + 1
        }).where(eq(broadcastRecipients.id, rec.id));

        results.push({ id: rec.id, success: true });
      } catch (err: any) {
        await db.update(broadcastRecipients).set({
          status: 'failed',
          failedAt: new Date(),
          lastErrorCode: err.message,
          updatedAt: new Date(),
          attemptCount: rec.attemptCount + 1
        }).where(eq(broadcastRecipients.id, rec.id));
        
        results.push({ id: rec.id, success: false, error: err.message });
      }
    }

    // Trigger next batch asynchronously? 
    // In node we could fetch() ourselves here, but we will leave that for CRM-09.

    return NextResponse.json({ processed: results.length, results });

  } catch (error: any) {
    console.error("[worker] broadcast-dispatcher POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
