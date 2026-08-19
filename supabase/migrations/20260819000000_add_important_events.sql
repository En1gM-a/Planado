-- Important events remain visible in a selected group's Android widget until
-- they end. Existing events remain normal events.

begin;

alter table public.events
  add column if not exists is_important boolean not null default false;

create index if not exists events_active_important_group_end_idx
on public.events(group_id, end_time)
where is_important = true and status = 'active';

comment on column public.events.is_important is
  'Pins an active event in the selected group widget until its end_time.';

commit;
