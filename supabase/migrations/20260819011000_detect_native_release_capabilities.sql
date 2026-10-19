-- Some early Planado preview APKs shared the same Android versionCode even
-- though their native widget implementations differed. A capability marker
-- lets the OTA-delivered update checker distinguish those APKs safely.
alter table public.app_releases
  add column if not exists required_capability text;

comment on column public.app_releases.required_capability is
  'Native capability an installation must expose to be considered current.';

update public.app_releases
set
  latest_build_number = 1,
  minimum_supported_build_number = 1,
  version_name = '1.0.0',
  title = 'A Planado app update is ready',
  message = 'Install the refreshed Planado app to get important-event countdowns, improved widgets, and group editing.',
  download_url = 'https://expo.dev/accounts/en1gm-a/projects/planado/builds/5ca420b8-ea90-4494-9c11-804fbfc8e77f',
  required_capability = 'important_widget_v2',
  released_at = now(),
  updated_at = now(),
  is_active = true
where platform = 'android';
