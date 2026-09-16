import { z } from 'zod';

import { apiErrorResponse } from '@/lib/api/error-response';
import { logAuditAction } from '@/lib/audit/logger';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { applyConflictResolution } from '@/lib/google-calendar/sync';

const schema = z.object({
  connectionId: z.string().uuid(),
  resolution: z.enum(['zenith', 'google']),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ linkId: string }> }
) {
  try {
    const context = await requireZenithRole('agent');
    const { linkId } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return Response.json({ error: 'Resolução inválida.' }, { status: 400 });
    const resolved = await applyConflictResolution({
      accountId: context.accountId,
      userId: context.userId,
      connectionId: parsed.data.connectionId,
      linkId,
      resolution: parsed.data.resolution,
    });
    if (!resolved)
      return Response.json(
        { error: 'Conflito não encontrado.' },
        { status: 404 }
      );
    await logAuditAction({
      context,
      action: 'RESOLVE_CONFLICT',
      entityType: 'google_calendar_event_link',
      entityId: linkId,
      metadata: { resolution: parsed.data.resolution },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, '[POST google-calendar/conflicts]');
  }
}
