import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlanadoLoader } from '../components/PlanadoLoader';
import { Button } from '../components/ui/Button';
import { Reveal } from '../components/ui/Reveal';
import { useAuth } from '../hooks/useAuth';
import {
  getCachedOnboardingStatus,
  getMyProfile,
  setCachedOnboardingStatus,
} from '../services/authService';
import { COLORS } from '../theme/colors';
import { RADIUS, SHADOW, TYPE } from '../theme/tokens';

export default function IndexScreen() {
  const { loading: authLoading, isAuthenticated, user } = useAuth();
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [destination, setDestination] = useState<Href | null>(null);
  const [startupError, setStartupError] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function chooseDestination() {
      if (authLoading) return;
      setDestination(null);
      setStartupError(false);

      if (!isAuthenticated || !user) {
        if (active) setDestination('/login');
        return;
      }

      setCheckingProfile(true);

      try {
        const cachedStatus = await getCachedOnboardingStatus(user.id).catch((cacheError) => {
          console.warn('Could not read cached onboarding status:', cacheError);
          return null;
        });
        if (!active) return;

        if (cachedStatus !== null) {
          setDestination(
            cachedStatus
              ? '/(tabs)/home'
              : ('/(auth)/complete-profile' as Href),
          );
          return;
        }

        const profile = await getMyProfile(user.id);
        if (!active) return;

        const onboardingCompleted = Boolean(profile?.onboarding_completed);
        await setCachedOnboardingStatus(user.id, onboardingCompleted);
        if (!active) return;

        setDestination(
          onboardingCompleted
            ? '/(tabs)/home'
            : ('/(auth)/complete-profile' as Href),
        );
      } catch (error) {
        console.error('Could not determine onboarding status:', error);
        if (active) setStartupError(true);
      } finally {
        if (active) setCheckingProfile(false);
      }
    }

    void chooseDestination();

    return () => {
      active = false;
    };
  }, [authLoading, isAuthenticated, retryAttempt, user]);

  if (destination) {
    return <Redirect href={destination} />;
  }

  if (startupError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Reveal style={styles.errorCard}>
          <View style={styles.errorIcon}>
            <Ionicons color={COLORS.primary} name="cloud-offline-outline" size={32} />
          </View>
          <Text accessibilityRole="header" style={styles.errorTitle}>Planado could not connect</Text>
          <Text style={styles.errorBody}>Check your internet connection, then try opening your plans again.</Text>
          <Button
            icon="refresh"
            label="Try again"
            onPress={() => setRetryAttempt((attempt) => attempt + 1)}
            size="md"
            style={styles.retryButton}
          />
        </Reveal>
      </SafeAreaView>
    );
  }

  return (
    <PlanadoLoader
      fullScreen
      message={checkingProfile ? 'Checking your profile...' : 'Loading your plans...'}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  errorCard: {
    width: '100%',
    maxWidth: 400,
    padding: 26,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.xxl,
    backgroundColor: COLORS.surface,
    boxShadow: SHADOW.md,
  },
  errorIcon: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.lg, backgroundColor: COLORS.primarySoft },
  errorTitle: { width: '100%', ...TYPE.title3, marginTop: 18, color: COLORS.ink, textAlign: 'center' },
  errorBody: { width: '100%', ...TYPE.body, marginTop: 8, color: COLORS.muted, textAlign: 'center' },
  retryButton: { marginTop: 22, alignSelf: 'stretch' },
});
