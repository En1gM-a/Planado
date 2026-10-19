import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  getAvailableNativeUpdate,
  type AvailableNativeUpdate,
} from '../services/appReleaseService';
import { COLORS } from '../theme/colors';
import { GRADIENT, gradientStyle, RADIUS, SHADOW, TYPE } from '../theme/tokens';
import { PlanadoAlert } from './PlanadoAlert';
import { Button } from './ui/Button';
import { ModalCard } from './ui/motion';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const STARTUP_CHECK_DELAY_MS = 3_000;
const DISMISSED_BUILD_KEY = '@planado/dismissed-native-build';

export function MajorUpdateGate() {
  const [availableUpdate, setAvailableUpdate] = useState<AvailableNativeUpdate | null>(null);
  const [openingDownload, setOpeningDownload] = useState(false);
  const checkingRef = useRef(false);
  const lastCheckedAtRef = useRef(0);

  const checkForNativeUpdate = useCallback(async (force = false) => {
    if (checkingRef.current || (Platform.OS !== 'android' && Platform.OS !== 'ios')) return;

    const now = Date.now();
    if (!force && now - lastCheckedAtRef.current < CHECK_INTERVAL_MS) return;

    checkingRef.current = true;
    lastCheckedAtRef.current = now;

    try {
      const nextUpdate = await getAvailableNativeUpdate();
      if (!nextUpdate) {
        setAvailableUpdate(null);
        return;
      }

      if (!nextUpdate.required) {
        const dismissedBuild = await AsyncStorage.getItem(DISMISSED_BUILD_KEY);
        if (dismissedBuild === String(nextUpdate.release.latest_build_number)) return;
      }

      setAvailableUpdate(nextUpdate);
    } catch (error) {
      // An offline app should still open normally. The check will run again later.
      console.warn('Could not check for a native Planado update:', error);
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    lastCheckedAtRef.current = Date.now();
    const startupTimer = setTimeout(() => {
      void checkForNativeUpdate(true);
    }, STARTUP_CHECK_DELAY_MS);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForNativeUpdate();
    });

    return () => {
      clearTimeout(startupTimer);
      subscription.remove();
    };
  }, [checkForNativeUpdate]);

  async function postponeUpdate() {
    if (!availableUpdate || availableUpdate.required) return;

    await AsyncStorage.setItem(
      DISMISSED_BUILD_KEY,
      String(availableUpdate.release.latest_build_number),
    ).catch((error) => console.warn('Could not remember the postponed update:', error));
    setAvailableUpdate(null);
  }

  async function openDownload() {
    if (!availableUpdate || openingDownload) return;

    setOpeningDownload(true);
    try {
      await Linking.openURL(availableUpdate.release.download_url);
    } catch (error) {
      console.warn('Could not open the Planado download page:', error);
      PlanadoAlert.alert(
        'Could not open update',
        'Please check your connection and try opening the download again.',
      );
    } finally {
      setOpeningDownload(false);
    }
  }

  const release = availableUpdate?.release;
  const required = availableUpdate?.required ?? false;

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (!required) void postponeUpdate();
      }}
      statusBarTranslucent
      transparent
      visible={Boolean(availableUpdate)}
    >
      <View style={styles.overlay}>
        {!required ? (
          <Pressable
            accessibilityLabel="Postpone update"
            onPress={() => void postponeUpdate()}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        {availableUpdate && release ? (
          <ModalCard style={styles.card}>
            <View style={[styles.hero, gradientStyle(GRADIENT.hero, GRADIENT.heroFallback)]}>
              <View style={styles.iconWrap}>
                <Ionicons color="#FFFFFF" name="arrow-up-circle" size={34} />
              </View>
              <View style={styles.badge}>
                <View style={styles.badgeDot} />
                <Text numberOfLines={1} style={styles.badgeText}>{required ? 'REQUIRED UPDATE' : 'NEW VERSION'}</Text>
              </View>
            </View>

            <View style={styles.body}>
              <Text style={styles.eyebrow}>PLANADO {release.version_name}</Text>
              <Text style={styles.title}>{release.title}</Text>
              <Text style={styles.message}>{release.message}</Text>

              <View style={styles.versionRow}>
                <View style={styles.versionItem}>
                  <Text style={styles.versionLabel}>Installed</Text>
                  <Text style={styles.versionValue}>
                    {availableUpdate.currentVersionName}
                    {availableUpdate.currentBuildNumber === null ? '' : ` · Build ${availableUpdate.currentBuildNumber}`}
                  </Text>
                </View>
                <Ionicons color={COLORS.faint} name="arrow-forward" size={17} />
                <View style={[styles.versionItem, styles.versionItemRight]}>
                  <Text style={styles.versionLabel}>Available</Text>
                  <Text style={[styles.versionValue, styles.newVersion]}>
                    {release.version_name} ·{' '}
                    {availableUpdate.nativeCapabilityMissing
                      ? 'Native refresh'
                      : `Build ${release.latest_build_number}`}
                  </Text>
                </View>
              </View>

              {required ? (
                <View style={styles.requiredNote}>
                  <Ionicons color={COLORS.orange} name="shield-checkmark-outline" size={18} />
                  <Text style={styles.requiredText}>
                    Install this version to keep using Planado safely.
                  </Text>
                </View>
              ) : null}

              <Button
                icon="download-outline"
                label={openingDownload ? 'Opening download…' : 'Install update'}
                loading={openingDownload}
                onPress={() => void openDownload()}
                style={styles.updateButton}
              />

              {!required ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void postponeUpdate()}
                  style={({ pressed }) => [styles.laterButton, pressed && styles.pressed]}
                >
                  <Text style={styles.laterButtonText}>Maybe later</Text>
                </Pressable>
              ) : null}
            </View>
          </ModalCard>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 10, 22, 0.7)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
    borderRadius: RADIUS.xxl,
    backgroundColor: COLORS.surface,
    boxShadow: SHADOW.lg,
  },
  hero: {
    height: 148,
    padding: 22,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  iconWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  badge: {
    minHeight: 32,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(18, 18, 52, 0.45)',
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#7BE3BA',
  },
  badgeText: { ...TYPE.footnote, color: '#FFFFFF', fontWeight: '800', letterSpacing: 0.6 },
  body: { padding: 22 },
  eyebrow: { ...TYPE.overline, color: COLORS.primary },
  title: { ...TYPE.title2, marginTop: 6, color: COLORS.ink, fontWeight: '800' },
  message: { ...TYPE.body, marginTop: 8, color: COLORS.muted },
  versionRow: {
    marginTop: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.elevated,
  },
  versionItem: { flex: 1 },
  versionItemRight: { alignItems: 'flex-end' },
  versionLabel: { ...TYPE.overline, color: COLORS.muted },
  versionValue: { ...TYPE.subhead, marginTop: 3, color: COLORS.ink, fontWeight: '700' },
  newVersion: { color: COLORS.primary },
  requiredNote: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.orangeSoft,
  },
  requiredText: { ...TYPE.subhead, flex: 1, color: COLORS.orange, fontWeight: '700' },
  updateButton: { marginTop: 18 },
  laterButton: { minHeight: 48, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  laterButtonText: { ...TYPE.callout, color: COLORS.muted, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
