import { and, eq } from 'drizzle-orm';

import { apiErrorResponse } from '@/lib/api/error-response';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { db } from '@/lib/db/client';
import { googleCalendarConnections } from '@/lib/db/schema';
import { googleCalendarFetch } from '@/lib/google-calendar/client';

interface CalendarListPage {
  items?: Array<{
    id: string;
    summary: string;
    timeZone?: string;
    accessRole: 'freeBusyReader' | 'reader' | 'writer' | 'owner';
    primary?: boolean;
    deleted?: boolean;
  }>;
  nextPageToken?: string;
}

export async function GET() {
  try {
    const context = await requireZenithRole('agent');
    const [connection] = await db
      .select({ id: googleCalendarConnections.id })
      .from(googleCalendarConnections)
      .where(
        and(
          eq(googleCalendarConnections.accountId, context.accountId),
          eq(googleCalendarConnections.userId, context.userId),
          eq(googleCalendarConnections.status, 'connected')
        )
      )
      .limit(1);
    if (!connection)
      return Response.json(
        { error: 'Google Calendar não conectado.' },
        { status: 404 }
      );
    const items: CalendarListPage['items'] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ maxResults: '250' });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await googleCalendarFetch<CalendarListPage>({
        accountId: context.accountId,
        connectionId: connection.id,
        path: `/users/me/calendarList?${params}`,
      });
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return Response.json({
      items: items.filter(
        (item) =>
          !item.deleted &&
          (item.accessRole === 'writer' || item.accessRole === 'owner')
      ),
    });
  } catch (error) {
    return apiErrorResponse(error, '[GET google-calendar/calendars]');
  }
}
