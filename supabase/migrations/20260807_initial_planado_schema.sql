-- Planado complete Supabase schema
-- Run this once in a NEW Supabase project: Dashboard -> SQL Editor -> New query.
-- This creates the database, RLS policies, RPC functions, Storage buckets,
-- and Realtime publication entries used by the Planado mobile application.

begin;

create extension if not exists pgcrypto;

-- Keep SECURITY DEFINER authorization helpers outside the exposed public schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ============================================================
-- TABLES
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  bio text,
  timezone text not null default 'Asia/Taipei',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username = lower(username)
    and username ~ '^[a-z0-9._]{3,30}$'
  ),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 60),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 300)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  timezone text not null default 'Asia/Taipei',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_name_length check (char_length(trim(name)) between 1 and 80),
  constraint groups_description_length check (description is null or char_length(description) <= 500)
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  color text not null default '#4F7CFF',
  nickname text,
  joined_at timestamptz not null default now(),
  constraint group_members_group_user_unique unique (group_id, user_id),
  constraint group_members_role_check check (role in ('owner', 'admin', 'member')),
  constraint group_members_color_check check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint group_members_nickname_length check (nickname is null or char_length(nickname) <= 60)
);

-- A partial unique index guarantees exactly zero or one owner per group.
create unique index group_members_one_owner_per_group
  on public.group_members(group_id)
  where role = 'owner';

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  max_uses integer,
  use_count integer not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint group_invites_code_format check (code ~ '^[A-Z0-9]{6,12}$'),
  constraint group_invites_max_uses_positive check (max_uses is null or max_uses > 0),
  constraint group_invites_use_count_nonnegative check (use_count >= 0),
  constraint group_invites_use_limit check (max_uses is null or use_count <= max_uses)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text,
  location text,
  category text not null default 'other',
  start_time timestamptz not null,
  end_time timestamptz not null,
  is_all_day boolean not null default false,
  color text,
  visibility text not null default 'group',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_length check (char_length(trim(title)) between 1 and 120),
  constraint events_description_length check (description is null or char_length(description) <= 5000),
  constraint events_location_length check (location is null or char_length(location) <= 300),
  constraint events_category_check check (
    category in ('hangout', 'birthday', 'school', 'work', 'study', 'gym', 'trip', 'deadline', 'personal', 'other')
  ),
  constraint events_time_order check (end_time >= start_time),
  constraint events_color_check check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint events_visibility_check check (visibility in ('group', 'private')),
  constraint events_status_check check (status in ('active', 'cancelled'))
);

create table public.event_responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null,
  responded_at timestamptz not null default now(),
  constraint event_responses_event_user_unique unique (event_id, user_id),
  constraint event_responses_response_check check (response in ('going', 'maybe', 'declined'))
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (
    type in ('group_invite', 'member_joined', 'event_created', 'event_updated', 'event_cancelled', 'event_reminder')
  ),
  constraint notifications_title_length check (char_length(title) between 1 and 120),
  constraint notifications_message_length check (char_length(message) between 1 and 1000),
  constraint notifications_data_object check (jsonb_typeof(data) = 'object')
);

create table public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null,
  device_name text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_devices_platform_check check (platform in ('ios', 'android', 'web'))
);

create table public.ai_summaries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  period_type text not null,
  period_start date not null,
  period_end date not null,
  summary text not null,
  statistics jsonb not null default '{}'::jsonb,
  model text,
  generated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ai_summaries_period_unique unique (group_id, period_type, period_start, period_end),
  constraint ai_summaries_period_type_check check (period_type in ('weekly', 'monthly', 'yearly')),
  constraint ai_summaries_period_order check (period_end >= period_start),
  constraint ai_summaries_statistics_object check (jsonb_typeof(statistics) = 'object')
);

-- ============================================================
-- INDEXES
-- ============================================================

create index groups_created_by_idx on public.groups(created_by);
create index group_members_user_id_idx on public.group_members(user_id);
create index group_members_group_id_idx on public.group_members(group_id);
create index group_invites_group_id_idx on public.group_invites(group_id);
create index group_invites_active_code_idx on public.group_invites(code) where is_active;
create index events_group_start_idx on public.events(group_id, start_time);
create index events_created_by_idx on public.events(created_by);
create index events_group_status_idx on public.events(group_id, status);
create index event_responses_user_id_idx on public.event_responses(user_id);
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications(user_id) where read_at is null;
create index user_devices_user_id_idx on public.user_devices(user_id);
create index ai_summaries_group_period_idx on public.ai_summaries(group_id, period_start, period_end);

-- ============================================================
-- GENERIC TRIGGERS
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger groups_set_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

