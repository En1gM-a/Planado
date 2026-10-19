import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { PlanadoAlert as Alert } from '../../components/PlanadoAlert';
import { PlanadoDateTimePicker } from '../../components/PlanadoDateTimePicker';
import { PlanadoLoader } from '../../components/PlanadoLoader';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Reveal } from '../../components/ui/Reveal';
import { useAuth } from '../../hooks/useAuth';
import { COLORS } from '../../theme/colors';
import { GRADIENT, gradientStyle, PAGE, RADIUS, SHADOW, TYPE } from '../../theme/tokens';
import {
  getWildcatScheduleStats,
  importWildcatSchedule,
  parseWildcatWebViewMessage,
  WILDCAT_IMPORT_WEEKS,
  WILDCAT_MAX_IMPORT_DAYS,
  WILDCAT_ONE_URL,
  type WildcatSchedulePayload,
} from '../../services/citScheduleService';
import { getGroupDetails, type GroupDetails } from '../../services/groupService';

const WILDCAT_CAPTURE_SCRIPT = `
  (function () {
    if (window.__PLANADO_SCHEDULE_CAPTURE__) return true;
    window.__PLANADO_SCHEDULE_CAPTURE__ = true;

    function isScheduleUrl(value) {
      try {
        return new URL(String(value), window.location.href).pathname.toLowerCase().includes('/schedule');
      } catch (_) {
        return false;
      }
    }

    function sendSchedule(value) {
      try {
        if (!value || Number(value.resultCode) !== 200 || !Array.isArray(value.items)) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PLANADO_SCHEDULE',
          payload: value
        }));
      } catch (_) {}
    }

    var originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = function () {
        var args = arguments;
        var request = args[0];
        var url = typeof request === 'string' ? request : request && request.url;
        return originalFetch.apply(this, args).then(function (response) {
          if (isScheduleUrl(url || response.url)) {
            response.clone().json().then(sendSchedule).catch(function () {});
          }
          return response;
        });
      };
    }

    var originalOpen = XMLHttpRequest.prototype.open;
    var originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__PLANADO_REQUEST_URL__ = String(url || '');
      return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      var request = this;
      if (isScheduleUrl(request.__PLANADO_REQUEST_URL__)) {
        request.addEventListener('loadend', function () {
          try {
            var value = request.responseType === 'json'
              ? request.response
              : JSON.parse(request.responseText);
            sendSchedule(value);
          } catch (_) {}
        }, { once: true });
      }
      return originalSend.apply(this, arguments);
    };
    return true;
  })();
  true;
`;

const WILDCAT_FORGET_ACCOUNT_SCRIPT = `
  (function () {
    try { window.localStorage.clear(); } catch (_) {}
    try { window.sessionStorage.clear(); } catch (_) {}
    try {
      document.cookie.split(';').forEach(function (cookie) {
        var name = cookie.split('=')[0].trim();
        if (!name) return;
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax';
      });
    } catch (_) {}
    try {
      if (window.caches) {
        caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (key) { return caches.delete(key); }));
        }).catch(function () {});
      }
    } catch (_) {}
    try {
      if (window.indexedDB && indexedDB.databases) {
        indexedDB.databases().then(function (databases) {
          databases.forEach(function (database) {
            if (database.name) indexedDB.deleteDatabase(database.name);
          });
        }).catch(function () {});
      }
    } catch (_) {}
    try {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
          registrations.forEach(function (registration) { registration.unregister(); });
        }).catch(function () {});
      }
    } catch (_) {}
    return true;
  })();
  true;
`;

function messageFromError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

