import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { automations, automationVersions } from '@/lib/db/schema/automations';
import { eq, and, desc } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { accountId, userId } = await requireZenithRole('admin');

    const [automation] = await db.select()
      .from(automations)
      .where(and(eq(automations.id, id), eq(automations.accountId, accountId)))
      .limit(1);

    if (!automation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Determine next version number
    const [latestVersion] = await db.select({ version: automationVersions.version })
      .from(automationVersions)
      .where(eq(automationVersions.automationId, id))
      .orderBy(desc(automationVersions.version))
      .limit(1);

    const nextVersion = latestVersion ? latestVersion.version + 1 : 1;

    // Create a new version
    const [newVersion] = await db.insert(automationVersions).values({
      automationId: id,
      version: nextVersion,
      triggerType: automation.triggerType,
      triggerConfig: automation.triggerConfig,
      conditions: automation.conditions,
      actions: automation.actions,
      createdByUserId: userId,
    }).returning();

    // Update the automation to point to the published version
    await db.update(automations)
      .set({ publishedVersionId: newVersion.id, updatedAt: new Date() })
      .where(eq(automations.id, id));

    return NextResponse.json({ success: true, versionId: newVersion.id, version: newVersion.version });
  } catch (error: unknown) {
    return apiErrorResponse(error, '[POST /api/zenith/automations/:id/publish]');
  }
}
