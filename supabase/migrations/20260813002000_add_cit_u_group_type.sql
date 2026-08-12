begin;

alter table public.groups
  add column if not exists group_type text not null default 'general';

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'groups_group_type_check'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_group_type_check
      check (group_type in ('general', 'cit_u_classmates'));
  end if;
end;
$$;

create or replace function public.create_group_with_type(
  p_name text,
  p_description text default null,
  p_timezone text default 'Asia/Taipei',
  p_member_color text default '#4F7CFF',
  p_group_type text default 'general'
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

  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'Group name must contain 1 to 80 characters';
  end if;

  if pg_catalog.char_length(coalesce(p_description, '')) > 500 then
    raise exception 'Group description must contain 500 characters or fewer';
  end if;

  if p_member_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid member color';
  end if;

  if p_group_type not in ('general', 'cit_u_classmates') then
    raise exception 'Invalid group type';
  end if;

  insert into public.groups (name, description, timezone, group_type, created_by)
  values (
    pg_catalog.btrim(p_name),
    nullif(pg_catalog.btrim(p_description), ''),
    p_timezone,
    p_group_type,
    current_user_id
  )
  returning * into new_group;

  insert into public.group_members (group_id, user_id, role, color)
  values (new_group.id, current_user_id, 'owner', pg_catalog.upper(p_member_color));

  return new_group;
end;
$$;

revoke all on function public.create_group_with_type(text, text, text, text, text) from public, anon;
grant execute on function public.create_group_with_type(text, text, text, text, text) to authenticated;

commit;
