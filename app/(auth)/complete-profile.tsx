import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PlanadoAlert as Alert } from '../../components/PlanadoAlert';
import { useAuth } from '../../hooks/useAuth';
import { getMyProfile, updateMyProfile } from '../../services/authService';

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
        const profile = await getMyProfile();

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
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#5B5CE2" />
        <Text style={styles.loadingText}>Preparing your Planado profile...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.backgroundGlow} />
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.stepRow}>
                <Text style={styles.eyebrow}>YOUR PLANADO PROFILE</Text>
                <Text style={styles.stepText}>1 of 1</Text>
              </View>
              <Text style={styles.title}>Make it yours.</Text>
              <Text style={styles.subtitle}>
                Help friends recognize you when plans start filling the calendar.
              </Text>
              <View style={styles.progressTrack}>
                <View style={styles.progressFill} />
              </View>
            </View>

            <View style={styles.profilePreview}>
              <View style={styles.avatarShell}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitials}>{initials}</Text>
                )}
              </View>
              <View style={styles.googleBadge}>
                <Text style={styles.googleBadgeText}>G</Text>
              </View>
              <Text style={styles.previewName}>{displayName || 'Your name'}</Text>
              <Text style={styles.previewMeta}>Imported securely from Google</Text>
            </View>

            <View style={styles.formCard}>
              <View style={styles.field}>
                <Text style={styles.label}>Display name</Text>
                <TextInput
                  autoCapitalize="words"
                  maxLength={60}
                  onChangeText={setDisplayName}
                  placeholder="How friends will see you"
                  placeholderTextColor="#A0A0AB"
                  style={styles.input}
                  value={displayName}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Username</Text>
                <View style={styles.usernameInput}>
                  <Text style={styles.atSign}>@</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                    onChangeText={(value) => setUsername(normalizeUsername(value))}
                    placeholder="yourusername"
                    placeholderTextColor="#A0A0AB"
                    style={styles.usernameTextInput}
                    value={username}
                  />
                </View>
                <Text style={[styles.helper, username.length > 0 && !usernameValid && styles.helperError]}>
                  {username.length > 0 && !usernameValid
                    ? 'Use 3-30 lowercase letters, numbers, periods, or underscores.'
                    : 'Friends can recognize and find you by this name.'}
                </Text>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Timezone</Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setTimezone}
                  placeholder="Asia/Taipei"
                  placeholderTextColor="#A0A0AB"
                  style={styles.input}
                  value={timezone}
                />
                <Text style={styles.helper}>
                  Planado uses this to show events and summaries at the right time.
                </Text>
              </View>

              <View style={styles.field}>
                <View style={styles.optionalLabelRow}>
                  <Text style={styles.label}>A little about you</Text>
                  <Text style={styles.optional}>OPTIONAL</Text>
                </View>
                <TextInput
                  maxLength={300}
                  multiline
                  numberOfLines={3}
                  onChangeText={setBio}
                  placeholder="Weekend explorer, coffee person, always down for a trip..."
                  placeholderTextColor="#A0A0AB"
                  style={[styles.input, styles.bioInput]}
                  textAlignVertical="top"
                  value={bio}
                />
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={!formValid || saving}
              onPress={handleSave}
              style={({ pressed }) => [
                styles.continueButton,
                pressed && styles.continueButtonPressed,
                (!formValid || saving) && styles.continueButtonDisabled,
              ]}
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : null}
              <Text style={styles.continueButtonText}>
                {saving ? 'Saving your profile...' : 'Finish setup'}
              </Text>
              {!saving ? <Text style={styles.continueArrow}>→</Text> : null}
            </Pressable>

            <Text style={styles.footerText}>
              You can update these details anytime from Profile.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F7FC' },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 20, paddingVertical: Platform.OS === 'web' ? 38 : 20, backgroundColor: '#F7F7FC', overflow: 'hidden' },
  backgroundGlow: { position: 'absolute', width: 360, height: 360, borderRadius: 180, right: -190, top: -170, backgroundColor: '#E9E8FF' },
  container: { width: '100%', maxWidth: 500 },
  header: { marginBottom: 23 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#5B5CE2', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  stepText: { color: '#8D8D98', fontSize: 12, fontWeight: '600' },
  title: { marginTop: 10, color: '#17171C', fontSize: 35, lineHeight: 40, fontWeight: '800', letterSpacing: -1.5 },
  subtitle: { maxWidth: 390, marginTop: 9, color: '#6C6C78', fontSize: 14, lineHeight: 21 },
  progressTrack: { height: 5, marginTop: 18, borderRadius: 8, backgroundColor: '#E5E5EE', overflow: 'hidden' },
  progressFill: { width: '100%', height: '100%', borderRadius: 8, backgroundColor: '#5B5CE2' },
  profilePreview: { alignItems: 'center', marginBottom: 22 },
  avatarShell: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#5B5CE2', borderWidth: 5, borderColor: '#FFFFFF', shadowColor: '#25204F', shadowOpacity: 0.17, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { color: '#FFFFFF', fontSize: 25, fontWeight: '800' },
  googleBadge: { width: 25, height: 25, marginTop: -21, marginLeft: 62, borderRadius: 13, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', shadowColor: '#25204F', shadowOpacity: 0.12, shadowRadius: 6 },
  googleBadgeText: { color: '#4285F4', fontSize: 11, fontWeight: '900' },
  previewName: { marginTop: 9, color: '#24242B', fontSize: 17, fontWeight: '800' },
  previewMeta: { marginTop: 3, color: '#90909B', fontSize: 10 },
  formCard: { padding: 18, borderWidth: 1, borderColor: '#E7E7EF', borderRadius: 24, backgroundColor: '#FFFFFF', shadowColor: '#25204F', shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 9 } },
  field: { marginBottom: 17 },
  label: { marginBottom: 7, color: '#2A2A31', fontSize: 12, fontWeight: '800' },
  input: { minHeight: 49, paddingHorizontal: 14, borderWidth: 1, borderColor: '#DEDEE7', borderRadius: 14, color: '#222229', backgroundColor: '#FCFCFE', fontSize: 14 },
  usernameInput: { minHeight: 49, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: '#DEDEE7', borderRadius: 14, backgroundColor: '#FCFCFE' },
  atSign: { color: '#5B5CE2', fontSize: 15, fontWeight: '800' },
  usernameTextInput: { flex: 1, height: 47, paddingHorizontal: 5, color: '#222229', fontSize: 14 },
  helper: { marginTop: 6, color: '#92929D', fontSize: 10, lineHeight: 15 },
  helperError: { color: '#D9534F' },
  optionalLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  optional: { color: '#A0A0AA', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  bioInput: { minHeight: 82, paddingTop: 13 },
  continueButton: { minHeight: 55, marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, backgroundColor: '#5B5CE2', shadowColor: '#5B5CE2', shadowOpacity: 0.26, shadowRadius: 18, shadowOffset: { width: 0, height: 9 } },
  continueButtonPressed: { transform: [{ scale: 0.99 }], backgroundColor: '#4B4CC8' },
  continueButtonDisabled: { opacity: 0.48 },
  continueButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  continueArrow: { color: '#FFFFFF', fontSize: 20, marginTop: -2 },
  footerText: { marginTop: 14, color: '#9999A3', fontSize: 10, textAlign: 'center' },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F7F7FC' },
  loadingText: { color: '#73737E', fontSize: 13 },
});
