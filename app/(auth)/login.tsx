import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlanadoAlert as Alert } from '../../components/PlanadoAlert';
import { PressableScale } from '../../components/ui/PressableScale';
import { Reveal } from '../../components/ui/Reveal';
import { useAuth } from '../../hooks/useAuth';
import { signInWithGoogle } from '../../services/authService';
import { COLORS } from '../../theme/colors';
import { gradientStyle, RADIUS, SHADOW, TYPE } from '../../theme/tokens';

const float = css.keyframes({
  from: { transform: [{ translateY: 0 }] },
  to: { transform: [{ translateY: -6 }] },
});

const drift = css.keyframes({
  from: { transform: [{ translateY: 0 }, { rotate: '3deg' }] },
  to: { transform: [{ translateY: -4 }, { rotate: '2deg' }] },
});

const motion = css.create({
  card: {
    animationName: drift,
    animationDuration: '3.2s',
    animationDirection: 'alternate',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
  bubbleSlow: {
    animationName: float,
    animationDuration: '2.6s',
    animationDirection: 'alternate',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
  bubbleFast: {
    animationName: float,
    animationDuration: '2.1s',
    animationDelay: '400ms',
    animationDirection: 'alternate',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
});

const BACKDROP = 'radial-gradient(circle at 100% 0%, rgba(91, 92, 226, 0.22) 0%, rgba(91, 92, 226, 0) 45%), radial-gradient(circle at 0% 85%, rgba(36, 150, 107, 0.16) 0%, rgba(36, 150, 107, 0) 40%)';

export default function LoginScreen() {
  const router = useRouter();
  const { isAuthenticated, loading: sessionLoading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const reduceMotion = useReducedMotion();

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

  const busy = signingIn || sessionLoading;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={[styles.background, gradientStyle(BACKDROP, 'transparent')]}>
        <View style={styles.page}>
          <View style={styles.content}>
            <Reveal style={styles.brand}>
              <View style={styles.logoSurface}>
                <Image
                  accessibilityIgnoresInvertColors
                  source={require('../../assets/images/planado-logo.png')}
                  resizeMode="contain"
        style={styles.logoImage}
                />
              </View>
              <Text style={styles.brandName}>Planado</Text>
            </Reveal>

            <Reveal index={1} style={styles.heroCopy}>
              <Text accessibilityRole="header" style={styles.title}>Make time for{`\n`}your people.</Text>
              <Text style={styles.subtitle}>
                One shared calendar for every plan that matters.
              </Text>
            </Reveal>

            <Reveal
              index={2}
              style={styles.illustration}
            >
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.illustrationInner}
              >
                <View style={styles.illustrationBack} />
                <Animated.View style={[styles.calendarCard, !reduceMotion && motion.card]}>
                  <View style={styles.calendarHeader}>
                    <View>
                      <Text style={styles.calendarMonth}>August</Text>
                      <Text style={styles.calendarYear}>2026</Text>
                    </View>
                    <View style={styles.calendarArrows}>
                      <View style={styles.calendarArrow} />
                      <View style={styles.calendarArrow} />
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
                </Animated.View>

                <Animated.View style={[styles.friendBubble, styles.friendBubbleLeft, !reduceMotion && motion.bubbleSlow]}>
                  <Text style={styles.friendInitial}>K</Text>
                </Animated.View>
                <Animated.View style={[styles.friendBubble, styles.friendBubbleRight, !reduceMotion && motion.bubbleFast]}>
                  <Text style={styles.friendInitial}>M</Text>
                </Animated.View>
                <View style={styles.planChip}>
                  <View style={styles.planChipDot} />
                  <View>
                    <Text numberOfLines={1} style={styles.planChipTitle}>Sunset picnic</Text>
                    <Text numberOfLines={1} style={styles.planChipMeta}>Tomorrow · 5:30 PM</Text>
                  </View>
                </View>
              </View>
            </Reveal>

            <Reveal index={3} style={styles.actions}>
              <PressableScale
                accessibilityHint="Opens Google sign-in"
                accessibilityLabel="Continue with Google"
                accessibilityState={{ busy, disabled: busy }}
                disabled={busy}
                onPress={handleGoogleLogin}
                scaleTo={0.98}
                style={[styles.googleButton, busy && styles.googleButtonDisabled]}
              >
                {busy ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : (
                  <Image
                    accessibilityIgnoresInvertColors
                    source={require('../../assets/images/google-logo.png')}
                    resizeMode="contain"
        style={styles.googleLogo}
                  />
                )}
                <Text style={styles.googleButtonText}>
                  {signingIn ? 'Opening Google…' : 'Continue with Google'}
                </Text>
              </PressableScale>

              <Text style={styles.legal}>
                By continuing, you agree to Planado&apos;s{' '}
                <Text style={styles.legalLink}>Terms</Text> and{' '}
                <Text style={styles.legalLink}>Privacy Policy</Text>.
              </Text>
            </Reveal>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  background: { flex: 1, overflow: 'hidden' },
  page: { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'web' ? 38 : 20,
    paddingBottom: 24,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoSurface: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    boxShadow: SHADOW.md,
  },
  logoImage: { width: 40, height: 40 },
  brandName: { ...TYPE.title2, color: COLORS.ink, fontWeight: '800' },
  heroCopy: { marginTop: 28 },
  title: { fontSize: 40, lineHeight: 46, color: COLORS.ink, fontWeight: '800', letterSpacing: -1.6 },
  subtitle: { ...TYPE.body, maxWidth: 320, marginTop: 12, color: COLORS.muted, fontSize: 17, lineHeight: 25 },
  illustration: { height: 284, marginVertical: 16 },
  illustrationInner: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  illustrationBack: {
    position: 'absolute',
    width: 264,
    height: 210,
    borderRadius: RADIUS.xxl + 4,
    backgroundColor: COLORS.primarySoft,
    transform: [{ rotate: '-6deg' }],
  },
  calendarCard: {
    width: 276,
    padding: 20,
    borderRadius: RADIUS.xxl,
    backgroundColor: COLORS.surface,
    transform: [{ rotate: '3deg' }],
    boxShadow: SHADOW.lg,
  },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calendarMonth: { ...TYPE.headline, color: COLORS.ink, fontWeight: '800' },
  calendarYear: { ...TYPE.footnote, marginTop: 1, color: COLORS.muted },
  calendarArrows: { flexDirection: 'row', gap: 8 },
  calendarArrow: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.elevatedStrong },
  calendarWeek: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16 },
  calendarWeekday: { ...TYPE.footnote, width: 36, textAlign: 'center', color: COLORS.muted, fontWeight: '700' },
  calendarDates: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', rowGap: 6 },
  calendarDate: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  calendarDateSelected: { backgroundColor: '#5B5CE2' },
  calendarDateText: { ...TYPE.subhead, color: COLORS.muted, fontWeight: '600' },
  calendarDateTextSelected: { color: '#FFFFFF', fontWeight: '800' },
  eventDot: { width: 4, height: 4, marginTop: 1, borderRadius: 2, backgroundColor: COLORS.green },
  eventDotSelected: { backgroundColor: '#FFFFFF' },
  friendBubble: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: SHADOW.md,
  },
  friendBubbleLeft: { left: 2, top: 70, backgroundColor: '#2F9E6F' },
  friendBubbleRight: { right: 0, bottom: 14, backgroundColor: '#EC6E63' },
  friendInitial: { ...TYPE.headline, color: '#FFFFFF', fontWeight: '800' },
  planChip: {
    position: 'absolute',
    left: 16,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    boxShadow: SHADOW.md,
  },
  planChipDot: { width: 6, height: 30, borderRadius: 3, backgroundColor: '#5B5CE2' },
  planChipTitle: { ...TYPE.subhead, color: COLORS.ink, fontWeight: '800' },
  planChipMeta: { ...TYPE.footnote, marginTop: 1, color: COLORS.muted },
  actions: { gap: 16 },
  googleButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    boxShadow: SHADOW.md,
  },
  googleButtonDisabled: { opacity: 0.7 },
  googleLogo: { width: 22, height: 22 },
  googleButtonText: { ...TYPE.bodyStrong, fontSize: 16, color: COLORS.ink, fontWeight: '700' },
  legal: { ...TYPE.footnote, paddingHorizontal: 16, color: COLORS.muted, textAlign: 'center', lineHeight: 18 },
  legalLink: { color: COLORS.primary, fontWeight: '700' },
});