-- Create the public profile whenever Supabase Auth creates a user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  safe_username text;
  requested_name text;
begin
  requested_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  safe_username := regexp_replace(requested_username, '[^a-z0-9._]', '', 'g');

  if char_length(safe_username) < 3
     or exists (select 1 from public.profiles p where p.username = safe_username) then
    safe_username := 'user_' || left(replace(new.id::text, '-', ''), 12);
  end if;

  requested_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    safe_username,
    coalesce(requested_name, split_part(coalesce(new.email, safe_username), '@', 1))
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- PRIVATE AUTHORIZATION HELPERS (prevent recursive RLS policies)
-- ============================================================

create or replace function private.is_group_member(
  p_group_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
  );
$$;

create or replace function private.is_group_admin(
  p_group_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.role in ('owner', 'admin')
  );
$$;

create or replace function private.shares_group(
  p_first_user uuid,
  p_second_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_first_user = p_second_user or exists (
    select 1
    from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = p_first_user
      and b.user_id = p_second_user
  );
$$;

revoke all on function private.is_group_member(uuid, uuid) from public;
revoke all on function private.is_group_admin(uuid, uuid) from public;
revoke all on function private.shares_group(uuid, uuid) from public;
grant execute on function private.is_group_member(uuid, uuid) to authenticated;
grant execute on function private.is_group_admin(uuid, uuid) to authenticated;
grant execute on function private.shares_group(uuid, uuid) to authenticated;

-- ============================================================
-- PUBLIC RPC FUNCTIONS
-- ============================================================

create or replace function public.create_group(
  p_name text,
  p_description text default null,
  p_timezone text default 'Asia/Taipei',
  p_member_color text default '#4F7CFF'
)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_group public.groups;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if char_length(trim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'Group name must contain 1 to 80 characters';
  end if;

  if p_member_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid member color';
  end if;

  insert into public.groups (name, description, timezone, created_by)
  values (trim(p_name), nullif(trim(p_description), ''), p_timezone, current_user_id)
  returning * into new_group;

  insert into public.group_members (group_id, user_id, role, color)
  values (new_group.id, current_user_id, 'owner', upper(p_member_color));

  return new_group;
end;
$$;

create or replace function public.create_group_invite(
  p_group_id uuid,
  p_max_uses integer default null,
  p_expires_at timestamptz default null
)
returns public.group_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_invite public.group_invites;
  new_code text;
  attempts integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_group_admin(p_group_id, auth.uid()) then
    raise exception 'Only group owners and admins can create invites';
  end if;

  if p_max_uses is not null and p_max_uses <= 0 then
    raise exception 'max_uses must be greater than zero';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Expiration must be in the future';
  end if;

  loop
    attempts := attempts + 1;
    new_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    exit when not exists (select 1 from public.group_invites gi where gi.code = new_code);
    if attempts >= 10 then
      raise exception 'Could not generate a unique invite code';
    end if;
  end loop;

  insert into public.group_invites (group_id, code, created_by, max_uses, expires_at)
  values (p_group_id, new_code, auth.uid(), p_max_uses, p_expires_at)
  returning * into new_invite;

  return new_invite;
end;
$$;

create or replace function public.join_group_by_code(
  p_code text,
  p_color text default '#22C55E'
)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_invite public.group_invites;
  joined_group public.groups;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid member color';
  end if;

  select * into matched_invite
  from public.group_invites gi
  where gi.code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'Invalid invite code';
  end if;

  if not matched_invite.is_active then
    raise exception 'This invite is no longer active';
  end if;

  if matched_invite.expires_at is not null and matched_invite.expires_at <= now() then
    raise exception 'This invite has expired';
  end if;

  if matched_invite.max_uses is not null
     and matched_invite.use_count >= matched_invite.max_uses then
    raise exception 'This invite has reached its usage limit';
  end if;

  if not private.is_group_member(matched_invite.group_id, current_user_id) then
    insert into public.group_members (group_id, user_id, role, color)
    values (matched_invite.group_id, current_user_id, 'member', upper(p_color));

    update public.group_invites
    set use_count = use_count + 1,
        is_active = case
          when max_uses is not null and use_count + 1 >= max_uses then false
          else is_active
        end
    where id = matched_invite.id;
  end if;

  select * into joined_group
  from public.groups g
  where g.id = matched_invite.group_id;

  return joined_group;
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select gm.role into current_role
  from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = auth.uid();

  if current_role is null then
    raise exception 'You are not a member of this group';
  end if;

  if current_role = 'owner' then
    raise exception 'Transfer ownership or delete the group before leaving';
  end if;

  delete from public.group_members
  where group_id = p_group_id and user_id = auth.uid();
end;
$$;

create or replace function public.transfer_group_ownership(
  p_group_id uuid,
  p_new_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
  ) then
    raise exception 'Only the current owner can transfer ownership';
  end if;

  if not private.is_group_member(p_group_id, p_new_owner_id) then
    raise exception 'The new owner must already be a group member';
  end if;

  -- Defer the unique owner index conflict by temporarily demoting the old owner.
  update public.group_members
  set role = 'admin'
  where group_id = p_group_id and user_id = auth.uid();

  update public.group_members
  set role = 'owner'
  where group_id = p_group_id and user_id = p_new_owner_id;

  update public.groups
  set created_by = p_new_owner_id
  where id = p_group_id;
end;
$$;

revoke all on function public.create_group(text, text, text, text) from public;
revoke all on function public.create_group_invite(uuid, integer, timestamptz) from public;
revoke all on function public.join_group_by_code(text, text) from public;
revoke all on function public.leave_group(uuid) from public;
revoke all on function public.transfer_group_ownership(uuid, uuid) from public;
grant execute on function public.create_group(text, text, text, text) to authenticated;
grant execute on function public.create_group_invite(uuid, integer, timestamptz) to authenticated;
grant execute on function public.join_group_by_code(text, text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.events enable row level security;
alter table public.event_responses enable row level security;
alter table public.notifications enable row level security;
alter table public.user_devices enable row level security;
alter table public.ai_summaries enable row level security;

create policy "profiles_select_shared_groups"
on public.profiles for select to authenticated
using ((select private.shares_group((select auth.uid()), id)));

create policy "profiles_update_own"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "groups_select_members"
on public.groups for select to authenticated
using ((select private.is_group_member(id, (select auth.uid()))));

create policy "groups_update_admins"
on public.groups for update to authenticated
using ((select private.is_group_admin(id, (select auth.uid()))))
with check ((select private.is_group_admin(id, (select auth.uid()))));

create policy "groups_delete_owner"
on public.groups for delete to authenticated
using (
  exists (
    select 1 from public.group_members gm
    where gm.group_id = groups.id
      and gm.user_id = (select auth.uid())
      and gm.role = 'owner'
  )
);

create policy "group_members_select_members"
on public.group_members for select to authenticated
using ((select private.is_group_member(group_id, (select auth.uid()))));

-- Membership inserts happen through create_group() and join_group_by_code().
create policy "group_members_update_admins"
on public.group_members for update to authenticated
using ((select private.is_group_admin(group_id, (select auth.uid()))))
with check (
  (select private.is_group_admin(group_id, (select auth.uid())))
  and user_id <> (select auth.uid())
  and role <> 'owner'
);

create policy "group_members_delete_admin_or_self"
on public.group_members for delete to authenticated
using (
  (user_id = (select auth.uid()) and role <> 'owner')
  or (
    (select private.is_group_admin(group_id, (select auth.uid())))
    and role <> 'owner'
    and user_id <> (select auth.uid())
  )
);

create policy "group_invites_select_admins"
on public.group_invites for select to authenticated
using ((select private.is_group_admin(group_id, (select auth.uid()))));

create policy "group_invites_insert_admins"
on public.group_invites for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.is_group_admin(group_id, (select auth.uid())))
);

create policy "group_invites_update_admins"
on public.group_invites for update to authenticated
using ((select private.is_group_admin(group_id, (select auth.uid()))))
with check ((select private.is_group_admin(group_id, (select auth.uid()))));

create policy "group_invites_delete_admins"
on public.group_invites for delete to authenticated
using ((select private.is_group_admin(group_id, (select auth.uid()))));

create policy "events_select_members"
on public.events for select to authenticated
using (
  (select private.is_group_member(group_id, (select auth.uid())))
  and (visibility = 'group' or created_by = (select auth.uid()))
);

create policy "events_insert_members"
on public.events for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.is_group_member(group_id, (select auth.uid())))
);

