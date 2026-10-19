// @ts-nocheck
/* eslint-disable */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_SOURCE = 'google_calendar';
const AUTO_SYNC_THROTTLE_MS = 15 * 60 * 1000;
const ACCESS_TOKEN_EARLY_REFRESH_MS = 2 * 60 * 1000;
const FULL_SYNC_PAST_DAYS = 30;
const FULL_SYNC_FUTURE_DAYS = 370;

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const tokenEncryptionSecret = Deno.env.get('GOOGLE_TOKEN_ENCRYPTION_KEY') ?? '';
const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type ConnectionRow = {
  user_id: string;
  google_email: string;
  destination_group_id: string;
  selected_calendar_ids: string[];
  available_calendars: GoogleCalendarSummary[];
  sync_tokens: Record<string, string>;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  access_token_expires_at: string;
  connected_at: string;
  last_attempted_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  updated_at: string;
};

type GoogleCalendarSummary = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  primary: boolean;
};

type GoogleCalendarEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function ok(data: unknown) {
  return json(200, { ok: true, data });
}

function fail(status: number, message: string) {
  return json(status, { ok: false, error: message });
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Google Calendar request failed.';
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

let encryptionKeyPromise: Promise<CryptoKey> | null = null;

function encryptionKey() {
  if (!tokenEncryptionSecret) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY is not configured in Supabase secrets.');
  }

  encryptionKeyPromise ??= crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(tokenEncryptionSecret))
    .then((digest) =>
      crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']),
    );
  return encryptionKeyPromise;
}

async function encryptToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await encryptionKey(),
      new TextEncoder().encode(value),
    ),
  );
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv);
  combined.set(encrypted, iv.length);
  return bytesToBase64(combined);
}

async function decryptToken(value: string) {
  const combined = base64ToBytes(value);
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(),
    encrypted,
  );
  return new TextDecoder().decode(decrypted);
}

async function authenticatedUser(request: Request) {
  const authorization = request.headers.get('Authorization') ?? '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '');
  if (!accessToken) throw new Error('You must be signed in to connect Google Calendar.');

  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data.user) throw new Error('Your Planado session has expired. Please sign in again.');
  return data.user;
}

async function ensureGroupMembership(userId: string, groupId: string) {
  if (!groupId) throw new Error('Choose a Planado group for imported events.');
  const { data, error } = await admin
    .from('group_members')
    .select('id')
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('You are no longer a member of the selected Planado group.');
}

