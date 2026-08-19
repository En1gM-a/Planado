-- Public, non-sensitive release metadata used by the app to announce APKs.
create table if not exists public.app_releases (
  platform text primary key check (platform in ('android', 'ios')),
  latest_build_number integer not null check (latest_build_number > 0),
  minimum_supported_build_number integer not null check (minimum_supported_build_number > 0),
  version_name text not null,
  title text not null default 'A new Planado is ready',
  message text not null default 'Install the latest version for new features and improvements.',
  download_url text not null,
  is_active boolean not null default true,
  released_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_releases_minimum_not_newer_than_latest
    check (minimum_supported_build_number <= latest_build_number)
);

comment on table public.app_releases is
  'Public metadata for native Planado builds that must be installed from a download page.';

alter table public.app_releases enable row level security;

drop policy if exists "Anyone can read active app releases" on public.app_releases;
create policy "Anyone can read active app releases"
  on public.app_releases
  for select
  to anon, authenticated
  using (is_active = true);

revoke all on table public.app_releases from anon, authenticated;
grant select on table public.app_releases to anon, authenticated;

-- Build 1 is the current baseline, so this row does not show an update yet.
insert into public.app_releases (
  platform,
  latest_build_number,
  minimum_supported_build_number,
  version_name,
  title,
  message,
  download_url,
  is_active
)
values (
  'android',
  1,
  1,
  '1.0.0',
  'A new Planado is ready',
  'Install the latest version for new features, fixes, and improvements.',
  'https://expo.dev/accounts/en1gm-a/projects/planado/builds',
  true
)
on conflict (platform) do nothing;

-- For a future required Android release, replace the values and run an update like:
-- update public.app_releases
-- set latest_build_number = 2,
--     minimum_supported_build_number = 2,
--     version_name = '1.1.0',
--     title = 'A major Planado update is ready',
--     message = 'This release includes important improvements and requires a new installation.',
--     download_url = 'PASTE_THE_NEW_EAS_BUILD_LINK_HERE',
--     released_at = now(),
--     updated_at = now(),
--     is_active = true
-- where platform = 'android';
