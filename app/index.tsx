import { Redirect, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import { PlanadoLoader } from '../components/PlanadoLoader';
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
    <PlanadoLoader
      fullScreen
      message={checkingProfile ? 'Checking your profile...' : 'Loading your plans...'}
    />
  );
}
