import { getCurrentUser } from './authService';
import { supabase } from './supabase';

export type NotificationType =
  | 'group_invite'
  | 'member_joined'
  | 'event_created'
  | 'event_updated'
  | 'event_cancelled'
  | 'event_reminder';

export type PlanadoNotification = {
  id: string;
  user_id: string;
  group_id: string | null;
  event_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to view notifications.');
  return user;
}

export async function deleteMyExpiredNotifications() {
  const user = await requireUser();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', user.id)
    .lt('created_at', cutoff);

  if (error) throw error;
}

export async function getMyNotifications() {
  const user = await requireUser();
  await deleteMyExpiredNotifications();

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .gte(
      'created_at',
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    )
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as PlanadoNotification[];
}

export async function getMyUnreadNotificationCount() {
  const user = await requireUser();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null)
    .gte('created_at', cutoff);

  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationAsRead(notificationId: string) {
  const user = await requireUser();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', user.id)
    .is('read_at', null);

  if (error) throw error;
}

export async function markAllNotificationsAsRead() {
  const user = await requireUser();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null);

  if (error) throw error;
}

export async function deleteNotification(notificationId: string) {
  const user = await requireUser();
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)
    .eq('user_id', user.id);

  if (error) throw error;
}