function dateAfterToday(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function semesterDateLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export default function ConnectCitScheduleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string | string[] }>();
  const groupId = Array.isArray(params.groupId) ? params.groupId[0] : params.groupId;
  const { user, loading: authLoading } = useAuth();
  const webViewRef = useRef<WebView>(null);
  const [details, setDetails] = useState<GroupDetails | null>(null);
  const [schedule, setSchedule] = useState<WildcatSchedulePayload | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [webLoading, setWebLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const [endDatePickerVisible, setEndDatePickerVisible] = useState(false);
  const [semesterEndDate, setSemesterEndDate] = useState(
    () => dateAfterToday(WILDCAT_IMPORT_WEEKS * 7),
  );
  const [error, setError] = useState<string | null>(null);
  const [webSessionKey, setWebSessionKey] = useState(0);
  const [forgetOnNextLoad, setForgetOnNextLoad] = useState(true);

  useEffect(() => {
    if (!groupId || !user) return;
    let active = true;
    setLoadingGroup(true);
    void getGroupDetails(groupId)
      .then((value) => {
        if (!active) return;
        if (value.group.group_type !== 'cit_u_classmates') {
          setError('Schedule import is available only inside a CIT-U classmates group.');
          return;
        }
        setDetails(value);
      })
      .catch((loadError) => {
        if (active) setError(messageFromError(loadError, 'This group could not be loaded.'));
      })
      .finally(() => {
        if (active) setLoadingGroup(false);
      });
    return () => {
      active = false;
    };
  }, [groupId, user]);

  const stats = useMemo(() => schedule ? getWildcatScheduleStats(schedule) : null, [schedule]);
  const meetings = useMemo(() => schedule?.items.flatMap((course) => (
    course.schedule.map((meeting) => ({ course, meeting }))
  )) ?? [], [schedule]);

  function receiveMessage(event: WebViewMessageEvent) {
    const captured = parseWildcatWebViewMessage(event.nativeEvent.data);
    if (!captured) return;
    setSchedule(captured.payload);
    setError(null);
  }

  function forgetWildcatAccount() {
    Alert.alert(
      'Use another Wildcat account?',
      'Planado will erase the temporary Wildcat login from this private browser. Your imported calendar events will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget account',
          style: 'destructive',
          onPress: () => {
            webViewRef.current?.injectJavaScript(WILDCAT_FORGET_ACCOUNT_SCRIPT);
            webViewRef.current?.clearFormData?.();
            webViewRef.current?.clearHistory?.();
            webViewRef.current?.clearCache?.(true);
            setSchedule(null);
            setError(null);
            setProgress(0);
            setWebLoading(true);
            setForgetOnNextLoad(true);
            setWebSessionKey((value) => value + 1);
          },
        },
      ],
    );
  }

  async function importSchedule(endDate: Date) {
    if (!schedule || !groupId || !details || importing) return;
    setImporting(true);
    try {
      const result = await importWildcatSchedule({
        payload: schedule,
        groupId,
        color: details.group.color,
        endDate,
      });
      const changes = [
        `${result.added} added`,
        `${result.updated} updated`,
        result.removed ? `${result.removed} old ${result.removed === 1 ? 'entry' : 'entries'} removed` : '',
      ].filter(Boolean).join(', ');
      Alert.alert(
        'Schedule synced',
        `${result.total} private class events are scheduled through ${semesterDateLabel(endDate)} (${changes}). Importing again will update them without making duplicates.`,
        [
          { text: 'View calendar', onPress: () => router.replace('/(tabs)/calendar' as Href) },
          { text: 'Done', onPress: () => router.back() },
        ],
      );
    } catch (importError) {
      Alert.alert('Could not import schedule', messageFromError(importError, 'Please try again.'));
    } finally {
      setImporting(false);
    }
  }

  if (!authLoading && !user) return <Redirect href="/(auth)/login" />;

  if (authLoading || loadingGroup) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <PlanadoLoader fullScreen message="Preparing secure schedule import..." />
      </SafeAreaView>
    );
  }

  if (!groupId || error || !details) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onBack={() => router.back()} title="Connect CIT-U" />
        <View style={styles.centered}>
          <View style={styles.errorIcon}><Ionicons color={COLORS.red} name="alert-circle-outline" size={30} /></View>
          <Text style={styles.errorTitle}>Connection unavailable</Text>
          <Text style={styles.errorText}>{error ?? 'Open this page from a CIT-U group.'}</Text>
          <Button icon="arrow-back" label="Back to group" onPress={() => router.back()} size="md" style={styles.primaryButton} />
        </View>
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onBack={() => router.back()} title="Connect CIT-U" />
        <View style={styles.centered}>
          <View style={styles.platformIcon}><Ionicons color={COLORS.primary} name="phone-portrait-outline" size={31} /></View>
          <Text style={styles.errorTitle}>Open the Planado mobile app</Text>
          <Text style={styles.errorText}>The private Wildcat One connection runs only inside the installed Android or iOS app. Your regular Planado calendar still works on the web.</Text>
          <Button icon="arrow-back" label="Back to group" onPress={() => router.back()} size="md" style={styles.primaryButton} />
        </View>
      </SafeAreaView>
    );
  }

  if (schedule && stats) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onBack={() => setSchedule(null)} title="Review schedule" />
        <ScrollView contentContainerStyle={styles.previewContent}>
          <Reveal style={[styles.successHero, gradientStyle(GRADIENT.hero, GRADIENT.heroFallback)]}>
            <View style={styles.successIcon}><Ionicons color="#FFFFFF" name="checkmark" size={27} /></View>
            <Text style={styles.successEyebrow}>Schedule found</Text>
            <Text style={styles.successTitle}>{stats.courses} courses ready</Text>
            <Text style={styles.successBody}>Review the classes below before adding them to {details.group.name}.</Text>
            <View style={styles.statRow}>
              <Stat value={String(stats.courses)} label="Courses" />
              <View style={styles.statDivider} />
              <Stat value={String(stats.weeklyMeetings)} label="Weekly meetings" />
            </View>
          </Reveal>

          <View style={styles.privacyNotice}>
            <Ionicons color={COLORS.green} name="lock-closed-outline" size={18} />
            <Text style={styles.privacyText}>These events are private to you. Other group members import their own schedules separately.</Text>
          </View>

          <Text accessibilityRole="header" style={styles.sectionLabel}>Weekly classes</Text>
          <View style={styles.meetingList}>
            {meetings.map(({ course, meeting }, index) => (
              <View key={`${meeting.courseOfferingScheduleID}-${index}`}>
                <View style={styles.meetingRow}>
                  <View style={styles.courseIcon}><Text style={styles.courseInitial}>{course.courseCode.charAt(0)}</Text></View>
                  <View style={styles.meetingCopy}>
                    <View style={styles.meetingTitleRow}>
                      <Text numberOfLines={1} style={styles.meetingTitle}>{course.courseCode}</Text>
                      <Text style={styles.typeBadge}>{meeting.type}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.meetingDescription}>{course.description}</Text>
                    <View style={styles.meetingMetaRow}>
                      <Ionicons color={COLORS.primary} name="time-outline" size={15} />
                      <Text style={styles.meetingMeta}>{meeting.day.map((day) => day.code).join(', ')} · {meeting.timeFrom}–{meeting.timeTo}</Text>
                    </View>
                    {meeting.roomName ? (
                      <View style={styles.meetingMetaRow}>
                        <Ionicons color={COLORS.muted} name="location-outline" size={15} />
                        <Text style={styles.meetingMetaMuted}>{meeting.roomName}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                {index < meetings.length - 1 ? <View style={styles.separator} /> : null}
              </View>
            ))}
          </View>

          <View style={styles.endDateNotice}>
            <View style={styles.endDateIcon}>
              <Ionicons color={COLORS.primary} name="calendar-outline" size={20} />
            </View>
            <View style={styles.endDateCopy}>
              <Text style={styles.endDateTitle}>When does your semester end?</Text>
              <Text style={styles.endDateText}>Choose the exact last day. Weekly classes will only be created through that date.</Text>
            </View>
          </View>

          <Button
            icon="calendar-outline"
            label={importing ? 'Syncing schedule…' : 'Choose end date and import'}
            loading={importing}
            onPress={() => setEndDatePickerVisible(true)}
            style={styles.importButton}
          />
          <Button
            disabled={importing}
            icon="person-remove-outline"
            label="Use another Wildcat account"
            onPress={forgetWildcatAccount}
            size="md"
            style={styles.forgetButton}
            variant="danger"
          />
          <Text style={styles.importHint}>Safe to repeat: Planado syncs matching classes and removes stale future entries instead of duplicating them.</Text>
        </ScrollView>
        <PlanadoDateTimePicker
          confirmLabel="Import through this date"
          maximumDate={dateAfterToday(WILDCAT_MAX_IMPORT_DAYS)}
          minimumDate={dateAfterToday(0)}
          mode="date"
          onClose={() => setEndDatePickerVisible(false)}
          onConfirm={(date) => {
            setSemesterEndDate(date);
            void importSchedule(date);
          }}
          title="Semester end date"
          value={semesterEndDate}
          visible={endDatePickerVisible}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header onBack={() => router.back()} title="Connect Wildcat One" />
      <View style={styles.browserNotice}>
        <Ionicons color={COLORS.green} name="shield-checkmark-outline" size={18} />
        <View style={styles.browserNoticeCopy}>
          <Text style={styles.browserNoticeTitle}>Private sign-in</Text>
          <Text style={styles.browserNoticeText}>Sign in directly on Wildcat One. Planado only reads the successful schedule response—never your password, cookies, or tokens.</Text>
        </View>
      </View>
      <Pressable onPress={forgetWildcatAccount} style={({ pressed }) => [styles.switchAccountButton, pressed && styles.pressed]}>
        <Ionicons color={COLORS.red} name="refresh-outline" size={17} />
        <Text style={styles.switchAccountText}>Forget this login and use another account</Text>
      </Pressable>
      {webLoading ? <View style={styles.progressTrack}><View style={[styles.progressBar, { width: `${Math.max(progress * 100, 7)}%` }]} /></View> : null}
      <View style={styles.webFrame}>
        <WebView
          key={`wildcat-private-session-${webSessionKey}`}
          ref={webViewRef}
          source={{ uri: WILDCAT_ONE_URL }}
          injectedJavaScriptBeforeContentLoaded={`${forgetOnNextLoad ? WILDCAT_FORGET_ACCOUNT_SCRIPT : ''}\n${WILDCAT_CAPTURE_SCRIPT}`}
          onMessage={receiveMessage}
          onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
          onLoadStart={() => setWebLoading(true)}
          onLoadEnd={() => {
            setWebLoading(false);
            setForgetOnNextLoad(false);
          }}
          onError={() => setError('Wildcat One could not be opened. Check your connection and try again.')}
          onShouldStartLoadWithRequest={(request) => {
            if (request.url === 'about:blank') return true;
            try {
              return new URL(request.url).hostname === 'yeahsleepwellgoodluckveralove.vercel.app';
            } catch {
              return false;
            }
          }}
          originWhitelist={['https://*']}
          incognito
          cacheEnabled={false}
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          setSupportMultipleWindows={false}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={styles.webLoading}>
              <PlanadoLoader compact message="Opening Wildcat One..." />
            </View>
          )}
          style={styles.webView}
        />
      </View>
    </SafeAreaView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <IconButton icon="arrow-back" label="Go back" onPress={onBack} />
      <Text accessibilityRole="header" numberOfLines={1} style={styles.headerTitle}>{title}</Text>
      <View style={styles.secureBadge}>
        <Ionicons color={COLORS.green} name="lock-closed" size={13} />
        <Text style={styles.secureBadgeText}>Private</Text>
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    minHeight: 68,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    backgroundColor: COLORS.surface,
  },
  headerTitle: { ...TYPE.headline, flex: 1, color: COLORS.ink, fontWeight: '800' },
  secureBadge: { minHeight: 30, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: RADIUS.pill, backgroundColor: COLORS.greenSoft },
  secureBadgeText: { ...TYPE.footnote, color: COLORS.green, fontWeight: '700' },
  centered: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  errorIcon: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.lg, backgroundColor: COLORS.redSoft },
  platformIcon: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.lg, backgroundColor: COLORS.primarySoft },
  errorTitle: { width: '100%', ...TYPE.title3, marginTop: 18, color: COLORS.ink, textAlign: 'center' },
  errorText: { width: '100%', ...TYPE.body, maxWidth: 410, marginTop: 8, color: COLORS.muted, textAlign: 'center' },
  primaryButton: { marginTop: 22 },
  browserNotice: { margin: 12, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: RADIUS.md, backgroundColor: COLORS.greenSoft },
  browserNoticeCopy: { flex: 1 },
  browserNoticeTitle: { ...TYPE.callout, color: COLORS.green, fontWeight: '800' },
  browserNoticeText: { ...TYPE.subhead, marginTop: 2, color: COLORS.green, fontWeight: '400' },
  switchAccountButton: {
    minHeight: 44,
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.redSoft,
  },
  switchAccountText: { ...TYPE.subhead, color: COLORS.red, fontWeight: '700' },
  progressTrack: { height: 3, backgroundColor: COLORS.primarySoft },
  progressBar: { height: 3, borderRadius: 2, backgroundColor: COLORS.primary },
  webFrame: {
    flex: 1,
    overflow: 'hidden',
    marginHorizontal: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  webView: { flex: 1, backgroundColor: COLORS.surface },
  webLoading: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
  previewContent: { width: '100%', maxWidth: PAGE.maxWidth, alignSelf: 'center', padding: 16, paddingBottom: 40 },
  successHero: { padding: 22, alignItems: 'center', overflow: 'hidden', borderRadius: RADIUS.xxl, boxShadow: SHADOW.md },
  successIcon: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: 'rgba(255,255,255,0.18)' },
  successEyebrow: { width: '100%', ...TYPE.overline, marginTop: 14, color: '#C9CAFF', textAlign: 'center' },
  successTitle: { width: '100%', ...TYPE.title2, marginTop: 4, color: '#FFFFFF', fontWeight: '800', textAlign: 'center' },
  successBody: { width: '100%', ...TYPE.callout, maxWidth: 360, marginTop: 6, color: 'rgba(255,255,255,0.82)', fontWeight: '400', textAlign: 'center' },
  statRow: { width: '100%', marginTop: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.md, backgroundColor: 'rgba(255,255,255,0.1)' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, lineHeight: 26, color: '#FFFFFF', fontWeight: '800' },
  statLabel: { width: '100%', ...TYPE.footnote, marginTop: 2, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  statDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.16)' },
  privacyNotice: { marginTop: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: RADIUS.md, backgroundColor: COLORS.greenSoft },
  privacyText: { ...TYPE.subhead, flex: 1, color: COLORS.green, fontWeight: '500' },
  sectionLabel: { ...TYPE.overline, marginTop: 26, marginBottom: 10, color: COLORS.muted },
  meetingList: { overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.xl, backgroundColor: COLORS.surface },
  meetingRow: { padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  courseIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.primarySoft },
  courseInitial: { ...TYPE.title3, color: COLORS.primary, fontWeight: '800' },
  meetingCopy: { flex: 1 },
  meetingTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meetingTitle: { ...TYPE.headline, flexShrink: 1, color: COLORS.ink },
  typeBadge: {
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
  meetingDescription: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  meetingMetaRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  meetingMeta: { ...TYPE.subhead, color: COLORS.ink, fontWeight: '600' },
  meetingMetaMuted: { ...TYPE.subhead, color: COLORS.muted, fontWeight: '400' },
  separator: { height: 1, marginLeft: 72, backgroundColor: COLORS.line },
  endDateNotice: {
    marginTop: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  endDateIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.primarySoft },
  endDateCopy: { flex: 1 },
  endDateTitle: { ...TYPE.headline, color: COLORS.ink },
  endDateText: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  importButton: { marginTop: 12 },
  forgetButton: { marginTop: 10 },
  importHint: { ...TYPE.footnote, marginTop: 10, color: COLORS.muted, textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
