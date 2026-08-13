import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabase';
import { refreshSelectedWidget } from '../services/widgetService';

export function WidgetSync() {
  const { user } = useAuth();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android' || !user) return;

    const refresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void refreshSelectedWidget().catch((error) => {
          console.warn('Could not refresh the Planado widget:', error);
        });
      }, 600);
    };

    refresh();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const channel = supabase
      .channel(`widget-sync:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, refresh)
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      appStateSubscription.remove();
      void supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
}
