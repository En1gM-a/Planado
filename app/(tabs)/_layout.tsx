import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useSegments } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { PlanadoLoader } from '../../components/PlanadoLoader';
import { PlanadoTabBar } from '../../components/PlanadoTabBar';
import { useAuth } from '../../hooks/useAuth';
import { usePlanadoTheme } from '../../hooks/usePlanadoTheme';
import { COLORS } from '../../theme/colors';

const TAB_NAMES = ['home', 'calendar', 'groups', 'profile'] as const;

export default function TabsLayout() {
  const { loading, user } = useAuth();
  const { revision } = usePlanadoTheme();
  const segments = useSegments() as string[];
  // A theme switch remounts the tabs (see ThemeContext); reopen on the same tab.
  const currentTab = TAB_NAMES.find((name) => name === segments[1]) ?? 'home';

  if (loading) {
    return <PlanadoLoader fullScreen message="Opening Planado..." />;
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      initialRouteName={currentTab}
      key={revision}
      screenOptions={{
        animation: 'shift',
        headerShown: false,
        sceneStyle: { backgroundColor: COLORS.background },
      }}
      tabBar={(props) => <PlanadoTabBar {...props} />}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons color={color} name={focused ? 'home' : 'home-outline'} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons color={color} name={focused ? 'calendar' : 'calendar-outline'} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons color={color} name={focused ? 'people' : 'people-outline'} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons color={color} name={focused ? 'person' : 'person-outline'} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
