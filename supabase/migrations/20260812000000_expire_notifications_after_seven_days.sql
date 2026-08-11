-- Automatically delete Planado notifications seven days after creation.
-- Supabase Cron uses pg_cron and evaluates schedules in UTC.

begin;

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.delete_expired_notifications()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  delete from public.notifications
  where created_at < now() - interval '7 days';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_expired_notifications() from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'planado-delete-expired-notifications';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'planado-delete-expired-notifications',
    '17 3 * * *',
    'select public.delete_expired_notifications();'
  );
end;
$$;

commit;
