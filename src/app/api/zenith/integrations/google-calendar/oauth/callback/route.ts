import { NextResponse } from 'next/server';

import { logAuditAction } from '@/lib/audit/logger';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { consumeGoogleOauthCallback } from '@/lib/google-calendar/oauth';

function settingsUrl(
  request: Request,
  result: 'connected' | 'denied' | 'error'
) {
  const url = new URL('/settings', request.url);
  url.searchParams.set('tab', 'calendar');
  url.searchParams.set('google', result);
  return url;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get('error'))
    return NextResponse.redirect(settingsUrl(request, 'denied'));
  const state = params.get('state');
  const code = params.get('code');
  if (!state || !code)
    return NextResponse.redirect(settingsUrl(request, 'error'));
  try {
    const context = await requireZenithRole('agent');
    const connection = await consumeGoogleOauthCallback(state, code);
    await logAuditAction({
      context,
      action: 'CONNECT_INTEGRATION',
      entityType: 'google_calendar_connection',
      entityId: connection.id,
      metadata: { provider: 'google_calendar' },
    });
    return NextResponse.redirect(settingsUrl(request, 'connected'));
  } catch {
    return NextResponse.redirect(settingsUrl(request, 'error'));
  }
}
