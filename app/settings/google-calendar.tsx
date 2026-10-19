import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlanadoAlert as Alert } from '../../components/PlanadoAlert';
import { PlanadoLoader } from '../../components/PlanadoLoader';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { PressableScale } from '../../components/ui/PressableScale';
import { Reveal } from '../../components/ui/Reveal';
import { useAuth } from '../../hooks/useAuth';
import type { CalendarGroup } from '../../services/eventService';
import { getMyCalendarGroups } from '../../services/eventService';
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  getGoogleCalendarConnection,
  type GoogleCalendarConnection,
  syncGoogleCalendar,
  updateGoogleCalendarSettings,
} from '../../services/googleCalendarService';
import { COLORS } from '../../theme/colors';
import { GRADIENT, gradientStyle, ON_PRIMARY, RADIUS, SHADOW, TYPE } from '../../theme/tokens';

const EMPTY_CONNECTION: GoogleCalendarConnection = {
  connected: false,
  googleEmail: null,
  destinationGroupId: null,
  selectedCalendarIds: [],
  calendars: [],
  lastSyncedAt: null,
  lastError: null,
  connectedAt: null,
};

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function syncTimeLabel(value: string | null) {
  if (!value) return 'Not synced yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not synced yet';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : 'Please check your connection and try again.';
}

