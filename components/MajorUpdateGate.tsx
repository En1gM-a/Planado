import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { PlanadoAlert } from './PlanadoAlert';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
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
    void checkForNativeUpdate(true);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForNativeUpdate();
    });

    return () => subscription.remove();
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
          <View accessibilityViewIsModal style={styles.card}>
            <View style={styles.hero}>
              <View style={styles.heroGlowOne} />
              <View style={styles.heroGlowTwo} />
              <View style={styles.iconWrap}>
                <Ionicons color="#FFFFFF" name="arrow-up-circle" size={34} />
              </View>
              <View style={styles.badge}>
                <View style={styles.badgeDot} />
                <Text style={styles.badgeText}>{required ? 'REQUIRED UPDATE' : 'NEW VERSION'}</Text>
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
                    {availableUpdate.currentVersionName} · Build {availableUpdate.currentBuildNumber}
                  </Text>
                </View>
                <Ionicons color={COLORS.faint} name="arrow-forward" size={17} />
                <View style={[styles.versionItem, styles.versionItemRight]}>
                  <Text style={styles.versionLabel}>Available</Text>
                  <Text style={[styles.versionValue, styles.newVersion]}>
                    {release.version_name} · Build {release.latest_build_number}
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

              <Pressable
                disabled={openingDownload}
                onPress={() => void openDownload()}
                style={({ pressed }) => [
                  styles.updateButton,
                  (pressed || openingDownload) && styles.pressed,
                ]}
              >
                {openingDownload ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Ionicons color="#FFFFFF" name="download-outline" size={19} />
                )}
                <Text style={styles.updateButtonText}>
                  {openingDownload ? 'Opening download...' : 'Install update'}
                </Text>
              </Pressable>

              {!required ? (
                <Pressable
                  onPress={() => void postponeUpdate()}
                  style={({ pressed }) => [styles.laterButton, pressed && styles.pressed]}
                >
                  <Text style={styles.laterButtonText}>Maybe later</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
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
    backgroundColor: 'rgba(15, 15, 28, 0.72)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
    borderRadius: 30,
    backgroundColor: COLORS.surface,
    shadowColor: '#0C0C18',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.32,
    shadowRadius: 34,
    elevation: 20,
  },
  hero: {
    height: 144,
    padding: 22,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: '#5758DC',
  },
  heroGlowOne: {
    position: 'absolute',
    width: 180,
    height: 180,
    top: -94,
    right: -35,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  heroGlowTwo: {
    position: 'absolute',
    width: 130,
    height: 130,
    bottom: -92,
    left: 54,
    borderRadius: 65,
    backgroundColor: 'rgba(118,220,184,0.20)',
  },
  iconWrap: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  badge: {
    minHeight: 30,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 99,
    backgroundColor: 'rgba(28,28,70,0.44)',
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#76DCB8',
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  body: { padding: 23 },
  eyebrow: { color: COLORS.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: {
    marginTop: 8,
    color: COLORS.ink,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.65,
  },
  message: { marginTop: 10, color: COLORS.muted, fontSize: 13, lineHeight: 20 },
  versionRow: {
    marginTop: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 18,
    backgroundColor: COLORS.elevated,
  },
  versionItem: { flex: 1 },
  versionItemRight: { alignItems: 'flex-end' },
  versionLabel: { color: COLORS.faint, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  versionValue: { marginTop: 4, color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  newVersion: { color: COLORS.primary },
  requiredNote: {
    marginTop: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 15,
    backgroundColor: COLORS.orangeSoft,
  },
  requiredText: { flex: 1, color: COLORS.orange, fontSize: 11, fontWeight: '800', lineHeight: 16 },
  updateButton: {
    minHeight: 52,
    marginTop: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
  },
  updateButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  laterButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  laterButtonText: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
