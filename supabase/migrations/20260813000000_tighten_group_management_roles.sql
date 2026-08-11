-- Enforce Planado's group management hierarchy:
-- owner: manage roles, remove admins/members, delete group
-- admin: remove regular members, manage invite codes
-- member: view group and leave voluntarily

begin;

create or replace function private.group_role(p_group_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.group_members
  where group_id = p_group_id and user_id = p_user_id
  limit 1;
$$;

revoke all on function private.group_role(uuid, uuid) from public, anon;
grant execute on function private.group_role(uuid, uuid) to authenticated;

drop policy if exists "group_members_update_admins" on public.group_members;
create policy "group_members_update_owner"
on public.group_members for update to authenticated
using (
  (select private.group_role(group_id, (select auth.uid()))) = 'owner'
  and user_id <> (select auth.uid())
  and role <> 'owner'
)
with check (
  (select private.group_role(group_id, (select auth.uid()))) = 'owner'
  and user_id <> (select auth.uid())
  and role in ('admin', 'member')
);

drop policy if exists "group_members_delete_admin_or_self" on public.group_members;
create policy "group_members_delete_by_hierarchy_or_self"
on public.group_members for delete to authenticated
using (
  (user_id = (select auth.uid()) and role <> 'owner')
  or (
    (select private.group_role(group_id, (select auth.uid()))) = 'owner'
    and user_id <> (select auth.uid())
    and role <> 'owner'
  )
  or (
    (select private.group_role(group_id, (select auth.uid()))) = 'admin'
    and user_id <> (select auth.uid())
    and role = 'member'
  )
);

commit;
