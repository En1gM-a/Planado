import { getCurrentUser } from './authService';
import { supabase } from './supabase';

export type EventCategory =
  | 'hangout'
  | 'birthday'
  | 'school'
  | 'work'
  | 'study'
  | 'gym'
  | 'trip'
  | 'deadline'
  | 'personal'
  | 'other';

export type CalendarGroup = {
  id: string;
  name: string;
  color: string;
};

export type CalendarEvent = {
  id: string;
  group_id: string;
  created_by: string;
  title: string;
  description: string | null;
  location: string | null;
  category: EventCategory;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  color: string | null;
  visibility: 'group' | 'private';
  status: 'active' | 'cancelled';
  group_name: string;
};

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function getMyCalendarGroups(): Promise<CalendarGroup[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to view your calendar.');

  const { data, error } = await supabase
    .from('group_members')
    .select('color, groups(id, name)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).flatMap((membership) => {
    const group = firstRelated(
      membership.groups as unknown as { id: string; name: string },
    );
    return group
      ? [{ id: group.id, name: group.name, color: membership.color ?? '#5B5CE2' }]
      : [];
  });
}

export async function getCalendarEvents(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<CalendarEvent[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to view your calendar.');

  const { data, error } = await supabase
    .from('events')
    .select(
      'id, group_id, created_by, title, description, location, category, start_time, end_time, is_all_day, color, visibility, status, groups(name)',
    )
    .lte('start_time', rangeEnd.toISOString())
    .gte('end_time', rangeStart.toISOString())
    .order('start_time', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((event) => {
    const group = firstRelated(event.groups as unknown as { name: string });
    return {
      id: event.id,
      group_id: event.group_id,
      created_by: event.created_by,
      title: event.title,
      description: event.description,
      location: event.location,
      category: event.category as EventCategory,
      start_time: event.start_time,
      end_time: event.end_time,
      is_all_day: event.is_all_day,
      color: event.color,
      visibility: event.visibility as 'group' | 'private',
      status: event.status as 'active' | 'cancelled',
      group_name: group?.name ?? 'Personal plan',
    };
  });
}
