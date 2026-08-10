import { Redirect, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { getMyProfile } from '../services/authService';

export default function IndexScreen() {
  const { loading: authLoading, isAuthenticated, user } = useAuth();
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [destination, setDestination] = useState<Href | null>(null);

  useEffect(() => {
    let active = true;

    async function chooseDestination() {
      if (authLoading) return;

      if (!isAuthenticated || !user) {
        if (active) setDestination('/login');
        return;
      }

      setCheckingProfile(true);

      try {
        const profile = await getMyProfile();
        if (!active) return;

        setDestination(
          profile?.onboarding_completed
            ? '/(tabs)/home'
            : ('/(auth)/complete-profile' as Href),
        );
      } catch (error) {
        console.error('Could not determine onboarding status:', error);
        if (active) setDestination('/(auth)/complete-profile' as Href);
      } finally {
        if (active) setCheckingProfile(false);
      }
    }

    void chooseDestination();

    return () => {
      active = false;
    };
  }, [authLoading, isAuthenticated, user]);

  if (destination) {
    return <Redirect href={destination} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.logo}>
        <View style={styles.logoLine} />
        <View style={styles.logoDot} />
      </View>
      <Text style={styles.name}>Planado</Text>
      <ActivityIndicator color="#5B5CE2" size="small" />
      <Text style={styles.message}>
        {checkingProfile ? 'Checking your profile...' : 'Loading your plans...'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F7F7FC' },
  logo: { width: 56, height: 56, padding: 12, borderRadius: 18, backgroundColor: '#5B5CE2', shadowColor: '#5B5CE2', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 9 } },
  logoLine: { height: 5, borderRadius: 5, backgroundColor: '#FFFFFF' },
  logoDot: { width: 13, height: 13, marginTop: 9, marginLeft: 19, borderRadius: 5, backgroundColor: '#FFFFFF' },
  name: { color: '#202027', fontSize: 24, fontWeight: '800', letterSpacing: -0.8 },
  message: { color: '#858590', fontSize: 11 },
});
