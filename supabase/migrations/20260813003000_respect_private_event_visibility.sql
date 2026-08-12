begin;

drop trigger if exists event_created_notification on public.events;
create trigger event_created_notification
after insert on public.events
for each row
when (new.visibility = 'group')
execute function public.notify_event_created();

drop trigger if exists event_changed_notification on public.events;
create trigger event_changed_notification
after update on public.events
for each row
when (new.visibility = 'group')
execute function public.notify_event_changed();

create or replace function public.create_upcoming_event_reminders()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count bigint;
begin
  insert into public.notifications (user_id, group_id, event_id, type, title, message, data)
  select
    membership.user_id,
    event.group_id,
    event.id,
    'event_reminder',
    'Starting soon: ' || event.title,
    coalesce(group_record.name, 'Your group') || ' has an event starting within the hour.',
    jsonb_build_object('event_id', event.id, 'group_id', event.group_id)
  from public.events event
  join public.groups group_record on group_record.id = event.group_id
  join public.group_members membership on membership.group_id = event.group_id
  where event.status = 'active'
    and event.visibility = 'group'
    and event.start_time > now()
    and event.start_time <= now() + interval '1 hour'
    and not exists (
      select 1
      from public.notifications existing
      where existing.user_id = membership.user_id
        and existing.event_id = event.id
        and existing.type = 'event_reminder'
    )
  on conflict (user_id, event_id, type) where type = 'event_reminder' do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.create_upcoming_event_reminders() from public, anon, authenticated;

commit;
