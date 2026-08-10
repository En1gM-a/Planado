import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../hooks/useAuth';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const name =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email?.split('@')[0] ??
    'friend';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>WELCOME TO PLANADO</Text>
        <Text style={styles.title}>You&apos;re all set, {name}.</Text>
        <Text style={styles.subtitle}>
          Your profile is ready. Groups, events, and the shared calendar are the
          next pieces to connect.
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>BACKEND STATUS</Text>
          <Text style={styles.cardTitle}>Google authentication connected</Text>
          <Text style={styles.cardBody}>
            This is a temporary authenticated landing screen. The full Home UI
            can now be built safely on top of the session flow.
          </Text>
        </View>
        <Pressable onPress={() => void signOut()} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F7FC' },
  container: { flex: 1, width: '100%', maxWidth: 620, alignSelf: 'center', padding: 24, justifyContent: 'center' },
  eyebrow: { color: '#5B5CE2', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { marginTop: 10, color: '#19191F', fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1.3 },
  subtitle: { marginTop: 10, color: '#6F6F7A', fontSize: 15, lineHeight: 23 },
  card: { marginTop: 28, padding: 21, borderWidth: 1, borderColor: '#E5E5ED', borderRadius: 22, backgroundColor: '#FFFFFF' },
  cardLabel: { color: '#2F9E6F', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  cardTitle: { marginTop: 8, color: '#24242B', fontSize: 17, fontWeight: '800' },
  cardBody: { marginTop: 7, color: '#757580', fontSize: 13, lineHeight: 20 },
  signOutButton: { alignSelf: 'flex-start', marginTop: 22, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#DFDFE8', borderRadius: 12, backgroundColor: '#FFFFFF' },
  signOutText: { color: '#5B5CE2', fontSize: 13, fontWeight: '800' },
});
