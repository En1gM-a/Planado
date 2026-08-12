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

export type CreateEventInput = {
  groupId: string;
  title: string;
  description?: string;
  location?: string;
  category: EventCategory;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  color: string;
  visibility: 'group' | 'private';
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

export async function createEvent(input: CreateEventInput): Promise<CalendarEvent> {
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to create an event.');
  if (!input.groupId) throw new Error('Choose a group for this event.');
  if (!input.title.trim()) throw new Error('Event title is required.');
  if (input.endTime < input.startTime) throw new Error('End time must be after the start time.');

  const { data, error } = await supabase
    .from('events')
    .insert({
      group_id: input.groupId,
      created_by: user.id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      location: input.location?.trim() || null,
      category: input.category,
      start_time: input.startTime.toISOString(),
      end_time: input.endTime.toISOString(),
      is_all_day: input.isAllDay,
      color: input.color,
      visibility: input.visibility,
      status: 'active',
    })
    .select('id, group_id, created_by, title, description, location, category, start_time, end_time, is_all_day, color, visibility, status, groups(name)')
    .single();

  if (error) throw error;

  const group = firstRelated(data.groups as unknown as { name: string });
  return {
    id: data.id,
    group_id: data.group_id,
    created_by: data.created_by,
    title: data.title,
    description: data.description,
    location: data.location,
    category: data.category as EventCategory,
    start_time: data.start_time,
    end_time: data.end_time,
    is_all_day: data.is_all_day,
    color: data.color,
    visibility: data.visibility as 'group' | 'private',
    status: data.status as 'active' | 'cancelled',
    group_name: group?.name ?? 'Planado group',
  };
}

export async function getCalendarEventById(eventId: string): Promise<CalendarEvent> {
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to view this event.');

  const { data, error } = await supabase
    .from('events')
    .select('id, group_id, created_by, title, description, location, category, start_time, end_time, is_all_day, color, visibility, status, groups(name)')
    .eq('id', eventId)
    .single();

  if (error) throw error;
  const group = firstRelated(data.groups as unknown as { name: string });
  return {
    id: data.id,
    group_id: data.group_id,
    created_by: data.created_by,
    title: data.title,
    description: data.description,
    location: data.location,
    category: data.category as EventCategory,
    start_time: data.start_time,
    end_time: data.end_time,
    is_all_day: data.is_all_day,
    color: data.color,
    visibility: data.visibility as 'group' | 'private',
    status: data.status as 'active' | 'cancelled',
    group_name: group?.name ?? 'Planado group',
  };
}
