import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlanadoAlert as Alert } from '../../components/PlanadoAlert';
import { useAuth } from '../../hooks/useAuth';
import { signInWithGoogle } from '../../services/authService';
import { COLORS } from '../../theme/colors';

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
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.background}>
        <View style={[styles.glow, styles.glowTop]} />
        <View style={[styles.glow, styles.glowBottom]} />

        <View style={styles.page}>
          <View style={styles.content}>
            <View style={styles.brand}>
              <View style={styles.logoSurface}>
                <Image
                  accessibilityIgnoresInvertColors
                  source={require('../../assets/images/planado-logo.png')}
                  style={styles.logoImage}
                />
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
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  background: { flex: 1, overflow: 'hidden', backgroundColor: COLORS.background },
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
  glowTop: { width: 310, height: 310, right: -150, top: -120, backgroundColor: COLORS.primarySoft },
  glowBottom: { width: 270, height: 270, left: -150, bottom: 40, backgroundColor: COLORS.greenSoft },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logoSurface: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: COLORS.surface, shadowColor: '#34358A', shadowOpacity: 0.17, shadowRadius: 13, shadowOffset: { width: 0, height: 7 } },
  logoImage: { width: 39, height: 39, resizeMode: 'contain' },
  brandName: { color: COLORS.ink, fontSize: 21, fontWeight: '800', letterSpacing: -0.7 },
  heroCopy: { marginTop: 34 },
  title: { color: COLORS.ink, fontSize: 39, lineHeight: 43, fontWeight: '800', letterSpacing: -1.8 },
  subtitle: { maxWidth: 310, marginTop: 12, color: COLORS.muted, fontSize: 16, lineHeight: 24 },
  illustration: { height: 274, marginVertical: 20, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  illustrationBack: { position: 'absolute', width: 260, height: 205, borderRadius: 30, backgroundColor: COLORS.primarySoft, transform: [{ rotate: '-6deg' }] },
  calendarCard: {
    width: 272,
    padding: 19,
    borderRadius: 28,
    backgroundColor: COLORS.surface,
    transform: [{ rotate: '3deg' }],
    shadowColor: '#25204F',
    shadowOpacity: 0.14,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 15 },
  },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calendarMonth: { color: COLORS.ink, fontSize: 17, fontWeight: '800' },
  calendarYear: { marginTop: 2, color: COLORS.muted, fontSize: 10 },
  calendarArrows: { flexDirection: 'row', gap: 8 },
  calendarArrow: { color: COLORS.muted, fontSize: 22 },
  calendarWeek: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16 },
  calendarWeekday: { width: 34, textAlign: 'center', color: COLORS.faint, fontSize: 9, fontWeight: '700' },
  calendarDates: { marginTop: 7, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', rowGap: 5 },
  calendarDate: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  calendarDateSelected: { backgroundColor: '#5B5CE2' },
  calendarDateText: { color: COLORS.muted, fontSize: 10, fontWeight: '600' },
  calendarDateTextSelected: { color: '#FFFFFF' },
  eventDot: { width: 3, height: 3, marginTop: 2, borderRadius: 3, backgroundColor: COLORS.green },
  eventDotSelected: { backgroundColor: '#FFFFFF' },
  friendBubble: { position: 'absolute', width: 54, height: 54, borderRadius: 27, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#25204F', shadowOpacity: 0.15, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  friendBubbleLeft: { left: 1, top: 82, backgroundColor: '#2F9E6F' },
  friendBubbleRight: { right: 0, bottom: 5, backgroundColor: '#EC6E63' },
  friendInitial: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  planChip: { position: 'absolute', left: 18, bottom: 1, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: COLORS.surface, shadowColor: '#25204F', shadowOpacity: 0.13, shadowRadius: 14, shadowOffset: { width: 0, height: 7 } },
  planChipDot: { width: 8, height: 26, borderRadius: 8, backgroundColor: '#5B5CE2' },
  planChipTitle: { color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  planChipMeta: { marginTop: 2, color: COLORS.faint, fontSize: 8 },
  actions: { gap: 15 },
  googleButton: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 13, borderWidth: 1, borderColor: COLORS.line, borderRadius: 17, backgroundColor: COLORS.surface, shadowColor: '#25204F', shadowOpacity: 0.09, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  googleButtonPressed: { transform: [{ scale: 0.99 }], backgroundColor: COLORS.elevated },
  googleButtonDisabled: { opacity: 0.7 },
  googleLogo: { width: 20, height: 20, resizeMode: 'contain' },
  googleButtonText: { color: COLORS.ink, fontSize: 15, fontWeight: '700' },
  legal: { paddingHorizontal: 16, color: COLORS.faint, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  legalLink: { color: COLORS.primary, fontWeight: '700' },
});