create policy "events_update_creator_or_admin"
on public.events for update to authenticated
using (
  created_by = (select auth.uid())
  or (select private.is_group_admin(group_id, (select auth.uid())))
)
with check (
  (select private.is_group_member(group_id, (select auth.uid())))
  and (
    created_by = (select auth.uid())
    or (select private.is_group_admin(group_id, (select auth.uid())))
  )
);

create policy "events_delete_creator_or_admin"
on public.events for delete to authenticated
using (
  created_by = (select auth.uid())
  or (select private.is_group_admin(group_id, (select auth.uid())))
);

create policy "event_responses_select_group_members"
on public.event_responses for select to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_responses.event_id
      and (select private.is_group_member(e.group_id, (select auth.uid())))
      and (e.visibility = 'group' or e.created_by = (select auth.uid()))
  )
);

create policy "event_responses_insert_own"
on public.event_responses for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.events e
    where e.id = event_responses.event_id
      and (select private.is_group_member(e.group_id, (select auth.uid())))
      and (e.visibility = 'group' or e.created_by = (select auth.uid()))
  )
);

create policy "event_responses_update_own"
on public.event_responses for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "event_responses_delete_own"
on public.event_responses for delete to authenticated
using (user_id = (select auth.uid()));

create policy "notifications_select_own"
on public.notifications for select to authenticated
using (user_id = (select auth.uid()));

