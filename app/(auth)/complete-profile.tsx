import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlanadoAlert as Alert } from '../../components/PlanadoAlert';
import { PlanadoLoader } from '../../components/PlanadoLoader';
import { Button } from '../../components/ui/Button';
import { Reveal } from '../../components/ui/Reveal';
import { useAuth } from '../../hooks/useAuth';
import { getMyProfile, updateMyProfile } from '../../services/authService';
import { COLORS } from '../../theme/colors';
import { gradientStyle, RADIUS, SHADOW, TYPE } from '../../theme/tokens';

type Field = 'displayName' | 'username' | 'timezone' | 'bio';

const BACKDROP = 'radial-gradient(circle at 100% 0%, rgba(91, 92, 226, 0.2) 0%, rgba(91, 92, 226, 0) 42%)';

function normalizeUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 30);
}

export default function CompleteProfileScreen() {
  const router = useRouter();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const metadata = user?.user_metadata ?? {};
  const initialDisplayName =
    metadata.full_name ?? metadata.name ?? user?.email?.split('@')[0] ?? '';
  const initialUsername = normalizeUsername(user?.email?.split('@')[0] ?? '');

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [username, setUsername] = useState(initialUsername);
  const [timezone, setTimezone] = useState('Asia/Taipei');
  const [bio, setBio] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [focusedField, setFocusedField] = useState<Field | null>(null);

  const avatarUrl = metadata.avatar_url ?? metadata.picture;
  const initials = useMemo(
    () =>
      displayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part: string) => part[0]?.toUpperCase())
        .join('') || 'P',
    [displayName],
  );

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (!user) {
        setLoadingProfile(false);
        return;
      }

      try {
        const profile = await getMyProfile(user.id);

        if (!active || !profile) return;
        setDisplayName(profile.display_name || initialDisplayName);
        setUsername(
          profile.username?.startsWith('user_')
            ? initialUsername
            : profile.username || initialUsername,
        );
        setTimezone(profile.timezone || 'Asia/Taipei');
        setBio(profile.bio || '');

        if (profile.onboarding_completed) {
          router.replace('/(tabs)/home');
        }
      } catch (error) {
        console.error('Could not load profile:', error);
      } finally {
        if (active) setLoadingProfile(false);
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [initialDisplayName, initialUsername, router, user]);

  if (!authLoading && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  const usernameValid = /^[a-z0-9._]{3,30}$/.test(username);
  const displayNameValid = displayName.trim().length >= 1;
  const formValid = usernameValid && displayNameValid && timezone.trim().length > 0;
  const usernameError = username.length > 0 && !usernameValid;

  async function handleSave() {
    if (!formValid || saving) return;

    try {
      setSaving(true);
      await updateMyProfile({
        username: username.trim().toLowerCase(),
        display_name: displayName.trim(),
        timezone: timezone.trim(),
        bio: bio.trim() || null,
        avatar_url: avatarUrl || null,
        onboarding_completed: true,
      });
      router.replace('/(tabs)/home');
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '';
      const message = rawMessage.toLowerCase().includes('unique')
        ? 'That username is already taken. Try another one.'
        : rawMessage || 'Planado could not save your profile.';

      Alert.alert('Could not finish setup', message);
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loadingProfile) {
    return <PlanadoLoader fullScreen message="Preparing your Planado profile..." />;
  }

  const fieldStyle = (field: Field, invalid = false) => [
    styles.inputShell,
    focusedField === field && styles.inputShellFocused,
    invalid && styles.inputShellInvalid,
  ];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, gradientStyle(BACKDROP, 'transparent')]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <Reveal style={styles.header}>
              <View style={styles.stepRow}>
                <Text style={styles.eyebrow}>Your Planado profile</Text>
                <View style={styles.stepPill}>
                  <Text numberOfLines={1} style={styles.stepText}>Final step</Text>
                </View>
              </View>
              <Text accessibilityRole="header" style={styles.title}>Make it yours.</Text>
              <Text style={styles.subtitle}>
                Help friends recognize you when plans start filling the calendar.
              </Text>
            </Reveal>

            <Reveal index={1} style={styles.profilePreview}>
              <View style={styles.avatarShell}>
                {avatarUrl ? (
                  <Image accessibilityLabel="Your Google photo" source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitials}>{initials}</Text>
                )}
                <View style={styles.googleBadge}>
                  <Image
                    accessibilityIgnoresInvertColors
                    source={require('../../assets/images/google-logo.png')}
                    resizeMode="contain"
        style={styles.googleBadgeImage}
                  />
                </View>
              </View>
              <Text style={styles.previewName}>{displayName || 'Your name'}</Text>
              <Text style={styles.previewMeta}>@{username || 'username'}</Text>
            </Reveal>

            <Reveal index={2} style={styles.formCard}>
              <View style={styles.field}>
                <Text style={styles.label}>Display name</Text>
                <View style={fieldStyle('displayName')}>
                  <TextInput
                    accessibilityLabel="Display name"
                    autoCapitalize="words"
                    maxLength={60}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={setDisplayName}
                    onFocus={() => setFocusedField('displayName')}
                    placeholder="How friends will see you"
                    placeholderTextColor={COLORS.faint}
                    style={styles.input}
                    value={displayName}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Username</Text>
                <View style={fieldStyle('username', usernameError)}>
                  <Text style={styles.atSign}>@</Text>
                  <TextInput
                    accessibilityHint="3 to 30 lowercase letters, numbers, periods, or underscores"
                    accessibilityLabel="Username"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={(value) => setUsername(normalizeUsername(value))}
                    onFocus={() => setFocusedField('username')}
                    placeholder="yourusername"
                    placeholderTextColor={COLORS.faint}
                    style={styles.input}
                    value={username}
                  />
                </View>
                <Text accessibilityLiveRegion="polite" style={[styles.helper, usernameError && styles.helperError]}>
                  {usernameError
                    ? 'Use 3–30 lowercase letters, numbers, periods, or underscores.'
                    : 'Friends can recognize and find you by this name.'}
                </Text>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Timezone</Text>
                <View style={fieldStyle('timezone')}>
                  <TextInput
                    accessibilityLabel="Timezone"
                    autoCapitalize="none"
                    onBlur={() => setFocusedField(null)}
                    onChangeText={setTimezone}
                    onFocus={() => setFocusedField('timezone')}
                    placeholder="Asia/Taipei"
                    placeholderTextColor={COLORS.faint}
                    style={styles.input}
                    value={timezone}
                  />
                </View>
                <Text style={styles.helper}>
                  Planado uses this to show events and summaries at the right time.
                </Text>
              </View>

              <View style={[styles.field, styles.lastField]}>
                <View style={styles.optionalLabelRow}>
                  <Text style={styles.label}>A little about you</Text>
                  <Text style={styles.optional}>Optional</Text>
                </View>
                <View style={[...fieldStyle('bio'), styles.bioShell]}>
                  <TextInput
                    accessibilityLabel="About you"
                    maxLength={300}
                    multiline
                    numberOfLines={3}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={setBio}
                    onFocus={() => setFocusedField('bio')}
                    placeholder="Weekend explorer, coffee person, always down for a trip..."
                    placeholderTextColor={COLORS.faint}
                    style={[styles.input, styles.bioInput]}
                    textAlignVertical="top"
                    value={bio}
                  />
                </View>
              </View>
            </Reveal>

            <Reveal index={3}>
              <Button
                disabled={!formValid}
                icon="arrow-forward"
                label={saving ? 'Saving your profile…' : 'Finish setup'}
                loading={saving}
                onPress={() => void handleSave()}
                style={styles.continueButton}
              />
              <Text style={styles.footerText}>
                You can update these details anytime from Profile.
              </Text>
            </Reveal>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  keyboardView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: Platform.OS === 'web' ? 38 : 20,
  },
  container: { width: '100%', maxWidth: 500 },
  header: { marginBottom: 22 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...TYPE.overline, color: COLORS.primary },
  stepPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: RADIUS.pill, backgroundColor: COLORS.primarySoft },
  stepText: { ...TYPE.footnote, color: COLORS.primary, fontWeight: '700' },
  title: { ...TYPE.display, marginTop: 10, color: COLORS.ink },
  subtitle: { ...TYPE.body, maxWidth: 390, marginTop: 8, color: COLORS.muted },
  profilePreview: { alignItems: 'center', marginBottom: 20 },
  avatarShell: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderWidth: 4,
    borderColor: COLORS.surface,
    boxShadow: SHADOW.md,
  },
  avatarImage: { width: 84, height: 84, borderRadius: 42 },
  avatarInitials: { color: '#FFFFFF', fontSize: 28, lineHeight: 34, fontWeight: '800' },
  googleBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.background,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
  },
  googleBadgeImage: { width: 14, height: 14 },
  previewName: { width: '100%', ...TYPE.title3, marginTop: 12, color: COLORS.ink, textAlign: 'center' },
  previewMeta: { width: '100%', ...TYPE.subhead, marginTop: 2, color: COLORS.muted, textAlign: 'center' },
  formCard: {
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surface,
    boxShadow: SHADOW.sm,
  },
  field: { marginBottom: 18 },
  lastField: { marginBottom: 0 },
  label: { ...TYPE.subhead, marginBottom: 8, color: COLORS.ink, fontWeight: '700' },
  inputShell: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.input,
  },
  inputShellFocused: { borderColor: COLORS.primary, backgroundColor: COLORS.surface },
  inputShellInvalid: { borderColor: COLORS.red },
  input: { ...TYPE.body, flex: 1, paddingVertical: 12, color: COLORS.ink },
  atSign: { ...TYPE.headline, color: COLORS.primary },
  helper: { ...TYPE.footnote, marginTop: 8, color: COLORS.muted },
  helperError: { color: COLORS.red, fontWeight: '600' },
  optionalLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  optional: { ...TYPE.footnote, color: COLORS.muted, fontWeight: '600' },
  bioShell: { minHeight: 96, alignItems: 'flex-start' },
  bioInput: { minHeight: 88 },
  continueButton: { marginTop: 20 },
  footerText: { ...TYPE.footnote, marginTop: 12, color: COLORS.muted, textAlign: 'center' },
});
