import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { sql } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';

export async function GET(req: Request) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const { searchParams } = new URL(req.url);

    const contactId = searchParams.get('contactId');
    const dealId = searchParams.get('dealId');
    
    if (!contactId && !dealId) {
      return NextResponse.json({ error: 'contactId or dealId is required' }, { status: 400 });
    }

    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // To prevent SQL injection, we use Drizzle's sql template literals correctly.
    // Drizzle will automatically parameterize ${accountId}, etc.
    
    const baseCondition = dealId 
      ? sql`deal_id = ${dealId}`
      : sql`contact_id = ${contactId}`;

    // Note: messages belongs to conversations, which belongs to contacts. 
    // Messages don't have deal_id directly.
    // If querying by dealId, we don't return messages, or we would need to join conversations.
    // For now, if contactId is provided, we join conversations for messages.

    const messageQuery = contactId ? sql`
      SELECT 
        m.id, 
        'message' as type, 
        m.created_at as occurred_at, 
        m.content_text as title, 
        m.status,
        m.sender_type as "actor",
        json_build_object('mediaUrl', m.media_url, 'contentType', m.content_type) as metadata
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.account_id = ${accountId} AND c.contact_id = ${contactId}
    ` : sql`SELECT NULL::uuid as id WHERE false`; // Empty if dealId

    const timelineQuery = sql`
      WITH timeline AS (
        SELECT 
          id, 
          'task' as type, 
          created_at as occurred_at, 
          title, 
          status,
          created_by_user_id::text as "actor",
          json_build_object('priority', priority, 'dueAt', due_at) as metadata
        FROM tasks 
        WHERE account_id = ${accountId} AND ${baseCondition}

        UNION ALL

        SELECT 
          id, 
          'appointment' as type, 
          created_at as occurred_at, 
          title, 
          status,
          organizer_user_id::text as "actor",
          json_build_object('startTime', start_time, 'endTime', end_time, 'timezone', timezone) as metadata
        FROM appointments 
        WHERE account_id = ${accountId} AND ${baseCondition}

        UNION ALL

        SELECT 
          id, 
          'activity' as type, 
          occurred_at, 
          type as title, 
          'completed' as status,
          actor_user_id::text as "actor",
          metadata
        FROM activities 
        WHERE account_id = ${accountId} AND ${baseCondition}

        UNION ALL

        SELECT 
          id, 
          'note' as type, 
          created_at as occurred_at, 
          content as title, 
          'completed' as status,
          created_by_user_id::text as "actor",
          '{}'::jsonb as metadata
        FROM notes 
        WHERE account_id = ${accountId} AND ${baseCondition}

        UNION ALL

        SELECT 
          id, 
          'call' as type, 
          created_at as occurred_at, 
          direction as title, 
          state as status,
          assigned_agent_id::text as "actor",
          json_build_object('provider', provider, 'from', from_phone, 'to', to_phone) as metadata
        FROM calls 
        WHERE account_id = ${accountId} AND contact_id = ${contactId || null} -- Calls are strictly contact bound

        UNION ALL

        ${messageQuery}
      )
      SELECT * FROM timeline
      ORDER BY occurred_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const result = await db.execute(timelineQuery);

    return NextResponse.json(result);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[GET /api/zenith/timeline]');
  }
}
