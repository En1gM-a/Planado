import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PlanadoAlert as Alert } from '../../components/PlanadoAlert';
import { useAuth } from '../../hooks/useAuth';
import { signInWithGoogle } from '../../services/authService';

export default function LoginScreen() {
  const router = useRouter();
  const { isAuthenticated, loading: sessionLoading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  if (!sessionLoading && isAuthenticated) {
    return <Redirect href="/" />;
  }

  async function handleGoogleLogin() {
    if (signingIn) return;

    try {
      setSigningIn(true);
      const session = await signInWithGoogle();

      if (session) {
        router.replace('/');
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Planado could not complete Google sign-in.';

      Alert.alert('Could not sign in', message);
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.background}>
        <View style={[styles.glow, styles.glowTop]} />
        <View style={[styles.glow, styles.glowBottom]} />

        <View style={styles.page}>
          <View style={styles.content}>
            <View style={styles.brand}>
              <View style={styles.logo}>
                <View style={styles.logoTop} />
                <View style={styles.logoGrid}>
                  <View style={styles.logoDot} />
                  <View style={[styles.logoDot, styles.logoDotAccent]} />
                  <View style={styles.logoDot} />
                  <View style={[styles.logoDot, styles.logoDotAccent]} />
                </View>
              </View>
              <Text style={styles.brandName}>Planado</Text>
            </View>

            <View style={styles.heroCopy}>
              <Text style={styles.title}>Make time for{`\n`}your people.</Text>
              <Text style={styles.subtitle}>
                One shared calendar for every plan that matters.
              </Text>
            </View>

            <View style={styles.illustration}>
              <View style={styles.illustrationBack} />
              <View style={styles.calendarCard}>
                <View style={styles.calendarHeader}>
                  <View>
                    <Text style={styles.calendarMonth}>August</Text>
                    <Text style={styles.calendarYear}>2026</Text>
                  </View>
                  <View style={styles.calendarArrows}>
                    <Text style={styles.calendarArrow}>‹</Text>
                    <Text style={styles.calendarArrow}>›</Text>
                  </View>
                </View>

                <View style={styles.calendarWeek}>
                  {['M', 'T', 'W', 'T', 'F'].map((day, index) => (
                    <Text key={`${day}-${index}`} style={styles.calendarWeekday}>
                      {day}
                    </Text>
                  ))}
                </View>

                <View style={styles.calendarDates}>
                  {[10, 11, 12, 13, 14, 17, 18, 19, 20, 21].map((date) => (
                    <View
                      key={date}
                      style={[
                        styles.calendarDate,
                        date === 11 && styles.calendarDateSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.calendarDateText,
                          date === 11 && styles.calendarDateTextSelected,
                        ]}
                      >
                        {date}
                      </Text>
                      {[11, 14, 19].includes(date) ? (
                        <View
                          style={[
                            styles.eventDot,
                            date === 11 && styles.eventDotSelected,
                          ]}
                        />
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>

              <View style={[styles.friendBubble, styles.friendBubbleLeft]}>
                <Text style={styles.friendInitial}>K</Text>
              </View>
              <View style={[styles.friendBubble, styles.friendBubbleRight]}>
                <Text style={styles.friendInitial}>M</Text>
              </View>
              <View style={styles.planChip}>
                <View style={styles.planChipDot} />
                <View>
                  <Text style={styles.planChipTitle}>Sunset picnic</Text>
                  <Text style={styles.planChipMeta}>Tomorrow · 5:30 PM</Text>
                </View>
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={signingIn || sessionLoading}
                onPress={handleGoogleLogin}
                style={({ pressed }) => [
                  styles.googleButton,
                  pressed && styles.googleButtonPressed,
                  (signingIn || sessionLoading) && styles.googleButtonDisabled,
                ]}
              >
                {signingIn || sessionLoading ? (
                  <ActivityIndicator color="#5B5CE2" />
                ) : (
                  <Image
                    accessibilityIgnoresInvertColors
                    source={require('../../assets/images/google-logo.png')}
                    style={styles.googleLogo}
                  />
                )}
                <Text style={styles.googleButtonText}>
                  {signingIn ? 'Opening Google...' : 'Continue with Google'}
                </Text>
              </Pressable>

              <Text style={styles.legal}>
                By continuing, you agree to Planado&apos;s{' '}
                <Text style={styles.legalLink}>Terms</Text> and{' '}
                <Text style={styles.legalLink}>Privacy Policy</Text>.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F7FC' },
  background: { flex: 1, overflow: 'hidden', backgroundColor: '#F7F7FC' },
  page: { flex: 1, alignItems: 'center', paddingHorizontal: 20 },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'web' ? 38 : 22,
    paddingBottom: 24,
  },
  glow: { position: 'absolute', borderRadius: 999, opacity: 0.65 },
  glowTop: { width: 310, height: 310, right: -150, top: -120, backgroundColor: '#E7E5FF' },
  glowBottom: { width: 270, height: 270, left: -150, bottom: 40, backgroundColor: '#E1F6ED' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logo: {
    width: 43,
    height: 43,
    borderRadius: 14,
    padding: 9,
    backgroundColor: '#5B5CE2',
    shadowColor: '#5B5CE2',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  logoTop: { height: 4, borderRadius: 4, marginBottom: 5, backgroundColor: '#FFFFFF' },
  logoGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  logoDot: { width: 8, height: 8, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  logoDotAccent: { backgroundColor: '#FFFFFF' },
  brandName: { color: '#17171C', fontSize: 21, fontWeight: '800', letterSpacing: -0.7 },
  heroCopy: { marginTop: 34 },
  title: { color: '#17171C', fontSize: 39, lineHeight: 43, fontWeight: '800', letterSpacing: -1.8 },
  subtitle: { maxWidth: 310, marginTop: 12, color: '#6C6C78', fontSize: 16, lineHeight: 24 },
  illustration: { height: 274, marginVertical: 20, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  illustrationBack: { position: 'absolute', width: 260, height: 205, borderRadius: 30, backgroundColor: '#EAE9FF', transform: [{ rotate: '-6deg' }] },
  calendarCard: {
    width: 272,
    padding: 19,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '3deg' }],
    shadowColor: '#25204F',
    shadowOpacity: 0.14,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 15 },
  },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calendarMonth: { color: '#23232A', fontSize: 17, fontWeight: '800' },
  calendarYear: { marginTop: 2, color: '#8B8B96', fontSize: 10 },
  calendarArrows: { flexDirection: 'row', gap: 8 },
  calendarArrow: { color: '#777783', fontSize: 22 },
  calendarWeek: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16 },
  calendarWeekday: { width: 34, textAlign: 'center', color: '#A1A1AC', fontSize: 9, fontWeight: '700' },
  calendarDates: { marginTop: 7, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', rowGap: 5 },
  calendarDate: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  calendarDateSelected: { backgroundColor: '#5B5CE2' },
  calendarDateText: { color: '#6F6F79', fontSize: 10, fontWeight: '600' },
  calendarDateTextSelected: { color: '#FFFFFF' },
  eventDot: { width: 3, height: 3, marginTop: 2, borderRadius: 3, backgroundColor: '#52B98B' },
  eventDotSelected: { backgroundColor: '#FFFFFF' },
  friendBubble: { position: 'absolute', width: 54, height: 54, borderRadius: 27, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#25204F', shadowOpacity: 0.15, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  friendBubbleLeft: { left: 1, top: 82, backgroundColor: '#2F9E6F' },
  friendBubbleRight: { right: 0, bottom: 5, backgroundColor: '#EC6E63' },
  friendInitial: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  planChip: { position: 'absolute', left: 18, bottom: 1, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#FFFFFF', shadowColor: '#25204F', shadowOpacity: 0.13, shadowRadius: 14, shadowOffset: { width: 0, height: 7 } },
  planChipDot: { width: 8, height: 26, borderRadius: 8, backgroundColor: '#5B5CE2' },
  planChipTitle: { color: '#25252C', fontSize: 11, fontWeight: '800' },
  planChipMeta: { marginTop: 2, color: '#92929D', fontSize: 8 },
  actions: { gap: 15 },
  googleButton: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 13, borderWidth: 1, borderColor: '#E3E3EC', borderRadius: 17, backgroundColor: '#FFFFFF', shadowColor: '#25204F', shadowOpacity: 0.09, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  googleButtonPressed: { transform: [{ scale: 0.99 }], backgroundColor: '#FAFAFD' },
  googleButtonDisabled: { opacity: 0.7 },
  googleLogo: { width: 20, height: 20, resizeMode: 'contain' },
  googleButtonText: { color: '#24242B', fontSize: 15, fontWeight: '700' },
  legal: { paddingHorizontal: 16, color: '#92929D', fontSize: 10, lineHeight: 16, textAlign: 'center' },
  legalLink: { color: '#5B5CE2', fontWeight: '700' },
});
