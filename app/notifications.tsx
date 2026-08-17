import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, Redirect, useFocusEffect, useRouter } from 'expo-router';
import { type ComponentProps, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlanadoAlert as Alert } from '../components/PlanadoAlert';
import { PlanadoLoader } from '../components/PlanadoLoader';
import { useAuth } from '../hooks/useAuth';
import { COLORS } from '../theme/colors';
import {
  deleteNotification,
  getMyNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type NotificationType,
  type PlanadoNotification,
} from '../services/notificationService';
import { supabase } from '../services/supabase';

type Filter = 'all' | 'unread';
type IconName = ComponentProps<typeof Ionicons>['name'];

function notificationAppearance(type: NotificationType): {
  icon: IconName;
  color: string;
  background: string;
} {
  switch (type) {
    case 'group_invite':
      return { icon: 'mail-unread-outline', color: COLORS.primary, background: COLORS.primarySoft };
    case 'member_joined':
      return { icon: 'person-add-outline', color: COLORS.green, background: COLORS.greenSoft };
    case 'event_created':
      return { icon: 'calendar-outline', color: COLORS.blue, background: COLORS.blueSoft };
    case 'event_updated':
      return { icon: 'refresh-outline', color: COLORS.orange, background: COLORS.orangeSoft };
    case 'event_cancelled':
      return { icon: 'calendar-clear-outline', color: COLORS.red, background: COLORS.redSoft };
    case 'event_reminder':
      return { icon: 'alarm-outline', color: COLORS.primary, background: COLORS.primarySoft };
  }
}

