import Stack from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';

import { PlanadoAlertProvider } from '../components/PlanadoAlert';
import { WidgetSync } from '../components/WidgetSync';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { usePlanadoTheme } from '../hooks/usePlanadoTheme';
import { COLORS } from '../theme/colors';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ThemedRootLayout />
    </ThemeProvider>
  );
}

function ThemedRootLayout() {
  const { isDark } = usePlanadoTheme();

  return (
    <AuthProvider>
      <WidgetSync />
      <PlanadoAlertProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />

        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: COLORS.background },
            headerShown: false,
          }}
        />
      </PlanadoAlertProvider>
    </AuthProvider>
  );
}
