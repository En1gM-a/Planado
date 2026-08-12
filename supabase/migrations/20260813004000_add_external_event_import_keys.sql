begin;

alter table public.events
  add column if not exists external_source text,
  add column if not exists external_id text;

alter table public.events
  drop constraint if exists events_external_source_length,
  add constraint events_external_source_length check (
    external_source is null or char_length(external_source) between 1 and 60
  ),
  drop constraint if exists events_external_id_length,
  add constraint events_external_id_length check (
    external_id is null or char_length(external_id) between 1 and 240
  ),
  drop constraint if exists events_external_pair_check,
  add constraint events_external_pair_check check (
    (external_source is null and external_id is null)
    or (external_source is not null and external_id is not null)
  );

create unique index if not exists events_external_import_unique
on public.events(created_by, external_source, external_id);

comment on column public.events.external_source is
  'Optional identifier for an approved external schedule source. Never stores credentials or session tokens.';
comment on column public.events.external_id is
  'Stable source event identifier used to update imports without creating duplicates.';

commit;
