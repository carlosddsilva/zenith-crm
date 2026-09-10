import {
  and,
  eq,
} from "drizzle-orm";

import {
  db,
} from "@/lib/db/client";

import {
  calls,
  contacts,
} from "@/lib/db/schema";

import type {
  VoiceProviderId,
} from "./types";

export interface FindOrCreateInboundCallInput {
  accountId:
    string;

  voiceChannelId:
    string;

  provider:
    VoiceProviderId;

  providerCallId:
    string;

  fromPhone?:
    string | null;

  toPhone?:
    string | null;

  occurredAt?:
    Date;
}

function normalizeContactPhone(
  value:
    string | null | undefined,
) {
  const trimmed =
    value?.trim() ?? "";

  /*
   * JID/LID nao e numero telefonico.
   * Nunca tentamos associa-lo a um
   * contato apenas removendo caracteres.
   */
  if (
    !trimmed ||
    trimmed.includes("@")
  ) {
    return "";
  }

  return trimmed.replace(
    /\D/g,
    "",
  );
}

function contactPhoneCandidates(
  value:
    string | null | undefined,
) {
  const digits =
    normalizeContactPhone(
      value,
    );

  if (!digits) {
    return [];
  }

  const candidates =
    [digits];

  /*
   * Brasil:
   * 55 + DDD + 8 digitos
   *
   * WhatsApp pode entregar numeros moveis
   * antigos sem o nono digito.
   *
   * Exemplo:
   * 556692277633
   *       ↓
   * 5566992277633
   */
  if (
    digits.startsWith("55") &&
    digits.length === 12
  ) {
    const subscriber =
      digits.slice(4);

    if (
      /^[6-9]/.test(
        subscriber,
      )
    ) {
      candidates.push(
        `${digits.slice(
          0,
          4,
        )}9${subscriber}`,
      );
    }
  }

  /*
   * Tambem aceitamos o caminho inverso
   * para agendas antigas ainda sem o 9.
   */
  if (
    digits.startsWith("55") &&
    digits.length === 13 &&
    digits[4] === "9"
  ) {
    const legacySubscriber =
      digits.slice(5);

    if (
      /^[6-9]/.test(
        legacySubscriber,
      )
    ) {
      candidates.push(
        `${digits.slice(
          0,
          4,
        )}${legacySubscriber}`,
      );
    }
  }

  return [
    ...new Set(
      candidates,
    ),
  ];
}

async function resolveContactId(
  accountId:
    string,

  phone:
    string | null | undefined,
) {
  const candidates =
    contactPhoneCandidates(
      phone,
    );

  for (
    const phoneNormalized
    of candidates
  ) {
    const [contact] =
      await db
        .select({
          id:
            contacts.id,
        })
        .from(
          contacts,
        )
        .where(
          and(
            eq(
              contacts.accountId,
              accountId,
            ),

            eq(
              contacts.phoneNormalized,
              phoneNormalized,
            ),
          ),
        )
        .limit(1);

    if (contact) {
      return contact.id;
    }
  }

  return null;
}

export async function findOrCreateInboundCall(
  input:
    FindOrCreateInboundCallInput,
) {
  const providerCallId =
    input.providerCallId.trim();

  if (!providerCallId) {
    throw new Error(
      "providerCallId is required for inbound call",
    );
  }

  const contactId =
    await resolveContactId(
      input.accountId,
      input.fromPhone,
    );

  const [existing] =
    await db
      .select()
      .from(calls)
      .where(
        and(
          eq(
            calls.accountId,
            input.accountId,
          ),

          eq(
            calls.voiceChannelId,
            input.voiceChannelId,
          ),

          eq(
            calls.providerCallId,
            providerCallId,
          ),
        ),
      )
      .limit(1);

  if (existing) {
    if (
      contactId &&
      !existing.contactId
    ) {
      const [linked] =
        await db
          .update(
            calls,
          )
          .set({
            contactId,

            updatedAt:
              new Date(),
          })
          .where(
            and(
              eq(
                calls.id,
                existing.id,
              ),

              eq(
                calls.accountId,
                input.accountId,
              ),
            ),
          )
          .returning();

      return {
        call:
          linked ?? existing,

        created:
          false,
      };
    }

    return {
      call:
        existing,

      created:
        false,
    };
  }

  const occurredAt =
    input.occurredAt ??
    new Date();

  const [created] =
    await db
      .insert(calls)
      .values({
        accountId:
          input.accountId,

        voiceChannelId:
          input.voiceChannelId,

        provider:
          input.provider,

        providerCallId,

        direction:
          "inbound",

        state:
          "new",

        contactId,

        fromPhone:
          input.fromPhone ??
          null,

        toPhone:
          input.toPhone ??
          null,

        startedAt:
          occurredAt,

        ringingAt:
          occurredAt,
      })
      .onConflictDoNothing()
      .returning();

  if (created) {
    return {
      call:
        created,

      created:
        true,
    };
  }

  /*
   * Outra entrega concorrente pode ter criado
   * a mesma chamada entre o SELECT e o INSERT.
   */
  const [concurrent] =
    await db
      .select()
      .from(calls)
      .where(
        and(
          eq(
            calls.accountId,
            input.accountId,
          ),

          eq(
            calls.voiceChannelId,
            input.voiceChannelId,
          ),

          eq(
            calls.providerCallId,
            providerCallId,
          ),
        ),
      )
      .limit(1);

  if (!concurrent) {
    throw new Error(
      "Inbound call could not be created or resolved",
    );
  }

  if (
    contactId &&
    !concurrent.contactId
  ) {
    const [linked] =
      await db
        .update(
          calls,
        )
        .set({
          contactId,

          updatedAt:
            new Date(),
        })
        .where(
          and(
            eq(
              calls.id,
              concurrent.id,
            ),

            eq(
              calls.accountId,
              input.accountId,
            ),
          ),
        )
        .returning();

    return {
      call:
        linked ?? concurrent,

      created:
        false,
    };
  }

  return {
    call:
      concurrent,

    created:
      false,
  };
}