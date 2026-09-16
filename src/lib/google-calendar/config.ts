export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
] as const;

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  pushUrl: string | null;
}

export function getGoogleCalendarConfig(): GoogleCalendarConfig {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google Calendar OAuth is not configured');
  }
  const redirect = new URL(redirectUri);
  if (process.env.NODE_ENV === 'production' && redirect.protocol !== 'https:') {
    throw new Error(
      'Google Calendar OAuth redirect must use HTTPS in production'
    );
  }
  const pushUrl = process.env.GOOGLE_CALENDAR_PUSH_URL ?? null;
  if (pushUrl && new URL(pushUrl).protocol !== 'https:') {
    throw new Error('Google Calendar push URL must use HTTPS');
  }
  return { clientId, clientSecret, redirectUri: redirect.toString(), pushUrl };
}