export default function GoogleCalendarSettingsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [connection, setConnection] = useState(EMPTY_CONNECTION);
  const [groups, setGroups] = useState<CalendarGroup[]>([]);
  const [destinationGroupId, setDestinationGroupId] = useState('');
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState<'connect' | 'save' | 'sync' | 'disconnect' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyConnection = useCallback(
    (next: GoogleCalendarConnection, fallbackGroupId = '') => {
      setConnection(next);
      setDestinationGroupId(next.destinationGroupId ?? fallbackGroupId);
      setSelectedCalendarIds(
        next.selectedCalendarIds.length
          ? next.selectedCalendarIds
          : next.calendars.filter((calendar) => calendar.primary).map((calendar) => calendar.id),
      );
    },
    [],
  );

  const load = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [nextGroups, nextConnection] = await Promise.all([
        getMyCalendarGroups(),
        getGoogleCalendarConnection(),
      ]);
      setGroups(nextGroups);
      applyConnection(nextConnection, nextGroups[0]?.id ?? '');
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyConnection, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const destinationGroup = groups.find((group) => group.id === destinationGroupId) ?? null;
  const dirty =
    connection.connected &&
    (destinationGroupId !== connection.destinationGroupId ||
      !sameIds(selectedCalendarIds, connection.selectedCalendarIds));

  const selectedCount = selectedCalendarIds.length;
  const connectedCalendarCount = connection.calendars.length;

  async function connect() {
    if (!user || !destinationGroupId || working) return;
    setWorking('connect');
    setError(null);

    try {
      const connected = await connectGoogleCalendar(user.id, destinationGroupId);
      if (!connected) return;
      applyConnection(connected, groups[0]?.id ?? '');

      const synced = await syncGoogleCalendar(true);
      applyConnection(synced, groups[0]?.id ?? '');
      Alert.alert(
        'Google Calendar connected',
        `${synced.added + synced.updated} events were synced privately to ${destinationGroup?.name ?? 'your selected group'}.`,
      );
    } catch (connectError) {
      setError(messageFromError(connectError));
    } finally {
      setWorking(null);
    }
  }

  function toggleCalendar(calendarId: string) {
    setSelectedCalendarIds((current) =>
      current.includes(calendarId)
        ? current.filter((id) => id !== calendarId)
        : [...current, calendarId],
    );
  }

  async function saveAndSync() {
    if (!destinationGroupId || selectedCalendarIds.length === 0 || working) return;
    setWorking('save');
    setError(null);

    try {
      const saved = await updateGoogleCalendarSettings(
        destinationGroupId,
        selectedCalendarIds,
      );
      applyConnection(saved, groups[0]?.id ?? '');
      const synced = await syncGoogleCalendar(true);
      applyConnection(synced, groups[0]?.id ?? '');
      Alert.alert(
        'Calendar choices saved',
        `${synced.added} added, ${synced.updated} updated, and ${synced.removed} removed.`,
      );
    } catch (saveError) {
      setError(messageFromError(saveError));
    } finally {
      setWorking(null);
    }
  }

  async function syncNow() {
    if (working) return;
    setWorking('sync');
    setError(null);

    try {
      const synced = await syncGoogleCalendar(true);
      applyConnection(synced, groups[0]?.id ?? '');
      Alert.alert(
        'Calendar is up to date',
        `${synced.added} added, ${synced.updated} updated, and ${synced.removed} removed.`,
      );
    } catch (syncError) {
      setError(messageFromError(syncError));
    } finally {
      setWorking(null);
    }
  }

  async function disconnect(removeImportedEvents: boolean) {
    if (working) return;
    setWorking('disconnect');
    setError(null);

    try {
      const result = await disconnectGoogleCalendar(removeImportedEvents);
      applyConnection(EMPTY_CONNECTION);
      Alert.alert(
        'Google Calendar disconnected',
        removeImportedEvents
          ? `${result.removed} imported ${result.removed === 1 ? 'event was' : 'events were'} removed from Planado.`
          : 'Existing imported events were kept in Planado.',
      );
    } catch (disconnectError) {
      setError(messageFromError(disconnectError));
    } finally {
      setWorking(null);
    }
  }

  function confirmDisconnect() {
    Alert.alert(
      'Disconnect Google Calendar?',
      'Choose whether Planado should keep events that were already imported.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Keep events',
          onPress: () => void disconnect(false),
        },
        {
          text: 'Remove imported events',
          style: 'destructive',
          onPress: () => void disconnect(true),
        },
      ],
    );
  }

  if (!authLoading && !user) return <Redirect href="/(auth)/login" />;

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <PlanadoLoader fullScreen message="Loading Google Calendar settings..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <IconButton icon="arrow-back" label="Go back" onPress={() => router.back()} />
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Calendar connections</Text>
          <Text accessibilityRole="header" style={styles.headerTitle}>Google Calendar</Text>
        </View>
        {connection.connected ? (
          <View style={styles.connectedPill}>
            <View style={styles.connectedDot} />
            <Text style={styles.connectedPillText}>Connected</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[COLORS.primary]}
            onRefresh={() => void load(true)}
            refreshing={refreshing}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Reveal style={[styles.hero, gradientStyle(GRADIENT.hero, GRADIENT.heroFallback)]}>
          <View style={styles.googleLogoShell}>
            <Image
              accessibilityIgnoresInvertColors
              source={require('../../assets/images/google-logo.png')}
              resizeMode="contain"
        style={styles.googleLogo}
            />
          </View>
          <Text style={styles.heroTitle}>
            {connection.connected ? 'Your plans stay together.' : 'Bring your Google plans in.'}
          </Text>
          <Text style={styles.heroBody}>
            {connection.connected
              ? `Connected as ${connection.googleEmail ?? user?.email ?? 'your Google account'}`
              : 'Planado imports events with read-only permission. It cannot edit or delete anything in Google Calendar.'}
          </Text>
          {connection.connected ? (
            <View style={styles.syncSummary}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{selectedCount}</Text>
                <Text style={styles.summaryLabel}>Calendars</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text numberOfLines={1} style={styles.summaryTime}>
                  {syncTimeLabel(connection.lastSyncedAt)}
                </Text>
                <Text style={styles.summaryLabel}>Last sync</Text>
              </View>
            </View>
          ) : null}
        </Reveal>

        <Banner message={error ?? connection.lastError} title="Calendar needs attention" />

        <View style={styles.privacyCard}>
          <View style={styles.privacyIcon}>
            <Ionicons color={COLORS.green} name="shield-checkmark-outline" size={21} />
          </View>
          <View style={styles.privacyCopy}>
            <Text style={styles.privacyTitle}>Private by default</Text>
            <Text style={styles.privacyText}>
              Imported events are visible only to you, even when they are stored inside a shared Planado group.
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Save events inside</Text>
          <Text style={styles.sectionSubtitle}>Choose one of your Planado groups</Text>
        </View>

        {groups.length ? (
          <View style={styles.optionCard}>
            {groups.map((group, index) => {
              const active = group.id === destinationGroupId;
              return (
                <View key={group.id}>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => setDestinationGroupId(group.id)}
                    style={({ pressed }) => [styles.optionRow, pressed && styles.rowPressed]}
                  >
                    <View style={[styles.groupDot, { backgroundColor: group.color }]} />
                    <Text numberOfLines={1} style={styles.optionName}>{group.name}</Text>
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active ? <View style={styles.radioCenter} /> : null}
                    </View>
                  </Pressable>
                  {index < groups.length - 1 ? <View style={styles.separator} /> : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons color={COLORS.primary} name="people-outline" size={27} />
            <Text style={styles.emptyTitle}>Create a group first</Text>
            <Text style={styles.emptyText}>Google events need a Planado group to appear in your calendar.</Text>
            <Button icon="add" label="Create group" onPress={() => router.push('/group/create')} size="sm" style={styles.smallPrimaryButton} />
          </View>
        )}

        {connection.connected && connectedCalendarCount ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Calendars to import</Text>
              <Text style={styles.sectionSubtitle}>Choose one or more Google calendars</Text>
            </View>
            <View style={styles.optionCard}>
              {connection.calendars.map((calendar, index) => {
                const active = selectedCalendarIds.includes(calendar.id);
                return (
                  <View key={calendar.id}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: active }}
                      onPress={() => toggleCalendar(calendar.id)}
                      style={({ pressed }) => [styles.calendarRow, pressed && styles.rowPressed]}
                    >
                      <View style={[styles.calendarColor, { backgroundColor: calendar.color }]} />
                      <View style={styles.calendarCopy}>
                        <View style={styles.calendarTitleRow}>
                          <Text numberOfLines={1} style={styles.optionName}>{calendar.name}</Text>
                          {calendar.primary ? <Text style={styles.primaryBadge}>Primary</Text> : null}
                        </View>
                        {calendar.description ? (
                          <Text numberOfLines={1} style={styles.calendarDescription}>{calendar.description}</Text>
                        ) : null}
                      </View>
                      <View style={[styles.checkbox, active && styles.checkboxActive]}>
                        {active ? <Ionicons color={ON_PRIMARY} name="checkmark" size={15} /> : null}
                      </View>
                    </Pressable>
                    {index < connection.calendars.length - 1 ? <View style={styles.separator} /> : null}
                  </View>
                );
              })}
            </View>
            {selectedCalendarIds.length === 0 ? (
              <Text style={styles.validationText}>Choose at least one calendar to continue.</Text>
            ) : null}
          </>
        ) : null}

        {!connection.connected ? (
          <PressableScale
            accessibilityState={{ busy: working === 'connect', disabled: !destinationGroupId || working !== null }}
            disabled={!destinationGroupId || working !== null}
            onPress={() => void connect()}
            scaleTo={0.98}
            style={[
              styles.primaryButton,
              (!destinationGroupId || working !== null) && styles.disabled,
            ]}
          >
            {working === 'connect' ? (
              <ActivityIndicator color={ON_PRIMARY} size="small" />
            ) : (
              <Image
                accessibilityIgnoresInvertColors
                source={require('../../assets/images/google-logo.png')}
                resizeMode="contain"
        style={styles.buttonGoogleLogo}
              />
            )}
            <Text style={styles.primaryButtonText}>
              {working === 'connect' ? 'Connecting…' : 'Connect Google Calendar'}
            </Text>
          </PressableScale>
        ) : (
          <>
            {dirty ? (
              <Button
                disabled={!selectedCalendarIds.length || (working !== null && working !== 'save')}
                icon="checkmark"
                label={working === 'save' ? 'Saving and syncing…' : 'Save choices and sync'}
                loading={working === 'save'}
                onPress={() => void saveAndSync()}
                style={styles.actionButton}
              />
            ) : (
              <Button
                disabled={working !== null && working !== 'sync'}
                icon="sync"
                label={working === 'sync' ? 'Syncing…' : 'Sync now'}
                loading={working === 'sync'}
                onPress={() => void syncNow()}
                style={styles.actionButton}
              />
            )}
            <Text style={styles.autoSyncNote}>
              Planado checks for changes when the app opens or returns to the foreground, at most once every 15 minutes.
            </Text>
            <Button
              disabled={working !== null && working !== 'disconnect'}
              icon="unlink-outline"
              label="Disconnect Google Calendar"
              loading={working === 'disconnect'}
              onPress={confirmDisconnect}
              size="md"
              style={styles.disconnectButton}
              variant="danger"
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    minHeight: 72,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    backgroundColor: COLORS.surface,
  },
  headerCopy: { flex: 1 },
  eyebrow: { ...TYPE.overline, color: COLORS.primary },
  headerTitle: { ...TYPE.title3, marginTop: 1, color: COLORS.ink, fontWeight: '800' },
  connectedPill: { minHeight: 30, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: RADIUS.pill, backgroundColor: COLORS.greenSoft },
  connectedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.green },
  connectedPillText: { ...TYPE.footnote, color: COLORS.green, fontWeight: '700' },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 16, paddingBottom: 48 },
  hero: { padding: 22, alignItems: 'center', overflow: 'hidden', borderRadius: RADIUS.xxl, boxShadow: SHADOW.md },
  googleLogoShell: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.lg, backgroundColor: '#FFFFFF' },
  googleLogo: { width: 32, height: 32 },
  heroTitle: { width: '100%', ...TYPE.title2, marginTop: 16, color: '#FFFFFF', fontWeight: '800', textAlign: 'center' },
  heroBody: { width: '100%', ...TYPE.callout, maxWidth: 430, marginTop: 6, color: 'rgba(255,255,255,0.82)', fontWeight: '400', textAlign: 'center' },
  syncSummary: { width: '100%', marginTop: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.md, backgroundColor: 'rgba(255,255,255,0.1)' },
  summaryItem: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 8 },
  summaryValue: { fontSize: 22, lineHeight: 26, color: '#FFFFFF', fontWeight: '800' },
  summaryTime: { ...TYPE.callout, color: '#FFFFFF', fontWeight: '800' },
  summaryLabel: { ...TYPE.footnote, marginTop: 2, color: 'rgba(255,255,255,0.75)' },
  summaryDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.16)' },
  privacyCard: { marginTop: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: RADIUS.lg, backgroundColor: COLORS.greenSoft },
  privacyIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm, backgroundColor: COLORS.surface },
  privacyCopy: { flex: 1 },
  privacyTitle: { ...TYPE.callout, color: COLORS.green, fontWeight: '800' },
  privacyText: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  sectionHeader: { marginTop: 26, marginBottom: 12 },
  sectionTitle: { ...TYPE.title3, color: COLORS.ink },
  sectionSubtitle: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  optionCard: { overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface },
  optionRow: { minHeight: 60, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowPressed: { backgroundColor: COLORS.elevated },
  groupDot: { width: 14, height: 14, borderRadius: 7 },
  optionName: { ...TYPE.bodyStrong, flexShrink: 1, color: COLORS.ink },
  radio: { width: 24, height: 24, marginLeft: 'auto', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.line, borderRadius: 12 },
  radioActive: { borderColor: COLORS.primary },
  radioCenter: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.primary },
  separator: { height: 1, marginLeft: 42, backgroundColor: COLORS.line },
  emptyCard: { padding: 24, alignItems: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface },
  emptyTitle: { width: '100%', ...TYPE.headline, marginTop: 10, color: COLORS.ink, textAlign: 'center' },
  emptyText: { width: '100%', ...TYPE.subhead, maxWidth: 320, marginTop: 4, color: COLORS.muted, fontWeight: '400', textAlign: 'center' },
  smallPrimaryButton: { marginTop: 14 },
  calendarRow: { minHeight: 68, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  calendarColor: { width: 6, height: 36, borderRadius: 3 },
  calendarCopy: { flex: 1, minWidth: 0 },
  calendarTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    overflow: 'hidden',
    color: COLORS.primary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primarySoft,
  },
  calendarDescription: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  checkbox: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.line, borderRadius: 8 },
  checkboxActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  validationText: { ...TYPE.footnote, marginTop: 8, color: COLORS.danger, fontWeight: '700' },
  primaryButton: {
    minHeight: 56,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    boxShadow: SHADOW.primary,
  },
  primaryButtonText: { ...TYPE.bodyStrong, color: ON_PRIMARY, fontWeight: '700' },
  buttonGoogleLogo: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' },
  actionButton: { marginTop: 20 },
  autoSyncNote: { ...TYPE.footnote, marginTop: 10, paddingHorizontal: 12, color: COLORS.muted, textAlign: 'center' },
  disconnectButton: { marginTop: 16 },
  disabled: { opacity: 0.45 },
});
