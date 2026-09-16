import { NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/api/error-response';
import { createGoogleAuthorizationUrl } from '@/lib/google-calendar/oauth';

export async function GET() {
  try {
    return NextResponse.redirect(await createGoogleAuthorizationUrl());
  } catch (error) {
    return apiErrorResponse(error, '[GET google-calendar/oauth/start]');
  }
}
