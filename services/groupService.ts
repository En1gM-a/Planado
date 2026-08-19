import { getCurrentUser } from './authService';
import { supabase } from './supabase';

export type GroupRole = 'owner' | 'admin' | 'member';
export type GroupType = 'general' | 'cit_u_classmates';

export type PlanadoGroup = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  timezone: string;
  group_type: GroupType;
  created_by: string;
  role: GroupRole;
  color: string;
  nickname: string | null;
  joined_at: string;
  member_count: number;
  next_event: {
    id: string;
    title: string;
    start_time: string;
  } | null;
};

export type GroupMember = {
  id: string;
  user_id: string;
  role: GroupRole;
  color: string;
  nickname: string | null;
  joined_at: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
};

export type GroupInvite = {
  id: string;
  group_id: string;
  code: string;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

export type GroupDetails = {
  group: Omit<PlanadoGroup, 'member_count' | 'next_event'>;
  members: GroupMember[];
  invites: GroupInvite[];
  upcoming_events: Array<{
    id: string;
    title: string;
    start_time: string;
    color: string | null;
  }>;
};

export type GroupWidgetEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  is_important: boolean;
};

export type EditableGroup = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  timezone: string;
  group_type: GroupType;
  role: GroupRole;
};

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function getMyGroups(): Promise<PlanadoGroup[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to view groups.');

  const { data: memberships, error: membershipError } = await supabase
    .from('group_members')
    .select(
      'group_id, role, color, nickname, joined_at, groups(id, name, description, image_url, timezone, group_type, created_by)',
    )
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true });

  if (membershipError) throw membershipError;

  const groupIds = (memberships ?? []).map((membership) => membership.group_id);
  if (!groupIds.length) return [];

  const [{ data: memberRows, error: memberError }, { data: eventRows, error: eventError }] =
    await Promise.all([
      supabase.from('group_members').select('group_id').in('group_id', groupIds),
      supabase
        .from('events')
        .select('id, group_id, title, start_time')
        .in('group_id', groupIds)
        .eq('status', 'active')
        .gte('end_time', new Date().toISOString())
        .order('start_time', { ascending: true }),
    ]);

  if (memberError) throw memberError;
  if (eventError) throw eventError;

  const memberCounts = new Map<string, number>();
  for (const row of memberRows ?? []) {
    memberCounts.set(row.group_id, (memberCounts.get(row.group_id) ?? 0) + 1);
  }

  const nextEvents = new Map<string, { id: string; title: string; start_time: string }>();
  for (const event of eventRows ?? []) {
    if (!nextEvents.has(event.group_id)) {
      nextEvents.set(event.group_id, {
        id: event.id,
        title: event.title,
        start_time: event.start_time,
      });
    }
  }

  return (memberships ?? []).flatMap((membership) => {
    const group = firstRelated(
      membership.groups as unknown as {
        id: string;
        name: string;
        description: string | null;
        image_url: string | null;
        timezone: string;
        group_type: GroupType;
        created_by: string;
      },
    );

    return group
      ? [
          {
            ...group,
            role: membership.role as GroupRole,
            color: membership.color ?? '#5B5CE2',
            nickname: membership.nickname,
            joined_at: membership.joined_at,
            member_count: memberCounts.get(group.id) ?? 1,
            next_event: nextEvents.get(group.id) ?? null,
          },
        ]
      : [];
  });
}

export async function createGroup(input: {
  name: string;
  description?: string;
  timezone: string;
  color: string;
  groupType: GroupType;
}) {
  const { data, error } = await supabase.rpc('create_group_with_type', {
    p_name: input.name,
    p_description: input.description?.trim() || null,
    p_timezone: input.timezone,
    p_member_color: input.color,
    p_group_type: input.groupType,
  });

  if (error) throw error;
  return data;
}

export async function joinGroupByCode(code: string, color: string) {
  const { data, error } = await supabase.rpc('join_group_by_code', {
    p_code: code.trim().toUpperCase(),
    p_color: color,
  });

  if (error) throw error;
  return data;
}

export async function getGroupDetails(groupId: string): Promise<GroupDetails> {
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to view this group.');

  const [groupResult, membershipResult, membersResult, eventsResult] = await Promise.all([
    supabase
      .from('groups')
      .select('id, name, description, image_url, timezone, group_type, created_by')
      .eq('id', groupId)
      .single(),
    supabase
      .from('group_members')
      .select('role, color, nickname, joined_at')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('group_members')
      .select('id, user_id, role, color, nickname, joined_at, profiles(display_name, username, avatar_url, bio)')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true }),
    supabase
      .from('events')
      .select('id, title, start_time, color')
      .eq('group_id', groupId)
      .eq('status', 'active')
      .gte('end_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(3),
  ]);

  if (groupResult.error) throw groupResult.error;
  if (membershipResult.error) throw membershipResult.error;
  if (membersResult.error) throw membersResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const role = membershipResult.data.role as GroupRole;
  let invites: GroupInvite[] = [];
  if (role === 'owner' || role === 'admin') {
    const { data, error } = await supabase
      .from('group_invites')
      .select('id, group_id, code, max_uses, use_count, expires_at, is_active, created_at')
      .eq('group_id', groupId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    invites = (data ?? []) as GroupInvite[];
  }

  const members = (membersResult.data ?? []).map((membership) => {
    const profile = firstRelated(
      membership.profiles as unknown as {
        display_name: string;
        username: string;
        avatar_url: string | null;
        bio: string | null;
      },
    );
    return {
      id: membership.id,
      user_id: membership.user_id,
      role: membership.role as GroupRole,
      color: membership.color,
      nickname: membership.nickname,
      joined_at: membership.joined_at,
      display_name: profile?.display_name ?? 'Planado member',
      username: profile?.username ?? 'member',
      avatar_url: profile?.avatar_url ?? null,
      bio: profile?.bio ?? null,
    };
  });

  return {
    group: {
      ...groupResult.data,
      role,
      color: membershipResult.data.color,
      nickname: membershipResult.data.nickname,
      joined_at: membershipResult.data.joined_at,
    },
    members,
    invites,
    upcoming_events: eventsResult.data ?? [],
  };
}

