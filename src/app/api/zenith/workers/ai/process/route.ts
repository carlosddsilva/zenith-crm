import { processNextAiJob } from "@/lib/ai/runtime";
import { verifyWorkerRequest } from "@/lib/workers/auth";

export async function POST(request: Request) {
  const auth = verifyWorkerRequest(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  let processed = 0;
  while (processed < 10 && await processNextAiJob()) processed += 1;
  return Response.json({ processed });
}

