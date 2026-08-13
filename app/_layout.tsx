import Stack from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';

import { PlanadoAlertProvider } from '../components/PlanadoAlert';
import { WidgetSync } from '../components/WidgetSync';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <WidgetSync />
      <PlanadoAlertProvider>
        <StatusBar style="auto" />

        <Stack
          screenOptions={{
            headerShown: false,
          }}
        />
      </PlanadoAlertProvider>
    </AuthProvider>
  );
}
