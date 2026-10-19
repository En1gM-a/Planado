import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, Redirect, useFocusEffect, useRouter } from 'expo-router';
import { type ComponentProps, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlanadoAlert as Alert } from '../components/PlanadoAlert';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { Reveal } from '../components/ui/Reveal';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { SkeletonList } from '../components/ui/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { COLORS } from '../theme/colors';
import { GRADIENT, gradientStyle, PAGE, RADIUS, SHADOW, TYPE } from '../theme/tokens';
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
          <IconButton icon="arrow-back" label="Go back" onPress={() => router.back()} />
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Stay in the loop</Text>
            <Text accessibilityRole="header" style={styles.title}>Notifications</Text>
          </View>
          <Button
            disabled={!unreadCount}
            icon="checkmark-done"
            label="Read all"
            loading={updatingAll}
            onPress={() => void markEverythingRead()}
            size="sm"
            variant="secondary"
          />
        </View>

        <Reveal style={[styles.summaryCard, gradientStyle(GRADIENT.hero, GRADIENT.heroFallback)]}>
          <View style={styles.summaryIcon}>
            <Ionicons color="#FFFFFF" name="notifications" size={23} />
          </View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryNumber}>{unreadCount}</Text>
            <Text style={styles.summaryLabel}>{unreadCount === 1 ? 'unread update' : 'unread updates'}</Text>
          </View>
          <View style={styles.expiryChip}>
            <Ionicons color="#FFFFFF" name="time-outline" size={14} />
            <Text numberOfLines={1} style={styles.expiryChipText}>7-day history</Text>
          </View>
        </Reveal>

        <Reveal index={1} style={styles.filters}>
          <SegmentedControl
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: notifications.length },
              { value: 'unread', label: 'Unread', count: unreadCount },
            ]}
            value={filter}
          />
        </Reveal>

        <Banner message={error} />

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
            <SkeletonList count={4} label="Checking for updates" />
          ) : sections.length ? (
            sections.map((section) => (
              <View key={section.label} style={styles.section}>
                <Text accessibilityRole="header" style={styles.sectionLabel}>{section.label}</Text>
                <View style={styles.notificationGroup}>
                  {section.notifications.map((notification, index) => {
                    const appearance = notificationAppearance(notification.type);
                    const unread = !notification.read_at;
                    return (
                      <Reveal index={index} key={notification.id}>
                        <View style={[styles.notificationRow, unread && styles.notificationRowUnread]}>
                          <Pressable
                            accessibilityHint="Opens the related event or group"
                            accessibilityLabel={`${unread ? 'Unread. ' : ''}${notification.title}. ${notification.message}`}
                            accessibilityRole="button"
                            onPress={() => void openNotification(notification)}
                            style={({ pressed }) => [styles.notificationMain, pressed && styles.rowPressed]}
                          >
                            <View style={[styles.notificationIcon, { backgroundColor: appearance.background }]}>
                              <Ionicons color={appearance.color} name={appearance.icon} size={21} />
                              {unread ? <View style={styles.unreadDot} /> : null}
                            </View>
                            <View style={styles.notificationCopy}>
                              <View style={styles.notificationTitleRow}>
                                <Text numberOfLines={1} style={[styles.notificationTitle, unread && styles.notificationTitleUnread]}>{notification.title}</Text>
                                <Text style={styles.notificationTime}>{relativeTime(notification.created_at)}</Text>
                              </View>
                              <Text numberOfLines={3} style={styles.notificationMessage}>{notification.message}</Text>
                            </View>
                          </Pressable>
                          <IconButton
                            color={COLORS.muted}
                            icon="trash-outline"
                            label="Delete notification"
                            onPress={() => confirmDelete(notification)}
                            size={18}
                            tone="ghost"
                          />
                        </View>
                        {index < section.notifications.length - 1 ? <View style={styles.separator} /> : null}
                      </Reveal>
                    );
                  })}
                </View>
              </View>
            ))
          ) : (
            <EmptyState
              body={filter === 'unread'
                ? 'New group and event updates will appear here when they need your attention.'
                : 'Invites, event changes, reminders, and group activity will appear here.'}
              icon={filter === 'unread' ? 'checkmark-done' : 'notifications-outline'}
              key={filter}
              title={filter === 'unread' ? 'You’re all caught up' : 'Nothing new yet'}
            />
          )}

          <View style={styles.retentionNote}>
            <Ionicons color={COLORS.muted} name="shield-checkmark-outline" size={16} />
            <Text style={styles.retentionText}>Notifications are automatically removed 7 days after they are created.</Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  page: { flex: 1, width: '100%', maxWidth: PAGE.maxWidth, alignSelf: 'center', paddingHorizontal: PAGE.gutter },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1 },
  eyebrow: { ...TYPE.overline, color: COLORS.primary },
  title: { ...TYPE.title2, marginTop: 2, color: COLORS.ink, fontWeight: '800' },
  summaryCard: {
    minHeight: 92,
    padding: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: RADIUS.xl,
    boxShadow: SHADOW.md,
  },
  summaryIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: 'rgba(255,255,255,0.16)' },
  summaryCopy: { flex: 1 },
  summaryNumber: { fontSize: 26, lineHeight: 30, color: '#FFFFFF', fontWeight: '800' },
  summaryLabel: { ...TYPE.subhead, color: 'rgba(255,255,255,0.82)', fontWeight: '600' },
  expiryChip: {
    minHeight: 30,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  expiryChipText: { ...TYPE.footnote, color: '#FFFFFF', fontWeight: '600' },
  filters: { marginTop: 14 },
  listContent: { flexGrow: 1, paddingTop: 18, paddingBottom: 24 },
  section: { marginBottom: 22 },
  sectionLabel: { ...TYPE.overline, marginBottom: 8, marginLeft: 4, color: COLORS.muted },
  notificationGroup: { overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.xl, backgroundColor: COLORS.surface },
  notificationRow: { minHeight: 92, paddingRight: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface },
  notificationRowUnread: { backgroundColor: COLORS.primarySoft },
  notificationMain: { flex: 1, minHeight: 92, paddingVertical: 14, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowPressed: { opacity: 0.7 },
  notificationIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderWidth: 2,
    borderColor: COLORS.surface,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  notificationCopy: { flex: 1 },
  notificationTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notificationTitle: { ...TYPE.bodyStrong, flex: 1, color: COLORS.muted, fontWeight: '600' },
  notificationTitleUnread: { color: COLORS.ink, fontWeight: '800' },
  notificationTime: { ...TYPE.footnote, color: COLORS.muted, fontWeight: '600' },
  notificationMessage: { ...TYPE.subhead, marginTop: 3, color: COLORS.muted, fontWeight: '400' },
  separator: { height: 1, marginLeft: 72, backgroundColor: COLORS.line },
  retentionNote: { marginTop: 8, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  retentionText: { ...TYPE.footnote, flexShrink: 1, color: COLORS.muted, textAlign: 'center' },
});
