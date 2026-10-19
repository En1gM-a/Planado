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
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const refresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void refreshSelectedWidget().catch((error) => {
          console.warn('Could not refresh the Planado widget:', error);
        });
      }, 600);
    };

    const startupTimer = setTimeout(() => {
      refresh();
      channel = supabase
        .channel(`widget-sync:${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, refresh)
        .subscribe();
    }, 2_500);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });

    return () => {
      clearTimeout(startupTimer);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      appStateSubscription.remove();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
}
