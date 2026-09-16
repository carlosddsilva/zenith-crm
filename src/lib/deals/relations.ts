import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  accountMembers,
  companies,
  contacts,
  pipelineStages,
  pipelines,
} from "@/lib/db/schema";

export interface DealRelations {
  pipelineId: string;
  stageId: string;
  contactId?: string | null;
  companyId?: string | null;
  assignedTo?: string | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function validateDealRelations(
  accountId: string,
  relations: DealRelations,
): Promise<string | null> {
  if (
    !UUID_PATTERN.test(relations.pipelineId) ||
    !UUID_PATTERN.test(relations.stageId)
  ) {
    return "Invalid pipeline or stage";
  }
  if (relations.contactId && !UUID_PATTERN.test(relations.contactId)) {
    return "Invalid contactId";
  }
  if (relations.companyId && !UUID_PATTERN.test(relations.companyId)) {
    return "Invalid companyId";
  }
  if (relations.assignedTo && !UUID_PATTERN.test(relations.assignedTo)) {
    return "Invalid assignedTo";
  }

  const [stage, contact, company, assignee] = await Promise.all([
    db
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId))
      .where(
        and(
          eq(pipelines.id, relations.pipelineId),
          eq(pipelines.accountId, accountId),
          eq(pipelineStages.id, relations.stageId),
        ),
      )
      .limit(1),
    relations.contactId
      ? db
          .select({ id: contacts.id })
          .from(contacts)
          .where(
            and(
              eq(contacts.id, relations.contactId),
              eq(contacts.accountId, accountId),
            ),
          )
          .limit(1)
      : Promise.resolve([{ id: null }]),
    relations.companyId
      ? db
          .select({ id: companies.id })
          .from(companies)
          .where(
            and(
              eq(companies.id, relations.companyId),
              eq(companies.accountId, accountId),
            ),
          )
          .limit(1)
      : Promise.resolve([{ id: null }]),
    relations.assignedTo
      ? db
          .select({ id: accountMembers.userId })
          .from(accountMembers)
          .where(
            and(
              eq(accountMembers.userId, relations.assignedTo),
              eq(accountMembers.accountId, accountId),
            ),
          )
          .limit(1)
      : Promise.resolve([{ id: null }]),
  ]);

  if (stage.length !== 1) return "Invalid pipeline or stage";
  if (contact.length !== 1) return "Invalid contactId";
  if (company.length !== 1) return "Invalid companyId";
  if (assignee.length !== 1) return "Invalid assignedTo";
  return null;
}
