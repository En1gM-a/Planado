import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlanadoLoader } from '../../components/PlanadoLoader';
import { useAuth } from '../../hooks/useAuth';
import { COLORS } from '../../theme/colors';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { loading, user } = useAuth();

  if (loading) {
    return <PlanadoLoader fullScreen message="Opening Planado..." />;
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: COLORS.background },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.faint,
        tabBarStyle: {
          height: 60 + Math.max(insets.bottom, 8),
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          borderTopColor: COLORS.line,
          backgroundColor: COLORS.surface,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
      }}
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
