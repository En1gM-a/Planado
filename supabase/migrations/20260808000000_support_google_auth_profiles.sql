-- Add Google-account profile metadata and first-login onboarding support.
-- Apply after 20260807_initial_planado_schema.sql.

begin;

alter table public.profiles
add column if not exists onboarding_completed boolean not null default false;

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
  requested_avatar text;
begin
  requested_username := lower(
    coalesce(
      new.raw_user_meta_data ->> 'username',
      new.raw_user_meta_data ->> 'preferred_username',
      ''
    )
  );

  safe_username := regexp_replace(
    requested_username,
    '[^a-z0-9._]',
    '',
    'g'
  );

  if char_length(safe_username) < 3
     or exists (
       select 1
       from public.profiles profile
       where profile.username = safe_username
     )
  then
    safe_username := 'user_' || left(replace(new.id::text, '-', ''), 12);
  end if;

  requested_name := nullif(
    trim(
      coalesce(
        new.raw_user_meta_data ->> 'display_name',
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        ''
      )
    ),
    ''
  );

  requested_avatar := nullif(
    trim(
      coalesce(
        new.raw_user_meta_data ->> 'avatar_url',
        new.raw_user_meta_data ->> 'picture',
        ''
      )
    ),
    ''
  );

  insert into public.profiles (
    id,
    username,
    display_name,
    avatar_url,
    onboarding_completed
  )
  values (
    new.id,
    safe_username,
    coalesce(
      requested_name,
      split_part(coalesce(new.email, safe_username), '@', 1)
    ),
    requested_avatar,
    false
  );

  return new;
end;
$$;

commit;
