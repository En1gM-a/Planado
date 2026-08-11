-- Generate Planado notifications from group and event activity.

begin;

create or replace function public.notify_group_member_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_name text;
  group_name text;
begin
  select display_name into member_name
  from public.profiles
  where id = new.user_id;

  select name into group_name
  from public.groups
  where id = new.group_id;

  insert into public.notifications (user_id, group_id, type, title, message, data)
  select
    membership.user_id,
    new.group_id,
    'member_joined',
    'New member in ' || coalesce(group_name, 'your group'),
    coalesce(member_name, 'Someone') || ' joined ' || coalesce(group_name, 'your group') || '.',
    jsonb_build_object('member_id', new.user_id, 'group_id', new.group_id)
  from public.group_members membership
  where membership.group_id = new.group_id
    and membership.user_id <> new.user_id;

  return new;
end;
$$;

drop trigger if exists group_member_joined_notification on public.group_members;
create trigger group_member_joined_notification
after insert on public.group_members
for each row execute function public.notify_group_member_joined();

create or replace function public.notify_event_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_name text;
begin
  select name into group_name
  from public.groups
  where id = new.group_id;

  insert into public.notifications (user_id, group_id, event_id, type, title, message, data)
  select
    membership.user_id,
    new.group_id,
    new.id,
    'event_created',
    'New event: ' || new.title,
    coalesce(group_name, 'Your group') || ' added a new event.',
    jsonb_build_object('event_id', new.id, 'group_id', new.group_id)
  from public.group_members membership
  where membership.group_id = new.group_id
    and membership.user_id <> new.created_by;

  return new;
end;
$$;

drop trigger if exists event_created_notification on public.events;
create trigger event_created_notification
after insert on public.events
for each row execute function public.notify_event_created();

create or replace function public.notify_event_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_name text;
  notification_type text;
  notification_title text;
  notification_message text;
  acting_user uuid;
begin
  if not (
    old.title is distinct from new.title
    or old.description is distinct from new.description
    or old.location is distinct from new.location
    or old.start_time is distinct from new.start_time
    or old.end_time is distinct from new.end_time
    or old.is_all_day is distinct from new.is_all_day
    or old.status is distinct from new.status
  ) then
    return new;
  end if;

  select name into group_name
  from public.groups
  where id = new.group_id;

  if new.status = 'cancelled' and old.status is distinct from new.status then
    notification_type := 'event_cancelled';
    notification_title := 'Event cancelled: ' || new.title;
    notification_message := coalesce(group_name, 'Your group') || ' cancelled this event.';
  else
    notification_type := 'event_updated';
    notification_title := 'Event updated: ' || new.title;
    notification_message := 'The details for this ' || coalesce(group_name, 'group') || ' event changed.';
  end if;

  acting_user := coalesce(auth.uid(), new.created_by);

  insert into public.notifications (user_id, group_id, event_id, type, title, message, data)
  select
    membership.user_id,
    new.group_id,
    new.id,
    notification_type,
    notification_title,
    notification_message,
    jsonb_build_object('event_id', new.id, 'group_id', new.group_id)
  from public.group_members membership
  where membership.group_id = new.group_id
    and membership.user_id <> acting_user;

  return new;
end;
$$;

drop trigger if exists event_changed_notification on public.events;
create trigger event_changed_notification
after update on public.events
for each row execute function public.notify_event_changed();

create unique index if not exists notifications_event_reminder_unique
on public.notifications (user_id, event_id, type)
where type = 'event_reminder';

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

revoke all on function public.notify_group_member_joined() from public, anon, authenticated;
revoke all on function public.notify_event_created() from public, anon, authenticated;
revoke all on function public.notify_event_changed() from public, anon, authenticated;
revoke all on function public.create_upcoming_event_reminders() from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'planado-create-event-reminders';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'planado-create-event-reminders',
    '*/15 * * * *',
    'select public.create_upcoming_event_reminders();'
  );
end;
$$;

commit;
