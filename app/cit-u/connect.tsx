import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { useAuth } from '../../hooks/useAuth';
import {
  getWildcatScheduleStats,
  importWildcatSchedule,
  parseWildcatWebViewMessage,
  WILDCAT_IMPORT_WEEKS,
  WILDCAT_ONE_URL,
  type WildcatSchedulePayload,
} from '../../services/citScheduleService';
import { getGroupDetails, type GroupDetails } from '../../services/groupService';

const COLORS = {
  background: '#F6F6FB',
  surface: '#FFFFFF',
  ink: '#202027',
  muted: '#777782',
  faint: '#A1A1AC',
  line: '#E7E7EF',
  primary: '#5B5CE2',
  primarySoft: '#EEEEFF',
  green: '#24966B',
  greenSoft: '#E9F8F1',
  orange: '#D9792E',
  orangeSoft: '#FFF2E7',
  red: '#C9515A',
  redSoft: '#FFF0F1',
};

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

  async function importSchedule() {
    if (!schedule || !groupId || !details || importing) return;
    setImporting(true);
    try {
      const result = await importWildcatSchedule({
        payload: schedule,
        groupId,
        color: details.group.color,
      });
      Alert.alert(
        'Schedule imported',
        `${result.imported} private class events were added or updated for the next ${result.weeks} weeks.`,
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
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={styles.loadingText}>Preparing secure schedule import...</Text>
        </View>
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
          <Pressable onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Back to group</Text>
          </Pressable>
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
          <Pressable onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Back to group</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (schedule && stats) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onBack={() => setSchedule(null)} title="Review schedule" />
        <ScrollView contentContainerStyle={styles.previewContent}>
          <View style={styles.successHero}>
            <View style={styles.successIcon}><Ionicons color="#FFFFFF" name="checkmark" size={27} /></View>
            <Text style={styles.successEyebrow}>SCHEDULE FOUND</Text>
            <Text style={styles.successTitle}>{stats.courses} courses ready</Text>
            <Text style={styles.successBody}>Review the classes below before adding them to {details.group.name}.</Text>
            <View style={styles.statRow}>
              <Stat value={String(stats.courses)} label="COURSES" />
              <View style={styles.statDivider} />
              <Stat value={String(stats.weeklyMeetings)} label="WEEKLY MEETINGS" />
              <View style={styles.statDivider} />
              <Stat value={`${WILDCAT_IMPORT_WEEKS}`} label="WEEKS" />
            </View>
          </View>

          <View style={styles.privacyNotice}>
            <Ionicons color={COLORS.green} name="lock-closed-outline" size={18} />
            <Text style={styles.privacyText}>These events are private to you. Other group members import their own schedules separately.</Text>
          </View>

          <Text style={styles.sectionLabel}>WEEKLY CLASSES</Text>
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
                      <Ionicons color={COLORS.primary} name="time-outline" size={13} />
                      <Text style={styles.meetingMeta}>{meeting.day.map((day) => day.code).join(', ')} · {meeting.timeFrom}–{meeting.timeTo}</Text>
                    </View>
                    {meeting.roomName ? (
                      <View style={styles.meetingMetaRow}>
                        <Ionicons color={COLORS.faint} name="location-outline" size={13} />
                        <Text style={styles.meetingMetaMuted}>{meeting.roomName}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                {index < meetings.length - 1 ? <View style={styles.separator} /> : null}
              </View>
            ))}
          </View>

          <Pressable disabled={importing} onPress={() => void importSchedule()} style={({ pressed }) => [styles.importButton, pressed && styles.pressed, importing && styles.disabled]}>
            {importing ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons color="#FFFFFF" name="calendar-outline" size={20} />}
            <Text style={styles.importButtonText}>{importing ? 'Importing schedule...' : 'Import my schedule'}</Text>
          </Pressable>
          <Pressable disabled={importing} onPress={forgetWildcatAccount} style={({ pressed }) => [styles.forgetButton, pressed && styles.pressed]}>
            <Ionicons color={COLORS.red} name="person-remove-outline" size={18} />
            <Text style={styles.forgetButtonText}>Use another Wildcat account</Text>
          </Pressable>
          <Text style={styles.importHint}>Importing again safely updates matching classes instead of duplicating them.</Text>
        </ScrollView>
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
        <Ionicons color={COLORS.red} name="refresh-outline" size={15} />
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
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={styles.loadingText}>Opening Wildcat One...</Text>
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
      <Pressable hitSlop={8} onPress={onBack} style={styles.headerButton}>
        <Ionicons color={COLORS.ink} name="arrow-back" size={22} />
      </Pressable>
      <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
      <View style={styles.secureBadge}>
        <Ionicons color={COLORS.green} name="lock-closed" size={11} />
        <Text style={styles.secureBadgeText}>PRIVATE</Text>
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
  header: { minHeight: 62, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line, backgroundColor: COLORS.surface },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, backgroundColor: COLORS.surface },
  headerTitle: { flex: 1, color: COLORS.ink, fontSize: 16, fontWeight: '900' },
  secureBadge: { paddingVertical: 6, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, backgroundColor: COLORS.greenSoft },
  secureBadgeText: { color: COLORS.green, fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  centered: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 11, color: COLORS.muted, fontSize: 11 },
  errorIcon: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: COLORS.redSoft },
  platformIcon: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: COLORS.primarySoft },
  errorTitle: { marginTop: 17, color: COLORS.ink, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  errorText: { maxWidth: 410, marginTop: 8, color: COLORS.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  primaryButton: { minHeight: 48, marginTop: 20, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: COLORS.primary },
  primaryButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  browserNotice: { margin: 12, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 16, backgroundColor: COLORS.greenSoft },
  browserNoticeCopy: { flex: 1 },
  browserNoticeTitle: { color: COLORS.green, fontSize: 10, fontWeight: '900' },
  browserNoticeText: { marginTop: 3, color: '#4D7767', fontSize: 8, lineHeight: 13 },
  switchAccountButton: { minHeight: 38, marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#F0D8DB', borderRadius: 13, backgroundColor: COLORS.redSoft },
  switchAccountText: { color: COLORS.red, fontSize: 9, fontWeight: '800' },
  progressTrack: { height: 3, backgroundColor: COLORS.primarySoft },
  progressBar: { height: 3, backgroundColor: COLORS.primary },
  webFrame: { flex: 1, overflow: 'hidden', marginHorizontal: 10, marginBottom: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: 19, backgroundColor: COLORS.surface },
  webView: { flex: 1, backgroundColor: COLORS.surface },
  webLoading: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
  previewContent: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16, paddingBottom: 40 },
  successHero: { padding: 22, alignItems: 'center', overflow: 'hidden', borderRadius: 27, backgroundColor: '#29285B' },
  successIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: COLORS.primary },
  successEyebrow: { marginTop: 14, color: '#B9BAFF', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  successTitle: { marginTop: 5, color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  successBody: { maxWidth: 360, marginTop: 7, color: '#C6C6DC', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  statRow: { width: '100%', marginTop: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.08)' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  statLabel: { marginTop: 3, color: '#AFAFCB', fontSize: 6, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.13)' },
  privacyNotice: { marginTop: 13, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 16, backgroundColor: COLORS.greenSoft },
  privacyText: { flex: 1, color: '#4D7767', fontSize: 9, lineHeight: 14 },
  sectionLabel: { marginTop: 23, marginBottom: 9, color: COLORS.faint, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  meetingList: { overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line, borderRadius: 22, backgroundColor: COLORS.surface },
  meetingRow: { padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  courseIcon: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: COLORS.primarySoft },
  courseInitial: { color: COLORS.primary, fontSize: 17, fontWeight: '900' },
  meetingCopy: { flex: 1 },
  meetingTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  meetingTitle: { flexShrink: 1, color: COLORS.ink, fontSize: 11, fontWeight: '900' },
  typeBadge: { paddingVertical: 3, paddingHorizontal: 6, overflow: 'hidden', color: COLORS.primary, fontSize: 6, fontWeight: '900', borderRadius: 7, backgroundColor: COLORS.primarySoft },
  meetingDescription: { marginTop: 3, color: COLORS.muted, fontSize: 8 },
  meetingMetaRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  meetingMeta: { color: COLORS.ink, fontSize: 8, fontWeight: '700' },
  meetingMetaMuted: { color: COLORS.muted, fontSize: 8 },
  separator: { height: 1, marginLeft: 67, backgroundColor: COLORS.line },
  importButton: { minHeight: 54, marginTop: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, backgroundColor: COLORS.primary },
  importButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  forgetButton: { minHeight: 47, marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: '#F0D8DB', borderRadius: 16, backgroundColor: COLORS.redSoft },
  forgetButtonText: { color: COLORS.red, fontSize: 10, fontWeight: '900' },
  importHint: { marginTop: 8, color: COLORS.faint, fontSize: 8, lineHeight: 12, textAlign: 'center' },
  pressed: { opacity: 0.77, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.62 },
});
