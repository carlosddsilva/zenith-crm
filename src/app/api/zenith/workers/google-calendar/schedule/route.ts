import { verifyWorkerRequest } from '@/lib/workers/auth';
import { scheduleGoogleCalendarMaintenance } from '@/lib/google-calendar/sync';

export async function POST(request: Request) {
  const auth = verifyWorkerRequest(request);
  if (!auth.ok)
    return Response.json({ error: auth.error }, { status: auth.status });
  return Response.json({
    scheduled: await scheduleGoogleCalendarMaintenance(),
  });
}