export async function getGroupWidgetEvents(groupId: string): Promise<{
  today: GroupWidgetEvent[];
  tomorrow: GroupWidgetEvent[];
  important: GroupWidgetEvent[];
  days: Record<string, GroupWidgetEvent[]>;
  groupType: GroupType;
}> {
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to create a widget.');

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setDate(tomorrowStart.getDate() + 1);
  const rangeEnd = new Date(todayStart);
  rangeEnd.setDate(todayStart.getDate() + 14);

  const eventFields = 'id, title, description, location, start_time, end_time, is_all_day, is_important';
  const [groupResult, eventResult, importantResult] = await Promise.all([
    supabase
      .from('groups')
      .select('group_type')
      .eq('id', groupId)
      .single(),
    supabase
      .from('events')
      .select(eventFields)
      .eq('group_id', groupId)
      .eq('status', 'active')
      .lte('start_time', rangeEnd.toISOString())
      .gte('end_time', todayStart.toISOString())
      .order('start_time', { ascending: true }),
    supabase
      .from('events')
      .select(eventFields)
      .eq('group_id', groupId)
      .eq('status', 'active')
      .eq('is_important', true)
      .gte('end_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(20),
  ]);

  if (groupResult.error) throw groupResult.error;
  if (eventResult.error) throw eventResult.error;
  if (importantResult.error) throw importantResult.error;
  const important = (importantResult.data ?? []) as GroupWidgetEvent[];
  const eventsById = new Map<string, GroupWidgetEvent>();
  for (const event of [...((eventResult.data ?? []) as GroupWidgetEvent[]), ...important]) {
    eventsById.set(event.id, event);
  }
  const events = [...eventsById.values()].sort(
    (left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime(),
  );
  const touchesDay = (event: GroupWidgetEvent, start: Date, end: Date) =>
    new Date(event.start_time) < end && new Date(event.end_time) >= start;
  const dayKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const days = Object.fromEntries(Array.from({ length: 14 }, (_, offset) => {
    const start = new Date(todayStart);
    start.setDate(todayStart.getDate() + offset);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return [dayKey(start), events.filter((event) => touchesDay(event, start, end))];
  }));

  return {
    today: events.filter((event) => touchesDay(event, todayStart, tomorrowStart)),
    tomorrow: events.filter((event) => touchesDay(event, tomorrowStart, tomorrowEnd)),
    important,
    days,
    groupType: groupResult.data.group_type as GroupType,
  };
}

export async function getEditableGroup(groupId: string): Promise<EditableGroup> {
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to edit a group.');

  const [groupResult, membershipResult] = await Promise.all([
    supabase
      .from('groups')
      .select('id, name, description, image_url, timezone, group_type')
      .eq('id', groupId)
      .single(),
    supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single(),
  ]);

  if (groupResult.error) throw groupResult.error;
  if (membershipResult.error) throw membershipResult.error;
  const role = membershipResult.data.role as GroupRole;
  if (role !== 'owner' && role !== 'admin') {
    throw new Error('Only the group creator or an admin can edit group details.');
  }

  return { ...groupResult.data, role } as EditableGroup;
}

export async function updateGroupDetails(
  groupId: string,
  input: { name: string; description?: string; timezone: string },
) {
  const name = input.name.trim();
  const description = input.description?.trim() || null;
  const timezone = input.timezone.trim();
  if (!name) throw new Error('Group name is required.');
  if (name.length > 80) throw new Error('Group name must be 80 characters or fewer.');
  if (description && description.length > 500) {
    throw new Error('Description must be 500 characters or fewer.');
  }
  if (!timezone || timezone.length > 100) throw new Error('Enter a valid timezone.');

  const { data, error } = await supabase
    .from('groups')
    .update({ name, description, timezone })
    .eq('id', groupId)
    .select('id, name, description, image_url, timezone, group_type')
    .single();

  if (error) throw error;
  return data;
}

export async function createGroupInvite(groupId: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc('create_group_invite', {
    p_group_id: groupId,
    p_max_uses: 25,
    p_expires_at: expiresAt,
  });
  if (error) throw error;
  return data as GroupInvite;
}

export async function revokeGroupInvite(inviteId: string) {
  const { error } = await supabase
    .from('group_invites')
    .update({ is_active: false })
    .eq('id', inviteId);
  if (error) throw error;
}

export async function updateGroupMemberRole(
  membershipId: string,
  role: Exclude<GroupRole, 'owner'>,
) {
  const { error } = await supabase
    .from('group_members')
    .update({ role })
    .eq('id', membershipId);
  if (error) throw error;
}

export async function removeGroupMember(membershipId: string) {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('id', membershipId);
  if (error) throw error;
}

export async function leaveGroup(groupId: string) {
  const { error } = await supabase.rpc('leave_group', { p_group_id: groupId });
  if (error) throw error;
}

export async function deleteGroup(groupId: string) {
  const { error } = await supabase.from('groups').delete().eq('id', groupId);
  if (error) throw error;
}