function relativeTime(value: string) {
  const difference = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(difference / 60_000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function sectionForDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return 'Earlier this week';
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<PlanadoNotification[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async (isRefresh = false) => {
    if (!user) return;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      setNotifications(await getMyNotifications());
    } catch (loadError) {
      console.error('Could not load notifications:', loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Notifications could not be loaded.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadNotifications();
    }, [loadNotifications]),
  );

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications:${user.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void loadNotifications(true);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadNotifications, user]);

  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const visibleNotifications = useMemo(
    () =>
      filter === 'unread'
        ? notifications.filter((notification) => !notification.read_at)
        : notifications,
    [filter, notifications],
  );
  const sections = useMemo(() => {
    const labels = ['Today', 'Yesterday', 'Earlier this week'];
    return labels
      .map((label) => ({
        label,
        notifications: visibleNotifications.filter(
          (notification) => sectionForDate(notification.created_at) === label,
        ),
      }))
      .filter((section) => section.notifications.length > 0);
  }, [visibleNotifications]);

  async function openNotification(notification: PlanadoNotification) {
    if (!notification.read_at) {
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read_at: readAt } : item,
        ),
      );

      try {
        await markNotificationAsRead(notification.id);
      } catch (readError) {
        console.error('Could not mark notification as read:', readError);
        void loadNotifications(true);
      }
    }

    if (notification.event_id) router.push(`/event/${notification.event_id}` as Href);
    else if (notification.group_id) router.push(`/group/${notification.group_id}` as Href);
  }

  async function markEverythingRead() {
    if (!unreadCount || updatingAll) return;

    setUpdatingAll(true);
    setError(null);
    const readAt = new Date().toISOString();
    const previous = notifications;
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, read_at: notification.read_at ?? readAt })),
    );

    try {
      await markAllNotificationsAsRead();
    } catch (markError) {
      setNotifications(previous);
      setError(
        markError instanceof Error
          ? markError.message
          : 'Notifications could not be updated.',
      );
    } finally {
      setUpdatingAll(false);
    }
  }

  function confirmDelete(notification: PlanadoNotification) {
    Alert.alert('Delete notification?', 'This removes it immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const previous = notifications;
          setNotifications((current) =>
            current.filter((item) => item.id !== notification.id),
          );
          void deleteNotification(notification.id).catch((deleteError: unknown) => {
            setNotifications(previous);
            setError(
              deleteError instanceof Error
                ? deleteError.message
                : 'The notification could not be deleted.',
            );
          });
        },
      },
    ]);
  }

  if (!authLoading && !user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.page}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons color={COLORS.ink} name="arrow-back" size={21} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>STAY IN THE LOOP</Text>
            <Text style={styles.title}>Notifications</Text>
          </View>
          <Pressable
            disabled={!unreadCount || updatingAll}
            onPress={() => void markEverythingRead()}
            style={({ pressed }) => [styles.readAllButton, (!unreadCount || updatingAll) && styles.disabled, pressed && styles.pressed]}
          >
            {updatingAll ? (
              <ActivityIndicator color={COLORS.primary} size="small" />
            ) : (
              <Ionicons color={unreadCount ? COLORS.primary : COLORS.faint} name="checkmark-done" size={18} />
            )}
            <Text style={[styles.readAllText, !unreadCount && styles.readAllTextDisabled]}>Read all</Text>
          </Pressable>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons color="#FFFFFF" name="notifications" size={23} />
          </View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryNumber}>{unreadCount}</Text>
            <Text style={styles.summaryLabel}>{unreadCount === 1 ? 'unread update' : 'unread updates'}</Text>
          </View>
          <View style={styles.expiryChip}>
            <Ionicons color="#C9C9F5" name="time-outline" size={13} />
            <Text style={styles.expiryChipText}>7-day history</Text>
          </View>
        </View>

        <View style={styles.filters}>
          <Pressable
            onPress={() => setFilter('all')}
            style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>All</Text>
            <View style={[styles.filterCount, filter === 'all' && styles.filterCountActive]}>
              <Text style={[styles.filterCountText, filter === 'all' && styles.filterCountTextActive]}>{notifications.length}</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => setFilter('unread')}
            style={[styles.filterButton, filter === 'unread' && styles.filterButtonActive]}
          >
            <Text style={[styles.filterText, filter === 'unread' && styles.filterTextActive]}>Unread</Text>
            <View style={[styles.filterCount, filter === 'unread' && styles.filterCountActive]}>
              <Text style={[styles.filterCountText, filter === 'unread' && styles.filterCountTextActive]}>{unreadCount}</Text>
            </View>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons color={COLORS.red} name="alert-circle" size={17} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              colors={[COLORS.primary]}
              onRefresh={() => void loadNotifications(true)}
              refreshing={refreshing}
              tintColor={COLORS.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingState}>
              <PlanadoLoader compact message="Checking for updates..." />
            </View>
          ) : sections.length ? (
            sections.map((section) => (
              <View key={section.label} style={styles.section}>
                <Text style={styles.sectionLabel}>{section.label.toUpperCase()}</Text>
                <View style={styles.notificationGroup}>
                  {section.notifications.map((notification, index) => {
                    const appearance = notificationAppearance(notification.type);
                    const unread = !notification.read_at;
                    return (
                      <View key={notification.id}>
                        <View style={[styles.notificationRow, unread && styles.notificationRowUnread]}>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => void openNotification(notification)}
                            style={({ pressed }) => [styles.notificationMain, pressed && styles.pressed]}
                          >
                            <View style={[styles.notificationIcon, { backgroundColor: appearance.background }]}>
                              <Ionicons color={appearance.color} name={appearance.icon} size={21} />
                            </View>
                            <View style={styles.notificationCopy}>
                              <View style={styles.notificationTitleRow}>
                                <Text numberOfLines={1} style={[styles.notificationTitle, unread && styles.notificationTitleUnread]}>{notification.title}</Text>
                                <Text style={styles.notificationTime}>{relativeTime(notification.created_at)}</Text>
                              </View>
                              <Text numberOfLines={3} style={styles.notificationMessage}>{notification.message}</Text>
                            </View>
                            {unread ? <View style={styles.unreadDot} /> : null}
                          </Pressable>
                          <Pressable
                            accessibilityLabel="Delete notification"
                            accessibilityRole="button"
                            hitSlop={9}
                            onPress={() => confirmDelete(notification)}
                            style={styles.deleteButton}
                          >
                            <Ionicons color={COLORS.faint} name="trash-outline" size={17} />
                          </Pressable>
                        </View>
                        {index < section.notifications.length - 1 ? <View style={styles.separator} /> : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyArt}>
                <Ionicons color={COLORS.primary} name={filter === 'unread' ? 'checkmark-done' : 'notifications-outline'} size={37} />
                <View style={styles.emptySpark}><Text style={styles.emptySparkText}>✦</Text></View>
              </View>
              <Text style={styles.emptyTitle}>{filter === 'unread' ? 'You are all caught up' : 'Nothing new yet'}</Text>
              <Text style={styles.emptyBody}>
                {filter === 'unread'
                  ? 'New group and event updates will appear here when they need your attention.'
                  : 'Invites, event changes, reminders, and group activity will appear here.'}
              </Text>
            </View>
          )}

          <View style={styles.retentionNote}>
            <Ionicons color={COLORS.faint} name="shield-checkmark-outline" size={15} />
            <Text style={styles.retentionText}>Notifications are automatically removed 7 days after they are created.</Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  page: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 18 },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, backgroundColor: COLORS.surface },
  headerCopy: { flex: 1 },
  eyebrow: { color: COLORS.primary, fontSize: 8, fontWeight: '900', letterSpacing: 1.05 },
  title: { marginTop: 3, color: COLORS.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.7 },
  readAllButton: { minHeight: 39, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: COLORS.line, borderRadius: 13, backgroundColor: COLORS.surface },
  readAllText: { color: COLORS.primary, fontSize: 9, fontWeight: '800' },
  readAllTextDisabled: { color: COLORS.faint },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  summaryCard: { minHeight: 94, padding: 16, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 23, backgroundColor: '#282852' },
  summaryIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: COLORS.primary },
  summaryCopy: { flex: 1 },
  summaryNumber: { color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  summaryLabel: { marginTop: 1, color: '#BFBFDE', fontSize: 9, fontWeight: '700' },
  expiryChip: { paddingVertical: 7, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.09)' },
  expiryChipText: { color: '#C9C9E7', fontSize: 8, fontWeight: '700' },
  filters: { marginTop: 14, padding: 4, flexDirection: 'row', gap: 4, borderWidth: 1, borderColor: COLORS.line, borderRadius: 17, backgroundColor: COLORS.surface },
  filterButton: { flex: 1, minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13 },
  filterButtonActive: { backgroundColor: COLORS.primarySoft },
  filterText: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  filterTextActive: { color: COLORS.primary },
  filterCount: { minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: COLORS.elevated },
  filterCountActive: { backgroundColor: COLORS.primary },
  filterCountText: { color: COLORS.muted, fontSize: 8, fontWeight: '900' },
  filterCountTextActive: { color: '#FFFFFF' },
  errorBanner: { marginTop: 11, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 13, backgroundColor: COLORS.redSoft },
  errorText: { flex: 1, color: COLORS.red, fontSize: 9, lineHeight: 14 },
  listContent: { flexGrow: 1, paddingTop: 18, paddingBottom: 22 },
  loadingState: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 11 },
  loadingText: { color: COLORS.muted, fontSize: 10 },
  section: { marginBottom: 20 },
  sectionLabel: { marginBottom: 8, marginLeft: 4, color: COLORS.faint, fontSize: 8, fontWeight: '900', letterSpacing: 0.95 },
  notificationGroup: { overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line, borderRadius: 21, backgroundColor: COLORS.surface },
  notificationRow: { minHeight: 92, paddingRight: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface },
  notificationRowUnread: { backgroundColor: COLORS.elevated },
  notificationMain: { flex: 1, minHeight: 92, paddingVertical: 14, paddingLeft: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  notificationIcon: { width: 45, height: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  notificationCopy: { flex: 1 },
  notificationTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notificationTitle: { flex: 1, color: '#55555F', fontSize: 11, fontWeight: '700' },
  notificationTitleUnread: { color: COLORS.ink, fontWeight: '900' },
  notificationTime: { color: COLORS.faint, fontSize: 8, fontWeight: '700' },
  notificationMessage: { marginTop: 5, color: COLORS.muted, fontSize: 9, lineHeight: 14 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
  deleteButton: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  separator: { height: 1, marginLeft: 69, backgroundColor: COLORS.line },
  emptyState: { minHeight: 330, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  emptyArt: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center', borderRadius: 30, backgroundColor: COLORS.primarySoft },
  emptySpark: { position: 'absolute', top: 8, right: 5, width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: COLORS.background, borderRadius: 13, backgroundColor: COLORS.primary },
  emptySparkText: { color: '#FFFFFF', fontSize: 12 },
  emptyTitle: { marginTop: 20, color: COLORS.ink, fontSize: 17, fontWeight: '800' },
  emptyBody: { maxWidth: 320, marginTop: 7, color: COLORS.muted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  retentionNote: { marginTop: 4, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  retentionText: { flexShrink: 1, color: COLORS.faint, fontSize: 8, lineHeight: 12, textAlign: 'center' },
});
