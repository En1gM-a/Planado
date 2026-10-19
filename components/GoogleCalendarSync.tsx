import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { syncGoogleCalendar } from '../services/googleCalendarService';

const LOCAL_SYNC_THROTTLE_MS = 15 * 60 * 1000;

export function GoogleCalendarSync() {
  const { user } = useAuth();
  const lastAttemptAtRef = useRef(0);

  useEffect(() => {
    if (!user) return;

    const sync = () => {
      const now = Date.now();
      if (now - lastAttemptAtRef.current < LOCAL_SYNC_THROTTLE_MS) return;
      lastAttemptAtRef.current = now;

      void syncGoogleCalendar(false).catch((error) => {
        console.warn('Google Calendar background sync was skipped:', error);
      });
    };

    const startupTimer = setTimeout(sync, 5_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    return () => {
      clearTimeout(startupTimer);
      subscription.remove();
    };
  }, [user]);

  return null;
}
