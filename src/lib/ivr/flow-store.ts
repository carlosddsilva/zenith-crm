import {
  and,
  desc,
  eq,
  sql,
} from "drizzle-orm";

import {
  db,
} from "@/lib/db/client";

import {
  ivrFlows,
  ivrFlowVersions,
} from "@/lib/db/schema";

import {
  getIvrDefinitionProviders,
  parseIvrFlowDefinition,
} from "./definition";

import {
  validateIvrFlow,
} from "./validator";

export class IvrFlowError
  extends Error {
  constructor(
    public code:
      string,

    message:
      string,

    public status:
      number,
  ) {
    super(message);

    this.name =
      "IvrFlowError";
  }
}

export async function saveIvrDraft(
  input: {
    accountId:
      string;

    userId:
      string;

    flowId:
      string;

    definition:
      unknown;
  },
) {
  const definition =
    parseIvrFlowDefinition(
      input.definition,
    );

  return db.transaction(
    async (tx) => {
      /*
       * Serializa o versionamento
       * deste fluxo dentro do tenant.
       */
      await tx.execute(
        sql`
          SELECT pg_advisory_xact_lock(
            hashtext(
              ${`${input.accountId}:${input.flowId}:ivr`}
            )::bigint
          )
        `,
      );

      const [flow] =
        await tx
          .select()
          .from(
            ivrFlows,
          )
          .where(
            and(
              eq(
                ivrFlows.id,
                input.flowId,
              ),

              eq(
                ivrFlows.accountId,
                input.accountId,
              ),
            ),
          )
          .limit(1);

      if (!flow) {
        throw new IvrFlowError(
          "ivr_flow_not_found",
          "Fluxo IVR nao encontrado.",
          404,
        );
      }

      if (
        flow.status ===
        "archived"
      ) {
        throw new IvrFlowError(
          "ivr_flow_archived",
          "Um fluxo arquivado nao pode ser editado.",
          409,
        );
      }

      const [draft] =
        await tx
          .select()
          .from(
            ivrFlowVersions,
          )
          .where(
            and(
              eq(
                ivrFlowVersions.flowId,
                flow.id,
              ),

              eq(
                ivrFlowVersions.status,
                "draft",
              ),
            ),
          )
          .limit(1);

      /*
       * Enquanto existir draft,
       * apenas atualizamos sua definição.
       */
      if (draft) {
        const [updated] =
          await tx
            .update(
              ivrFlowVersions,
            )
            .set({
              definition,
            })
            .where(
              eq(
                ivrFlowVersions.id,
                draft.id,
              ),
            )
            .returning();

        await tx
          .update(
            ivrFlows,
          )
          .set({
            updatedAt:
              new Date(),
          })
          .where(
            eq(
              ivrFlows.id,
              flow.id,
            ),
          );

        return updated;
      }

      /*
       * Sem draft significa que a última
       * versão já foi publicada/arquivada.
       * Criamos a próxima versão.
       */
      const [maxRow] =
        await tx
          .select({
            maxVersion:
              sql<number>`
                coalesce(
                  max(
                    ${ivrFlowVersions.version}
                  ),
                  0
                )::int
              `,
          })
          .from(
            ivrFlowVersions,
          )
          .where(
            eq(
              ivrFlowVersions.flowId,
              flow.id,
            ),
          );

      const nextVersion =
        Number(
          maxRow?.maxVersion ??
          0,
        ) + 1;

      const [created] =
        await tx
          .insert(
            ivrFlowVersions,
          )
          .values({
            flowId:
              flow.id,

            createdByUserId:
              input.userId,

            version:
              nextVersion,

            status:
              "draft",

            definition,
          })
          .returning();

      await tx
        .update(
          ivrFlows,
        )
        .set({
          updatedAt:
            new Date(),
        })
        .where(
          eq(
            ivrFlows.id,
            flow.id,
          ),
        );

      return created;
    },
  );
}

