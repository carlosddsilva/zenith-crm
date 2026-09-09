import {
  and,
  eq,
} from "drizzle-orm";

import {
  db,
} from "@/lib/db/client";

import {
  ivrFlowBindings,
  ivrFlows,
  ivrFlowVersions,
} from "@/lib/db/schema";

export interface ResolveInboundIvrBindingInput {
  accountId:
    string;

  voiceChannelId:
    string;

  routingKey?:
    string | null;
}

export interface ResolvedInboundIvrBinding {
  bindingId:
    string;

  flowId:
    string;

  flowVersionId:
    string;

  routingKey:
    string;
}

async function findBinding(
  input:
    ResolveInboundIvrBindingInput,

  routingKey:
    string,
): Promise<
  ResolvedInboundIvrBinding | null
> {
  const [row] =
    await db
      .select({
        bindingId:
          ivrFlowBindings.id,

        flowId:
          ivrFlows.id,

        flowVersionId:
          ivrFlowVersions.id,

        routingKey:
          ivrFlowBindings.routingKey,
      })
      .from(
        ivrFlowBindings,
      )
      .innerJoin(
        ivrFlows,
        eq(
          ivrFlows.id,
          ivrFlowBindings.flowId,
        ),
      )
      .innerJoin(
        ivrFlowVersions,
        and(
          eq(
            ivrFlowVersions.flowId,
            ivrFlows.id,
          ),

          eq(
            ivrFlowVersions.status,
            "published",
          ),
        ),
      )
      .where(
        and(
          eq(
            ivrFlowBindings.accountId,
            input.accountId,
          ),

          eq(
            ivrFlowBindings.voiceChannelId,
            input.voiceChannelId,
          ),

          eq(
            ivrFlowBindings.direction,
            "inbound",
          ),

          eq(
            ivrFlowBindings.routingKey,
            routingKey,
          ),

          eq(
            ivrFlows.accountId,
            input.accountId,
          ),

          eq(
            ivrFlows.status,
            "published",
          ),
        ),
      )
      .limit(1);

  return row ?? null;
}

export async function resolveInboundIvrBinding(
  input:
    ResolveInboundIvrBindingInput,
): Promise<
  ResolvedInboundIvrBinding | null
> {
  const routingKey =
    input.routingKey
      ?.trim() || "*";

  if (
    routingKey !==
    "*"
  ) {
    const exact =
      await findBinding(
        input,
        routingKey,
      );

    if (exact) {
      return exact;
    }
  }

  return findBinding(
    input,
    "*",
  );
}
