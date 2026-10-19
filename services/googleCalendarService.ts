import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

const googleCalendarRedirectUri = makeRedirectUri({
  scheme: 'planado',
  path: 'auth/google-calendar-callback',
});

const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

export type GoogleCalendarItem = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  primary: boolean;
  selected: boolean;
};

export type GoogleCalendarConnection = {
  connected: boolean;
  googleEmail: string | null;
  destinationGroupId: string | null;
  selectedCalendarIds: string[];
  calendars: GoogleCalendarItem[];
  lastSyncedAt: string | null;
  lastError: string | null;
  connectedAt: string | null;
};

export type GoogleCalendarSyncResult = GoogleCalendarConnection & {
  added: number;
  updated: number;
  removed: number;
  skipped: boolean;
};

type OAuthGrant = {
  session: Session;
  providerAccessToken: string | null;
  providerRefreshToken: string | null;
};

type FunctionEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

async function functionErrorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'context' in error &&
    error.context instanceof Response
  ) {
    try {
      const body = (await error.context.clone().json()) as { error?: unknown };
      if (typeof body.error === 'string' && body.error.trim()) return body.error;
    } catch {
      // Use the normal Supabase Functions error below when the body is not JSON.
    }
  }

  return error instanceof Error ? error.message : 'Google Calendar request failed.';
}

async function invokeGoogleCalendar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<FunctionEnvelope<T>>(
    'google-calendar',
    { body },
  );

  if (error) throw new Error(await functionErrorMessage(error));
  if (!data?.ok || data.data === undefined) {
    throw new Error(data?.error || 'Google Calendar returned an invalid response.');
  }

  return data.data;
}

async function completeOAuth(url: string): Promise<OAuthGrant> {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    const description =
      typeof params.error_description === 'string'
        ? params.error_description
        : errorCode;
    throw new Error(description);
  }

  if (typeof params.code === 'string') {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    if (!data.session) throw new Error('Google did not return a valid session.');

    return {
      session: data.session,
      providerAccessToken: data.session.provider_token ?? null,
      providerRefreshToken: data.session.provider_refresh_token ?? null,
    };
  }

  if (
    typeof params.access_token !== 'string' ||
    typeof params.refresh_token !== 'string'
  ) {
    throw new Error('Google did not return a valid session.');
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  });
  if (error) throw error;
  if (!data.session) throw new Error('Google did not return a valid session.');

  return {
    session: data.session,
    providerAccessToken:
      data.session.provider_token ??
      (typeof params.provider_token === 'string' ? params.provider_token : null),
    providerRefreshToken:
      data.session.provider_refresh_token ??
      (typeof params.provider_refresh_token === 'string'
        ? params.provider_refresh_token
        : null),
  };
}

export async function getGoogleCalendarConnection() {
  return invokeGoogleCalendar<GoogleCalendarConnection>({ action: 'status' });
}

export async function connectGoogleCalendar(
  expectedUserId: string,
  destinationGroupId: string,
) {
  const { data: previousSessionData } = await supabase.auth.getSession();
  const previousSession = previousSessionData.session;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: googleCalendarRedirectUri,
      skipBrowserRedirect: true,
      scopes: GOOGLE_CALENDAR_SCOPES,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        ...(previousSession?.user.email
          ? { login_hint: previousSession.user.email }
          : {}),
      },
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error('Google authorization could not be opened.');

  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    googleCalendarRedirectUri,
  );
  if (result.type !== 'success') return null;

  const grant = await completeOAuth(result.url);
  if (grant.session.user.id !== expectedUserId) {
    if (previousSession) {
      await supabase.auth.setSession({
        access_token: previousSession.access_token,
        refresh_token: previousSession.refresh_token,
      });
    }
    throw new Error('Choose the same Google account you use to sign in to Planado.');
  }

  if (!grant.providerAccessToken) {
    throw new Error(
      'Google did not grant Calendar access. Please try connecting again and approve Calendar permission.',
    );
  }

  return invokeGoogleCalendar<GoogleCalendarConnection>({
    action: 'connect',
    destinationGroupId,
    providerAccessToken: grant.providerAccessToken,
    providerRefreshToken: grant.providerRefreshToken,
  });
}

export async function updateGoogleCalendarSettings(
  destinationGroupId: string,
  selectedCalendarIds: string[],
) {
  return invokeGoogleCalendar<GoogleCalendarConnection>({
    action: 'update-settings',
    destinationGroupId,
    selectedCalendarIds,
  });
}

export async function syncGoogleCalendar(force = false) {
  return invokeGoogleCalendar<GoogleCalendarSyncResult>({ action: 'sync', force });
}

export async function disconnectGoogleCalendar(removeImportedEvents: boolean) {
  return invokeGoogleCalendar<{ disconnected: true; removed: number }>({
    action: 'disconnect',
    removeImportedEvents,
  });
}

export function getGoogleCalendarRedirectUri() {
  return googleCalendarRedirectUri;
}