async function loadConnection(userId: string): Promise<ConnectionRow | null> {
  const { data, error } = await admin
    .from('google_calendar_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as ConnectionRow | null;
}

function connectionStatus(connection: ConnectionRow | null) {
  if (!connection) {
    return {
      connected: false,
      googleEmail: null,
      destinationGroupId: null,
      selectedCalendarIds: [],
      calendars: [],
      lastSyncedAt: null,
      lastError: null,
      connectedAt: null,
    };
  }

  const selected = new Set(connection.selected_calendar_ids ?? []);
  return {
    connected: true,
    googleEmail: connection.google_email,
    destinationGroupId: connection.destination_group_id,
    selectedCalendarIds: connection.selected_calendar_ids ?? [],
    calendars: (connection.available_calendars ?? []).map((calendar) => ({
      ...calendar,
      selected: selected.has(calendar.id),
    })),
    lastSyncedAt: connection.last_synced_at,
    lastError: connection.last_error,
    connectedAt: connection.connected_at,
  };
}

async function googleJson<T>(url: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const googleMessage =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'object' &&
      body.error !== null &&
      'message' in body.error &&
      typeof body.error.message === 'string'
        ? body.error.message
        : `Google Calendar returned ${response.status}.`;
    const error = new Error(googleMessage) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return body as T;
}

async function fetchGoogleCalendars(accessToken: string) {
  const calendars: GoogleCalendarSummary[] = [];
  let pageToken: string | null = null;
  let pageCount = 0;

  do {
    const url = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');
    url.searchParams.set('maxResults', '250');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await googleJson<{
      items?: Array<{
        id?: string;
        summary?: string;
        description?: string;
        backgroundColor?: string;
        primary?: boolean;
        deleted?: boolean;
      }>;
      nextPageToken?: string;
    }>(url.toString(), accessToken);

    for (const item of response.items ?? []) {
      if (!item.id || item.deleted) continue;
      calendars.push({
        id: item.id,
        name: item.summary?.trim() || 'Google Calendar',
        description: item.description?.trim() || null,
        color: /^#[0-9a-f]{6}$/i.test(item.backgroundColor ?? '')
          ? item.backgroundColor!
          : '#4285F4',
        primary: item.primary === true,
      });
    }

    pageToken = response.nextPageToken ?? null;
    pageCount += 1;
  } while (pageToken && pageCount < 8);

  if (!calendars.length) throw new Error('No readable Google calendars were found.');
  return calendars;
}

async function refreshAccessToken(connection: ConnectionRow) {
  if (!connection.refresh_token_ciphertext) {
    throw new Error('Google permission expired. Open Settings and reconnect Google Calendar.');
  }
  if (!googleClientId || !googleClientSecret) {
    throw new Error('Google Calendar automatic refresh is not configured on the Planado server.');
  }

  const refreshToken = await decryptToken(connection.refresh_token_ciphertext);
  const body = new URLSearchParams({
    client_id: googleClientId,
    client_secret: googleClientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json();
  if (!response.ok || typeof payload.access_token !== 'string') {
    throw new Error('Google permission expired. Reconnect Google Calendar to continue syncing.');
  }

  const expiresAt = new Date(Date.now() + Number(payload.expires_in ?? 3600) * 1000).toISOString();
  const encryptedAccessToken = await encryptToken(payload.access_token);
  const changes: Record<string, unknown> = {
    access_token_ciphertext: encryptedAccessToken,
    access_token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };
  if (typeof payload.refresh_token === 'string') {
    changes.refresh_token_ciphertext = await encryptToken(payload.refresh_token);
  }

  const { error } = await admin
    .from('google_calendar_connections')
    .update(changes)
    .eq('user_id', connection.user_id);
  if (error) throw error;

  connection.access_token_ciphertext = encryptedAccessToken;
  connection.access_token_expires_at = expiresAt;
  if (typeof changes.refresh_token_ciphertext === 'string') {
    connection.refresh_token_ciphertext = changes.refresh_token_ciphertext;
  }
  return payload.access_token as string;
}

async function validAccessToken(connection: ConnectionRow) {
  const expiresAt = new Date(connection.access_token_expires_at).getTime();
  if (expiresAt - Date.now() > ACCESS_TOKEN_EARLY_REFRESH_MS) {
    return decryptToken(connection.access_token_ciphertext);
  }
  return refreshAccessToken(connection);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function externalCalendarId(calendarId: string) {
  return sha256Hex(calendarId);
}

function externalEventId(calendarId: string, googleEventId: string) {
  return sha256Hex(`${calendarId}\u0000${googleEventId}`);
}

function eventTimestamp(value: { date?: string; dateTime?: string } | undefined) {
  if (value?.dateTime) return new Date(value.dateTime).toISOString();
  if (value?.date) return new Date(`${value.date}T00:00:00.000Z`).toISOString();
  return null;
}

function truncate(value: string | undefined, maxLength: number) {
  const normalized = value?.trim() ?? '';
  return normalized ? normalized.slice(0, maxLength) : null;
}

async function applyGoogleEvents(
  userId: string,
  destinationGroupId: string,
  calendar: GoogleCalendarSummary,
  items: GoogleCalendarEvent[],
) {
  const activeRows: Array<Record<string, unknown>> = [];
  const cancelledIds: string[] = [];
  const calendarExternalId = await externalCalendarId(calendar.id);

  for (const event of items) {
    if (!event.id) continue;
    const externalId = await externalEventId(calendar.id, event.id);
    if (event.status === 'cancelled') {
      cancelledIds.push(externalId);
      continue;
    }

    const startTime = eventTimestamp(event.start);
    let endTime = eventTimestamp(event.end);
    if (!startTime) continue;
    if (!endTime || endTime < startTime) {
      endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();
    }

    activeRows.push({
      group_id: destinationGroupId,
      created_by: userId,
      title: truncate(event.summary, 120) ?? '(Untitled Google event)',
      description: truncate(event.description, 5000),
      location: truncate(event.location, 300),
      category: 'personal',
      start_time: startTime,
      end_time: endTime,
      is_all_day: Boolean(event.start?.date && !event.start?.dateTime),
      is_important: false,
      color: calendar.color,
      visibility: 'private',
      status: 'active',
      retention_policy: 'permanent',
      delete_after: null,
      external_source: GOOGLE_SOURCE,
      external_id: externalId,
      external_calendar_id: calendarExternalId,
      updated_at: new Date().toISOString(),
    });
  }

  let added = 0;
  let updated = 0;
  let removed = 0;

  for (let index = 0; index < activeRows.length; index += 400) {
    const chunk = activeRows.slice(index, index + 400);
    const ids = chunk.map((row) => row.external_id as string);
    const { data: existing, error: existingError } = await admin
      .from('events')
      .select('external_id')
      .eq('created_by', userId)
      .eq('external_source', GOOGLE_SOURCE)
      .in('external_id', ids);
    if (existingError) throw existingError;
    const existingIds = new Set((existing ?? []).map((event) => event.external_id));
    added += ids.filter((id) => !existingIds.has(id)).length;
    updated += ids.filter((id) => existingIds.has(id)).length;

    const { error } = await admin
      .from('events')
      .upsert(chunk, { onConflict: 'created_by,external_source,external_id' });
    if (error) throw error;
  }

  for (let index = 0; index < cancelledIds.length; index += 400) {
    const chunk = cancelledIds.slice(index, index + 400);
    const { data, error } = await admin
      .from('events')
      .delete()
      .eq('created_by', userId)
      .eq('external_source', GOOGLE_SOURCE)
      .in('external_id', chunk)
      .select('id');
    if (error) throw error;
    removed += data?.length ?? 0;
  }

  return { added, updated, removed };
}

async function fetchCalendarChanges(
  accessToken: string,
  calendarId: string,
  syncToken: string | null,
) {
  const items: GoogleCalendarEvent[] = [];
  let pageToken: string | null = null;
  let nextSyncToken: string | null = null;
  let pageCount = 0;

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.searchParams.set('maxResults', '2500');
    url.searchParams.set('showDeleted', 'true');
    url.searchParams.set('singleEvents', 'true');
    if (syncToken) {
      url.searchParams.set('syncToken', syncToken);
    } else {
      const timeMin = new Date(Date.now() - FULL_SYNC_PAST_DAYS * 86_400_000);
      const timeMax = new Date(Date.now() + FULL_SYNC_FUTURE_DAYS * 86_400_000);
      url.searchParams.set('timeMin', timeMin.toISOString());
      url.searchParams.set('timeMax', timeMax.toISOString());
    }
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await googleJson<{
      items?: GoogleCalendarEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    }>(url.toString(), accessToken);
    items.push(...(response.items ?? []));
    pageToken = response.nextPageToken ?? null;
    nextSyncToken = response.nextSyncToken ?? nextSyncToken;
    pageCount += 1;
  } while (pageToken && pageCount < 20);

  if (pageToken) throw new Error('This Google calendar is too large to sync safely in one request.');
  return { items, nextSyncToken };
}

async function syncConnection(connection: ConnectionRow, force: boolean) {
  await ensureGroupMembership(connection.user_id, connection.destination_group_id);

  const lastSyncedAt = connection.last_synced_at
    ? new Date(connection.last_synced_at).getTime()
    : 0;
  if (!force && Date.now() - lastSyncedAt < AUTO_SYNC_THROTTLE_MS) {
    return { ...connectionStatus(connection), added: 0, updated: 0, removed: 0, skipped: true };
  }

  const attemptedAt = new Date().toISOString();
  await admin
    .from('google_calendar_connections')
    .update({ last_attempted_at: attemptedAt, updated_at: attemptedAt })
    .eq('user_id', connection.user_id);

  try {
    const accessToken = await validAccessToken(connection);
    const calendars = await fetchGoogleCalendars(accessToken);
    const calendarsById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
    const selected = connection.selected_calendar_ids.filter((id) => calendarsById.has(id));
    if (!selected.length) throw new Error('Choose at least one Google calendar in Settings.');

    const nextTokens = { ...(connection.sync_tokens ?? {}) };
    let added = 0;
    let updated = 0;
    let removed = 0;

    for (const calendarId of selected) {
      const calendar = calendarsById.get(calendarId)!;
      let currentSyncToken = nextTokens[calendarId] ?? null;
      let changes;

      try {
        changes = await fetchCalendarChanges(accessToken, calendarId, currentSyncToken);
      } catch (error) {
        if ((error as { status?: number }).status !== 410 || !currentSyncToken) throw error;
        currentSyncToken = null;
        delete nextTokens[calendarId];
        changes = await fetchCalendarChanges(accessToken, calendarId, null);
      }

      const result = await applyGoogleEvents(
        connection.user_id,
        connection.destination_group_id,
        calendar,
        changes.items,
      );
      added += result.added;
      updated += result.updated;
      removed += result.removed;
      if (changes.nextSyncToken) nextTokens[calendarId] = changes.nextSyncToken;
    }

    const syncedAt = new Date().toISOString();
    const { data, error } = await admin
      .from('google_calendar_connections')
      .update({
        available_calendars: calendars,
        selected_calendar_ids: selected,
        sync_tokens: nextTokens,
        last_synced_at: syncedAt,
        last_error: null,
        updated_at: syncedAt,
      })
      .eq('user_id', connection.user_id)
      .select('*')
      .single();
    if (error) throw error;

    return {
      ...connectionStatus(data as ConnectionRow),
      added,
      updated,
      removed,
      skipped: false,
    };
  } catch (error) {
    const message = safeMessage(error).slice(0, 500);
    await admin
      .from('google_calendar_connections')
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq('user_id', connection.user_id);
    throw new Error(message);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return fail(405, 'Method not allowed.');

  try {
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase function environment is incomplete.');
    const user = await authenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'status') {
      return ok(connectionStatus(await loadConnection(user.id)));
    }

    if (action === 'connect') {
      const destinationGroupId = typeof body.destinationGroupId === 'string'
        ? body.destinationGroupId
        : '';
      const providerAccessToken = typeof body.providerAccessToken === 'string'
        ? body.providerAccessToken
        : '';
      const providerRefreshToken = typeof body.providerRefreshToken === 'string'
        ? body.providerRefreshToken
        : null;
      if (!providerAccessToken) throw new Error('Google did not grant Calendar access.');
      await ensureGroupMembership(user.id, destinationGroupId);

      const identity = await googleJson<{ email?: string }>(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        providerAccessToken,
      );
      if (!identity.email) throw new Error('Google did not return an email address.');
      if (user.email && identity.email.toLowerCase() !== user.email.toLowerCase()) {
        throw new Error('Choose the same Google account you use to sign in to Planado.');
      }

      const calendars = await fetchGoogleCalendars(providerAccessToken);
      const existing = await loadConnection(user.id);
      const availableIds = new Set(calendars.map((calendar) => calendar.id));
      const previousSelection = (existing?.selected_calendar_ids ?? []).filter((id) => availableIds.has(id));
      const primaryId = calendars.find((calendar) => calendar.primary)?.id ?? calendars[0].id;
      const selectedCalendarIds = previousSelection.length ? previousSelection : [primaryId];
      const encryptedRefreshToken = providerRefreshToken
        ? await encryptToken(providerRefreshToken)
        : existing?.refresh_token_ciphertext ?? null;
      if (!encryptedRefreshToken) {
        throw new Error('Long-term Google permission was not granted. Try connecting again and approve access.');
      }

      const now = new Date().toISOString();
      if (existing && existing.destination_group_id !== destinationGroupId) {
        const { error: moveError } = await admin
          .from('events')
          .update({ group_id: destinationGroupId, updated_at: now })
          .eq('created_by', user.id)
          .eq('external_source', GOOGLE_SOURCE);
        if (moveError) throw moveError;
      }
      const { data, error } = await admin
        .from('google_calendar_connections')
        .upsert({
          user_id: user.id,
          google_email: identity.email,
          destination_group_id: destinationGroupId,
          selected_calendar_ids: selectedCalendarIds,
          available_calendars: calendars,
          sync_tokens: existing?.sync_tokens ?? {},
          access_token_ciphertext: await encryptToken(providerAccessToken),
          refresh_token_ciphertext: encryptedRefreshToken,
          access_token_expires_at: new Date(Date.now() + 50 * 60 * 1000).toISOString(),
          connected_at: existing?.connected_at ?? now,
          last_error: null,
          updated_at: now,
        }, { onConflict: 'user_id' })
        .select('*')
        .single();
      if (error) throw error;
      return ok(connectionStatus(data as ConnectionRow));
    }

    if (action === 'update-settings') {
      const connection = await loadConnection(user.id);
      if (!connection) throw new Error('Connect Google Calendar first.');
      const destinationGroupId = typeof body.destinationGroupId === 'string'
        ? body.destinationGroupId
        : '';
      const selectedCalendarIds = Array.isArray(body.selectedCalendarIds)
        ? [...new Set(body.selectedCalendarIds.filter((id: unknown) => typeof id === 'string'))]
        : [];
      if (!selectedCalendarIds.length) throw new Error('Choose at least one Google calendar.');
      await ensureGroupMembership(user.id, destinationGroupId);

      const availableIds = new Set((connection.available_calendars ?? []).map((calendar) => calendar.id));
      if (selectedCalendarIds.some((id) => !availableIds.has(id))) {
        throw new Error('One of the selected Google calendars is no longer available. Refresh and try again.');
      }

      const removedCalendarIds = connection.selected_calendar_ids.filter(
        (id) => !selectedCalendarIds.includes(id),
      );
      if (removedCalendarIds.length) {
        const removedCalendarKeys = await Promise.all(
          removedCalendarIds.map((id) => externalCalendarId(id)),
        );
        const { error } = await admin
          .from('events')
          .delete()
          .eq('created_by', user.id)
          .eq('external_source', GOOGLE_SOURCE)
          .in('external_calendar_id', removedCalendarKeys);
        if (error) throw error;
      }

      if (connection.destination_group_id !== destinationGroupId) {
        const selectedCalendarKeys = await Promise.all(
          selectedCalendarIds.map((id) => externalCalendarId(id)),
        );
        const { error } = await admin
          .from('events')
          .update({ group_id: destinationGroupId, updated_at: new Date().toISOString() })
          .eq('created_by', user.id)
          .eq('external_source', GOOGLE_SOURCE)
          .in('external_calendar_id', selectedCalendarKeys);
        if (error) throw error;
      }

      const { data, error } = await admin
        .from('google_calendar_connections')
        .update({
          destination_group_id: destinationGroupId,
          selected_calendar_ids: selectedCalendarIds,
          sync_tokens: {},
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select('*')
        .single();
      if (error) throw error;
      return ok(connectionStatus(data as ConnectionRow));
    }

    if (action === 'sync') {
      const connection = await loadConnection(user.id);
      if (!connection) return ok({ ...connectionStatus(null), added: 0, updated: 0, removed: 0, skipped: true });
      return ok(await syncConnection(connection, body.force === true));
    }

    if (action === 'disconnect') {
      const removeImportedEvents = body.removeImportedEvents === true;
      let removed = 0;
      if (removeImportedEvents) {
        const { data, error } = await admin
          .from('events')
          .delete()
          .eq('created_by', user.id)
          .eq('external_source', GOOGLE_SOURCE)
          .select('id');
        if (error) throw error;
        removed = data?.length ?? 0;
      }

      const { error } = await admin
        .from('google_calendar_connections')
        .delete()
        .eq('user_id', user.id);
      if (error) throw error;
      return ok({ disconnected: true, removed });
    }

    return fail(400, 'Unknown Google Calendar action.');
  } catch (error) {
    return fail(400, safeMessage(error));
  }
});
