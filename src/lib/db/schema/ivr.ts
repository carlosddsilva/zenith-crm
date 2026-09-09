import {
  sql,
} from "drizzle-orm";

import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  accounts,
  users,
} from "./identity";

import {
  voiceChannels,
  voiceProviderEnum,
} from "./voice";

import {
  calls,
  callDirectionEnum,
} from "./voice-calls";

export const ivrFlowStatusEnum =
  pgEnum(
    "ivr_flow_status",
    [
      "draft",
      "published",
      "archived",
    ],
  );

export const ivrExecutionStatusEnum =
  pgEnum(
    "ivr_execution_status",
    [
      "running",
      "waiting",
      "completed",
      "failed",
      "cancelled",
    ],
  );

export const ivrStepStatusEnum =
  pgEnum(
    "ivr_step_status",
    [
      "entered",
      "waiting",
      "completed",
      "failed",
      "skipped",
    ],
  );

/*
 * Fluxo lógico.
 *
 * Não contém diretamente o canvas.
 * O canvas pertence às versões.
 */
export const ivrFlows =
  pgTable(
    "ivr_flows",
    {
      id:
        uuid("id")
          .defaultRandom()
          .primaryKey(),

      accountId:
        uuid("account_id")
          .notNull()
          .references(
            () => accounts.id,
            {
              onDelete:
                "cascade",
            },
          ),

      createdByUserId:
        uuid(
          "created_by_user_id",
        )
          .notNull()
          .references(
            () => users.id,
            {
              onDelete:
                "restrict",
            },
          ),

      name:
        text("name")
          .notNull(),

      description:
        text("description"),

      status:
        ivrFlowStatusEnum(
          "status",
        )
          .notNull()
          .default("draft"),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      uniqueIndex(
        "ivr_flows_account_name_uidx",
      ).on(
        table.accountId,
        table.name,
      ),

      index(
        "ivr_flows_account_idx",
      ).on(
        table.accountId,
      ),

      index(
        "ivr_flows_status_idx",
      ).on(
        table.accountId,
        table.status,
      ),
    ],
  );

/*
 * Cada alteração publicável cria uma versão.
 *
 * definition terá:
 *
 * {
 *   nodes: [],
 *   edges: [],
 *   viewport: {},
 *   settings: {}
 * }
 */
export const ivrFlowVersions =
  pgTable(
    "ivr_flow_versions",
    {
      id:
        uuid("id")
          .defaultRandom()
          .primaryKey(),

      flowId:
        uuid("flow_id")
          .notNull()
          .references(
            () => ivrFlows.id,
            {
              onDelete:
                "cascade",
            },
          ),

      createdByUserId:
        uuid(
          "created_by_user_id",
        )
          .notNull()
          .references(
            () => users.id,
            {
              onDelete:
                "restrict",
            },
          ),

      version:
        integer("version")
          .notNull(),

      status:
        ivrFlowStatusEnum(
          "status",
        )
          .notNull()
          .default("draft"),

      definition:
        jsonb("definition")
          .$type<{
            nodes:
              Array<{
                id: string;

                type: string;

                position: {
                  x: number;
                  y: number;
                };

                data:
                  Record<
                    string,
                    unknown
                  >;
              }>;

            edges:
              Array<{
                id: string;

                source: string;

                target: string;

                sourceHandle?:
                  string | null;

                targetHandle?:
                  string | null;

                label?:
                  string | null;
              }>;

            viewport?: {
              x: number;
              y: number;
              zoom: number;
            };

            settings?: {
              providers?:
                Array<
                  "wacalls" |
                  "asterisk"
                >;

              maxSteps?:
                number;

              [key: string]:
                unknown;
            };
          }>()
          .notNull(),

      publishedAt:
        timestamp(
          "published_at",
          {
            withTimezone: true,
          },
        ),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      uniqueIndex(
        "ivr_flow_versions_flow_version_uidx",
      ).on(
        table.flowId,
        table.version,
      ),

      /*
       * Somente uma versão publicada
       * por fluxo.
       */
      uniqueIndex(
        "ivr_flow_versions_published_uidx",
      )
        .on(
          table.flowId,
        )
        .where(
          sql`${table.status} = 'published'`,
        ),

      uniqueIndex(
        "ivr_flow_versions_draft_uidx",
      )
        .on(
          table.flowId,
        )
        .where(
          sql`${table.status} = 'draft'`,
        ),

      index(
        "ivr_flow_versions_flow_idx",
      ).on(
        table.flowId,
      ),
    ],
  );

/*
 * Liga um fluxo a um canal de voz.
 *
 * routing_key:
 *
 * "*"               = padrão do canal
 * "6630151000"      = DID Asterisk
 * "sales"           = chave customizada futura
 *
 * O provider não é duplicado aqui.
 * Ele vem de voice_channels.
 */
