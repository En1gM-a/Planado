-- Fix invite generation inside a SECURITY DEFINER function with an empty search path.
-- Use PostgreSQL catalog functions so code generation does not depend on the
-- schema where pgcrypto happens to be installed.

begin;

create or replace function public.create_group_invite(
  p_group_id uuid,
  p_max_uses integer default null,
  p_expires_at timestamptz default null
)
returns public.group_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_invite public.group_invites;
  new_code text;
  attempts integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_group_admin(p_group_id, auth.uid()) then
    raise exception 'Only group creators and admins can create invites';
  end if;

  if p_max_uses is not null and p_max_uses <= 0 then
    raise exception 'max_uses must be greater than zero';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Expiration must be in the future';
  end if;

  loop
    attempts := attempts + 1;
    new_code := upper(substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1
      from public.group_invites invite
      where invite.code = new_code
    );

    if attempts >= 10 then
      raise exception 'Could not generate a unique invite code';
    end if;
  end loop;

  insert into public.group_invites (group_id, code, created_by, max_uses, expires_at)
  values (p_group_id, new_code, auth.uid(), p_max_uses, p_expires_at)
  returning * into new_invite;

  return new_invite;
end;
$$;

revoke all on function public.create_group_invite(uuid, integer, timestamptz) from public, anon;
grant execute on function public.create_group_invite(uuid, integer, timestamptz) to authenticated;

commit;
