begin;

alter table public.events
  add column if not exists external_calendar_id text;

alter table public.events
  drop constraint if exists events_external_calendar_id_length,
  add constraint events_external_calendar_id_length check (
    external_calendar_id is null or char_length(external_calendar_id) = 64
  );

create index if not exists events_external_calendar_lookup
on public.events(created_by, external_source, external_calendar_id);

comment on column public.events.external_calendar_id is
  'SHA-256 calendar identifier for an imported external event. Never contains credentials or authorization tokens.';

create table if not exists public.google_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text not null,
  destination_group_id uuid not null references public.groups(id) on delete cascade,
  selected_calendar_ids text[] not null default array[]::text[],
  available_calendars jsonb not null default '[]'::jsonb,
  sync_tokens jsonb not null default '{}'::jsonb,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  access_token_expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  last_attempted_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint google_calendar_connections_email_length
    check (char_length(google_email) between 3 and 320),
  constraint google_calendar_connections_calendar_limit
    check (cardinality(selected_calendar_ids) <= 50),
  constraint google_calendar_connections_available_shape
    check (jsonb_typeof(available_calendars) = 'array'),
  constraint google_calendar_connections_sync_tokens_shape
    check (jsonb_typeof(sync_tokens) = 'object')
);

alter table public.google_calendar_connections enable row level security;

-- Calendar provider tokens are encrypted by the Edge Function. App users never
-- receive direct table access, even to their own row; all access goes through
-- the authenticated google-calendar function.
revoke all on public.google_calendar_connections from public, anon, authenticated;
grant all on public.google_calendar_connections to service_role;

comment on table public.google_calendar_connections is
  'Server-only Google Calendar connection metadata and encrypted OAuth tokens.';
comment on column public.google_calendar_connections.access_token_ciphertext is
  'AES-GCM encrypted Google access token. Decryption key exists only in Edge Function secrets.';
comment on column public.google_calendar_connections.refresh_token_ciphertext is
  'AES-GCM encrypted Google refresh token. Never expose through the Data API.';

commit;
