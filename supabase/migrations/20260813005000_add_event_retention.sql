-- Keep normal events as history unless their creator explicitly chooses
-- temporary retention. Imported class meetings expire one day after ending.

begin;

create extension if not exists pg_cron with schema pg_catalog;

alter table public.events
  add column if not exists retention_policy text not null default 'permanent',
  add column if not exists delete_after timestamptz;

alter table public.events
  drop constraint if exists events_retention_policy_check,
  add constraint events_retention_policy_check check (
    retention_policy in ('permanent', 'temporary', 'class_schedule')
  );

create or replace function public.set_event_delete_after()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.delete_after := case new.retention_policy
    when 'temporary' then new.end_time + interval '7 days'
    when 'class_schedule' then new.end_time + interval '1 day'
    else null
  end;
  return new;
end;
$$;

drop trigger if exists set_event_delete_after on public.events;
create trigger set_event_delete_after
before insert or update on public.events
for each row execute function public.set_event_delete_after();

-- Preserve all existing manually created events. Only recognized Wildcat
-- imports receive the class schedule retention policy during migration.
update public.events
set retention_policy = 'class_schedule'
where external_source = 'wildcat_one';

update public.events
set delete_after = case retention_policy
  when 'temporary' then end_time + interval '7 days'
  when 'class_schedule' then end_time + interval '1 day'
  else null
end;

create index if not exists events_delete_after_idx
on public.events(delete_after)
where delete_after is not null;

create or replace function public.delete_expired_events()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  delete from public.events
  where delete_after is not null
    and delete_after <= now();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_expired_events() from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'planado-delete-expired-events';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'planado-delete-expired-events',
    '23 * * * *',
    'select public.delete_expired_events();'
  );
end;
$$;

comment on column public.events.retention_policy is
  'permanent keeps history, temporary deletes seven days after ending, class_schedule deletes one day after ending.';
comment on column public.events.delete_after is
  'Server-calculated deletion deadline. Null means the event is permanent.';

commit;