create policy "notifications_update_own"
on public.notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "notifications_delete_own"
on public.notifications for delete to authenticated
using (user_id = (select auth.uid()));

create policy "user_devices_select_own"
on public.user_devices for select to authenticated
using (user_id = (select auth.uid()));

create policy "user_devices_insert_own"
on public.user_devices for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "user_devices_update_own"
on public.user_devices for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "user_devices_delete_own"
on public.user_devices for delete to authenticated
using (user_id = (select auth.uid()));

create policy "ai_summaries_select_group_members"
on public.ai_summaries for select to authenticated
using ((select private.is_group_member(group_id, (select auth.uid()))));

-- AI summary writes and notification inserts should use a trusted Edge Function
-- with the service-role key, which bypasses RLS. Never ship that key in the app.

-- ============================================================
-- TABLE GRANTS
-- ============================================================

grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, update, delete on public.groups to authenticated;
grant select, update, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.group_invites to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.event_responses to authenticated;
grant select, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.user_devices to authenticated;
grant select on public.ai_summaries to authenticated;

-- ============================================================
-- STORAGE BUCKETS AND POLICIES
-- Folder conventions:
-- avatars/{user_id}/filename.ext
-- group-images/{group_id}/filename.ext
-- event-attachments/{group_id}/{event_id}/filename.ext
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('group-images', 'group-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('event-attachments', 'event-attachments', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "avatars_insert_own_folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "avatars_update_own_objects"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text)
with check (
  bucket_id = 'avatars'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "avatars_delete_own_objects"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);

create policy "group_images_select_members"
on storage.objects for select to authenticated
using (
  bucket_id = 'group-images'
  and (select private.is_group_member(((storage.foldername(name))[1])::uuid, (select auth.uid())))
);

create policy "group_images_insert_admins"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'group-images'
  and (select private.is_group_admin(((storage.foldername(name))[1])::uuid, (select auth.uid())))
);

create policy "group_images_update_admins"
on storage.objects for update to authenticated
using (
  bucket_id = 'group-images'
  and (select private.is_group_admin(((storage.foldername(name))[1])::uuid, (select auth.uid())))
)
with check (
  bucket_id = 'group-images'
  and (select private.is_group_admin(((storage.foldername(name))[1])::uuid, (select auth.uid())))
);

create policy "group_images_delete_admins"
on storage.objects for delete to authenticated
using (
  bucket_id = 'group-images'
  and (select private.is_group_admin(((storage.foldername(name))[1])::uuid, (select auth.uid())))
);

create policy "event_attachments_select_members"
on storage.objects for select to authenticated
using (
  bucket_id = 'event-attachments'
  and (select private.is_group_member(((storage.foldername(name))[1])::uuid, (select auth.uid())))
);

create policy "event_attachments_insert_members"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-attachments'
  and (select private.is_group_member(((storage.foldername(name))[1])::uuid, (select auth.uid())))
);

create policy "event_attachments_update_owner_or_admin"
on storage.objects for update to authenticated
using (
  bucket_id = 'event-attachments'
  and (
    owner_id = (select auth.uid())::text
    or (select private.is_group_admin(((storage.foldername(name))[1])::uuid, (select auth.uid())))
  )
)
with check (
  bucket_id = 'event-attachments'
  and (select private.is_group_member(((storage.foldername(name))[1])::uuid, (select auth.uid())))
);

create policy "event_attachments_delete_owner_or_admin"
on storage.objects for delete to authenticated
using (
  bucket_id = 'event-attachments'
  and (
    owner_id = (select auth.uid())::text
    or (select private.is_group_admin(((storage.foldername(name))[1])::uuid, (select auth.uid())))
  )
);

-- ============================================================
-- REALTIME
-- ============================================================

alter table public.events replica identity full;
alter table public.event_responses replica identity full;
alter table public.group_members replica identity full;
alter table public.notifications replica identity full;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['events', 'event_responses', 'group_members', 'notifications']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

commit;

-- End of Planado schema.