export const ivrFlowBindings =
  pgTable(
    "ivr_flow_bindings",
    {
      id:
        uuid("id")
          .defaultRandom()
          .primaryKey(),

      accountId:
        uuid("account_id")
          .notNull()
          .references(
            () => accounts.id,
            {
              onDelete:
                "cascade",
            },
          ),

      flowId:
        uuid("flow_id")
          .notNull()
          .references(
            () => ivrFlows.id,
            {
              onDelete:
                "cascade",
            },
          ),

      voiceChannelId:
        uuid(
          "voice_channel_id",
        )
          .notNull()
          .references(
            () => voiceChannels.id,
            {
              onDelete:
                "cascade",
            },
          ),

      direction:
        callDirectionEnum(
          "direction",
        )
          .notNull()
          .default("inbound"),

      routingKey:
        text(
          "routing_key",
        )
          .notNull()
          .default("*"),

      config:
        jsonb("config")
          .$type<
            Record<
              string,
              unknown
            >
          >()
          .notNull()
          .default({}),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      uniqueIndex(
        "ivr_flow_bindings_route_uidx",
      ).on(
        table.accountId,
        table.voiceChannelId,
        table.direction,
        table.routingKey,
      ),

      index(
        "ivr_flow_bindings_flow_idx",
      ).on(
        table.flowId,
      ),

      index(
        "ivr_flow_bindings_channel_idx",
      ).on(
        table.voiceChannelId,
      ),
    ],
  );

/*
 * Uma execução representa uma chamada
 * atravessando uma versão publicada.
 */
export const ivrExecutions =
  pgTable(
    "ivr_executions",
    {
      id:
        uuid("id")
          .defaultRandom()
          .primaryKey(),

      accountId:
        uuid("account_id")
          .notNull()
          .references(
            () => accounts.id,
            {
              onDelete:
                "cascade",
            },
          ),

      callId:
        uuid("call_id")
          .notNull()
          .references(
            () => calls.id,
            {
              onDelete:
                "cascade",
            },
          ),

      flowId:
        uuid("flow_id")
          .notNull()
          .references(
            () => ivrFlows.id,
            {
              onDelete:
                "restrict",
            },
          ),

      flowVersionId:
        uuid(
          "flow_version_id",
        )
          .notNull()
          .references(
            () => ivrFlowVersions.id,
            {
              onDelete:
                "restrict",
            },
          ),

      voiceChannelId:
        uuid(
          "voice_channel_id",
        )
          .notNull()
          .references(
            () => voiceChannels.id,
            {
              onDelete:
                "restrict",
            },
          ),

      provider:
        voiceProviderEnum(
          "provider",
        )
          .notNull(),

      status:
        ivrExecutionStatusEnum(
          "status",
        )
          .notNull()
          .default("running"),

      currentNodeId:
        text(
          "current_node_id",
        ),

      /*
       * Variáveis da execução:
       *
       * contact
       * caller
       * DID
       * respostas
       * dados de API
       * etc.
       */
      context:
        jsonb("context")
          .$type<
            Record<
              string,
              unknown
            >
          >()
          .notNull()
          .default({}),

      error:
        text("error"),

      startedAt:
        timestamp(
          "started_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      endedAt:
        timestamp(
          "ended_at",
          {
            withTimezone: true,
          },
        ),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      uniqueIndex(
        "ivr_executions_call_uidx",
      ).on(
        table.callId,
      ),

      index(
        "ivr_executions_account_idx",
      ).on(
        table.accountId,
      ),

      index(
        "ivr_executions_status_idx",
      ).on(
        table.accountId,
        table.status,
      ),

      index(
        "ivr_executions_flow_idx",
      ).on(
        table.flowId,
      ),
    ],
  );

/*
 * Histórico detalhado dos nodes executados.
 *
 * O mesmo node pode ser executado novamente
 * em loop; por isso usamos sequence.
 */
export const ivrExecutionSteps =
  pgTable(
    "ivr_execution_steps",
    {
      id:
        uuid("id")
          .defaultRandom()
          .primaryKey(),

      executionId:
        uuid(
          "execution_id",
        )
          .notNull()
          .references(
            () => ivrExecutions.id,
            {
              onDelete:
                "cascade",
            },
          ),

      sequence:
        integer("sequence")
          .notNull(),

      nodeId:
        text("node_id")
          .notNull(),

      nodeType:
        text("node_type")
          .notNull(),

      status:
        ivrStepStatusEnum(
          "status",
        )
          .notNull()
          .default("entered"),

      input:
        jsonb("input")
          .$type<
            Record<
              string,
              unknown
            >
          >(),

      output:
        jsonb("output")
          .$type<
            Record<
              string,
              unknown
            >
          >(),

      error:
        text("error"),

      startedAt:
        timestamp(
          "started_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      endedAt:
        timestamp(
          "ended_at",
          {
            withTimezone: true,
          },
        ),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      uniqueIndex(
        "ivr_execution_steps_sequence_uidx",
      ).on(
        table.executionId,
        table.sequence,
      ),

      index(
        "ivr_execution_steps_execution_idx",
      ).on(
        table.executionId,
      ),

      index(
        "ivr_execution_steps_node_idx",
      ).on(
        table.nodeType,
      ),
    ],
  );