export async function publishIvrDraft(
  input: {
    accountId:
      string;

    flowId:
      string;
  },
) {
  return db.transaction(
    async (tx) => {
      await tx.execute(
        sql`
          SELECT pg_advisory_xact_lock(
            hashtext(
              ${`${input.accountId}:${input.flowId}:ivr`}
            )::bigint
          )
        `,
      );

      const [flow] =
        await tx
          .select()
          .from(
            ivrFlows,
          )
          .where(
            and(
              eq(
                ivrFlows.id,
                input.flowId,
              ),

              eq(
                ivrFlows.accountId,
                input.accountId,
              ),
            ),
          )
          .limit(1);

      if (!flow) {
        throw new IvrFlowError(
          "ivr_flow_not_found",
          "Fluxo IVR nao encontrado.",
          404,
        );
      }

      if (
        flow.status ===
        "archived"
      ) {
        throw new IvrFlowError(
          "ivr_flow_archived",
          "Um fluxo arquivado nao pode ser publicado.",
          409,
        );
      }

      const [draft] =
        await tx
          .select()
          .from(
            ivrFlowVersions,
          )
          .where(
            and(
              eq(
                ivrFlowVersions.flowId,
                flow.id,
              ),

              eq(
                ivrFlowVersions.status,
                "draft",
              ),
            ),
          )
          .limit(1);

      if (!draft) {
        throw new IvrFlowError(
          "ivr_draft_not_found",
          "Nao existe rascunho para publicar.",
          409,
        );
      }

      /*
       * A validação é executada novamente
       * no backend no momento da publicação.
       */
      const definition =
        parseIvrFlowDefinition(
          draft.definition,
        );

      const providers =
        getIvrDefinitionProviders(
          definition,
        );

      const validation =
        validateIvrFlow(
          definition,
          providers,
        );

      if (!validation.valid) {
        return {
          published:
            false as const,

          validation,
        };
      }

      /*
       * Mantemos a versão anterior no
       * histórico, agora como archived.
       */
      await tx
        .update(
          ivrFlowVersions,
        )
        .set({
          status:
            "archived",
        })
        .where(
          and(
            eq(
              ivrFlowVersions.flowId,
              flow.id,
            ),

            eq(
              ivrFlowVersions.status,
              "published",
            ),
          ),
        );

      const now =
        new Date();

      const [published] =
        await tx
          .update(
            ivrFlowVersions,
          )
          .set({
            status:
              "published",

            publishedAt:
              now,
          })
          .where(
            eq(
              ivrFlowVersions.id,
              draft.id,
            ),
          )
          .returning();

      await tx
        .update(
          ivrFlows,
        )
        .set({
          status:
            "published",

          updatedAt:
            now,
        })
        .where(
          eq(
            ivrFlows.id,
            flow.id,
          ),
        );

      return {
        published:
          true as const,

        version:
          published,

        validation,
      };
    },
  );
}

export async function getCurrentIvrVersion(
  accountId:
    string,

  flowId:
    string,
) {
  const [flow] =
    await db
      .select()
      .from(
        ivrFlows,
      )
      .where(
        and(
          eq(
            ivrFlows.id,
            flowId,
          ),

          eq(
            ivrFlows.accountId,
            accountId,
          ),
        ),
      )
      .limit(1);

  if (!flow) {
    throw new IvrFlowError(
      "ivr_flow_not_found",
      "Fluxo IVR nao encontrado.",
      404,
    );
  }

  const versions =
    await db
      .select()
      .from(
        ivrFlowVersions,
      )
      .where(
        eq(
          ivrFlowVersions.flowId,
          flow.id,
        ),
      )
      .orderBy(
        desc(
          ivrFlowVersions.version,
        ),
      );

  const draft =
    versions.find(
      (item) =>
        item.status ===
        "draft",
    ) ?? null;

  const published =
    versions.find(
      (item) =>
        item.status ===
        "published",
    ) ?? null;

  return {
    flow,
    versions,
    draft,
    published,

    current:
      draft ??
      published ??
      versions[0] ??
      null,
  };
}
