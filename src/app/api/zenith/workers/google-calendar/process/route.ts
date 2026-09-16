import { verifyWorkerRequest } from '@/lib/workers/auth';
import { processNextGoogleCalendarJob } from '@/lib/google-calendar/sync';

export async function POST(request: Request) {
  const auth = verifyWorkerRequest(request);
  if (!auth.ok)
    return Response.json({ error: auth.error }, { status: auth.status });
  let processed = 0;
  while (processed < 10 && (await processNextGoogleCalendarJob()))
    processed += 1;
  return Response.json({ processed });
}
