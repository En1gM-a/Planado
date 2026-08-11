import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../hooks/useAuth';
import { getMyProfile, updateMyProfile } from '../../services/authService';
import { supabase } from '../../services/supabase';

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  timezone: string;
  created_at: string;
};

type FormState = {
  displayName: string;
  username: string;
  bio: string;
  timezone: string;
};

const COLORS = {
  background: '#F6F6FB',
  surface: '#FFFFFF',
  ink: '#202027',
  muted: '#777782',
  faint: '#A1A1AC',
  line: '#E7E7EF',
  primary: '#5B5CE2',
  primarySoft: '#EEEEFF',
  navy: '#262650',
  green: '#23966B',
  greenSoft: '#E9F8F1',
  danger: '#C94E59',
};

const deviceTimezone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function normalizeUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 30);
}

function profileToForm(profile: Profile): FormState {
  return {
    displayName: profile.display_name,
    username: profile.username,
    bio: profile.bio ?? '',
    timezone: profile.timezone,
  };
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<FormState>({
    displayName: '',
    username: '',
    bio: '',
    timezone: deviceTimezone,
  });
  const [groupCount, setGroupCount] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const loadProfile = useCallback(async (isRefresh = false) => {
    if (!user) return;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [profileData, memberships, events] = await Promise.all([
        getMyProfile(),
        supabase
          .from('group_members')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
        supabase
          .from('events')
          .select('id', { count: 'exact', head: true })
          .eq('created_by', user.id),
      ]);

      if (!profileData) throw new Error('Your profile could not be found.');
      if (memberships.error) throw memberships.error;
      if (events.error) throw events.error;

      const nextProfile = profileData as Profile;
      setProfile(nextProfile);
      setForm(profileToForm(nextProfile));
      setGroupCount(memberships.count ?? 0);
      setEventCount(events.count ?? 0);
    } catch (loadError) {
      console.error('Could not load profile:', loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Your profile could not be loaded.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const dirty = useMemo(() => {
    if (!profile) return false;
    const original = profileToForm(profile);
    return (
      form.displayName.trim() !== original.displayName ||
      form.username !== original.username ||
      form.bio.trim() !== original.bio ||
      form.timezone.trim() !== original.timezone
    );
  }, [form, profile]);

  const avatarUrl =
    profile?.avatar_url ?? user?.user_metadata?.avatar_url ?? null;
  const displayName = String(
    profile?.display_name ??
      user?.user_metadata?.full_name ??
      user?.email?.split('@')[0] ??
      'Planado member',
  );
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();

  function startEditing() {
    if (!profile) return;
    setForm(profileToForm(profile));
    setSavedMessage(null);
    setError(null);
    setEditing(true);
  }

  function cancelEditing() {
    if (!profile) return;
    setForm(profileToForm(profile));
    setEditing(false);
    setError(null);
    Keyboard.dismiss();
  }

  async function saveProfile() {
    if (!profile || saving) return;

    const displayNameValue = form.displayName.trim();
    const usernameValue = normalizeUsername(form.username.trim());
    const bioValue = form.bio.trim();
    const timezoneValue = form.timezone.trim();

    if (!displayNameValue) {
      setError('Display name is required.');
      return;
    }
    if (displayNameValue.length > 60) {
      setError('Display name must be 60 characters or fewer.');
      return;
    }
    if (usernameValue.length < 3) {
      setError('Username must have at least 3 letters, numbers, dots, or underscores.');
      return;
    }
    if (bioValue.length > 300) {
      setError('Bio must be 300 characters or fewer.');
      return;
    }
    if (!timezoneValue) {
      setError('Timezone is required for reminders and daily summaries.');
      return;
    }

    setSaving(true);
    setError(null);
    setSavedMessage(null);
    Keyboard.dismiss();

    try {
      const updated = (await updateMyProfile({
        display_name: displayNameValue,
        username: usernameValue,
        bio: bioValue || null,
        timezone: timezoneValue,
      })) as Profile;

      setProfile(updated);
      setForm(profileToForm(updated));
      setEditing(false);
      setSavedMessage('Profile updated successfully.');
    } catch (saveError: unknown) {
      const code =
        typeof saveError === 'object' && saveError !== null && 'code' in saveError
          ? String(saveError.code)
          : '';
      setError(
        code === '23505'
          ? 'That username is already taken. Try another one.'
          : saveError instanceof Error
            ? saveError.message
            : 'Your changes could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function performSignOut() {
    try {
      await signOut();
      router.replace('/(auth)/login' as Href);
    } catch (signOutError: unknown) {
      const message =
        signOutError instanceof Error
          ? signOutError.message
          : typeof signOutError === 'object' &&
              signOutError !== null &&
              'message' in signOutError &&
              typeof signOutError.message === 'string'
            ? signOutError.message
            : 'Please try again.';
      Alert.alert('Could not sign out', message);
    }
  }

  function confirmSignOut() {
    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined' &&
        window.confirm(
          'Sign out of Planado?\n\nYou can sign back in anytime with your Google account.',
        );

      if (confirmed) void performSignOut();
      return;
    }

    Alert.alert(
      'Sign out of Planado?',
      'You can sign back in anytime with your Google account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            void performSignOut();
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.loadingPage}>
          <View style={styles.loadingLogo}>
            <Ionicons color="#FFFFFF" name="person" size={25} />
          </View>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading your profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              colors={[COLORS.primary]}
              onRefresh={() => void loadProfile(true)}
              refreshing={refreshing}
              tintColor={COLORS.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.page}>
            <View style={styles.topBar}>
              <View>
                <Text style={styles.eyebrow}>YOUR SPACE</Text>
                <Text style={styles.pageTitle}>Profile</Text>
              </View>
              {!editing ? (
                <Pressable
                  onPress={startEditing}
                  style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
                >
                  <Ionicons color={COLORS.primary} name="pencil" size={14} />
                  <Text style={styles.editButtonText}>Edit profile</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.heroCard}>
              <View style={styles.heroGlowLarge} />
              <View style={styles.heroGlowSmall} />
              <View style={styles.avatarShell}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitials}>{initials || 'P'}</Text>
                )}
                <View style={styles.googleBadge}>
                  <Image
                    accessibilityIgnoresInvertColors
                    source={require('../../assets/images/google-logo.png')}
                    style={styles.googleBadgeImage}
                  />
                </View>
              </View>
              <Text style={styles.heroName}>{displayName}</Text>
              <Text style={styles.heroUsername}>@{profile?.username ?? 'member'}</Text>
              <View style={styles.googleConnected}>
                <View style={styles.connectedDot} />
                <Text style={styles.googleConnectedText}>Google account connected</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{groupCount}</Text>
                <Text style={styles.statLabel}>GROUPS</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{eventCount}</Text>
                <Text style={styles.statLabel}>EVENTS MADE</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>2×</Text>
                <Text style={styles.statLabel}>DAILY BRIEFS</Text>
              </View>
            </View>

            {error ? (
              <View style={styles.messageError}>
                <Ionicons color={COLORS.danger} name="alert-circle" size={17} />
                <Text style={styles.messageErrorText}>{error}</Text>
              </View>
            ) : null}
            {savedMessage ? (
              <View style={styles.messageSuccess}>
                <Ionicons color={COLORS.green} name="checkmark-circle" size={17} />
                <Text style={styles.messageSuccessText}>{savedMessage}</Text>
              </View>
            ) : null}

            {editing ? (
              <View style={styles.formCard}>
                <View style={styles.sectionHeadingRow}>
                  <View>
                    <Text style={styles.sectionTitle}>Edit your details</Text>
                    <Text style={styles.sectionSubtitle}>How your groups see you</Text>
                  </View>
                  <Pressable onPress={cancelEditing} hitSlop={10}>
                    <Ionicons color={COLORS.muted} name="close" size={23} />
                  </Pressable>
                </View>

                <Text style={styles.inputLabel}>DISPLAY NAME</Text>
                <View style={styles.inputShell}>
                  <Ionicons color={COLORS.faint} name="person-outline" size={18} />
                  <TextInput
                    autoCapitalize="words"
                    maxLength={60}
                    onChangeText={(displayNameValue) =>
                      setForm((current) => ({ ...current, displayName: displayNameValue }))
                    }
                    placeholder="Your display name"
                    placeholderTextColor="#B0B0BA"
                    style={styles.input}
                    value={form.displayName}
                  />
                  <Text style={styles.characterCount}>{form.displayName.length}/60</Text>
                </View>

                <Text style={styles.inputLabel}>USERNAME</Text>
                <View style={styles.inputShell}>
                  <Text style={styles.atSymbol}>@</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                    onChangeText={(usernameValue) =>
                      setForm((current) => ({
                        ...current,
                        username: normalizeUsername(usernameValue),
                      }))
                    }
                    placeholder="username"
                    placeholderTextColor="#B0B0BA"
                    style={styles.input}
                    value={form.username}
                  />
                </View>
                <Text style={styles.inputHint}>3–30 lowercase letters, numbers, dots, or underscores.</Text>

                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>BIO</Text>
                  <Text style={styles.bioCount}>{form.bio.length}/300</Text>
                </View>
                <View style={[styles.inputShell, styles.bioShell]}>
                  <TextInput
                    maxLength={300}
                    multiline
                    onChangeText={(bioValue) =>
                      setForm((current) => ({ ...current, bio: bioValue }))
                    }
                    placeholder="Tell your groups a little about you..."
                    placeholderTextColor="#B0B0BA"
                    style={[styles.input, styles.bioInput]}
                    textAlignVertical="top"
                    value={form.bio}
                  />
                </View>

                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>TIMEZONE</Text>
                  <Pressable
                    onPress={() =>
                      setForm((current) => ({ ...current, timezone: deviceTimezone }))
                    }
                  >
                    <Text style={styles.useDevice}>Use device timezone</Text>
                  </Pressable>
                </View>
                <View style={styles.inputShell}>
                  <Ionicons color={COLORS.faint} name="globe-outline" size={18} />
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={(timezoneValue) =>
                      setForm((current) => ({ ...current, timezone: timezoneValue }))
                    }
                    placeholder="Asia/Manila"
                    placeholderTextColor="#B0B0BA"
                    style={styles.input}
                    value={form.timezone}
                  />
                </View>
                <Text style={styles.inputHint}>Used for events, reminders, and the 12 AM / 12 PM AI brief.</Text>

                <View style={styles.formActions}>
                  <Pressable
                    disabled={saving}
                    onPress={cancelEditing}
                    style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    disabled={!dirty || saving}
                    onPress={() => void saveProfile()}
                    style={({ pressed }) => [
                      styles.saveButton,
                      (!dirty || saving) && styles.disabledButton,
                      pressed && dirty && styles.pressed,
                    ]}
                  >
                    {saving ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Ionicons color="#FFFFFF" name="checkmark" size={18} />
                    )}
                    <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save changes'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>About you</Text>
                  <Text style={styles.sectionSubtitle}>Visible to people in your groups</Text>
                </View>
                <View style={styles.aboutCard}>
                  <View style={styles.aboutIcon}>
                    <Ionicons color={COLORS.primary} name="chatbubble-ellipses-outline" size={20} />
                  </View>
                  <Text style={[styles.aboutText, !profile?.bio && styles.aboutPlaceholder]}>
                    {profile?.bio || 'Add a short bio so your groups know a little more about you.'}
                  </Text>
                </View>

                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Account</Text>
                  <Text style={styles.sectionSubtitle}>Your identity and planning preferences</Text>
                </View>
                <View style={styles.settingsCard}>
                  <View style={styles.settingRow}>
                    <View style={[styles.settingIcon, { backgroundColor: COLORS.primarySoft }]}>
                      <Ionicons color={COLORS.primary} name="mail-outline" size={19} />
                    </View>
                    <View style={styles.settingCopy}>
                      <Text style={styles.settingLabel}>Google email</Text>
                      <Text numberOfLines={1} style={styles.settingValue}>{user?.email ?? 'Connected account'}</Text>
                    </View>
                    <Ionicons color={COLORS.green} name="checkmark-circle" size={20} />
                  </View>
                  <View style={styles.settingSeparator} />
                  <View style={styles.settingRow}>
                    <View style={[styles.settingIcon, { backgroundColor: '#FFF3E8' }]}>
                      <Ionicons color="#D78138" name="globe-outline" size={19} />
                    </View>
                    <View style={styles.settingCopy}>
                      <Text style={styles.settingLabel}>Timezone</Text>
                      <Text style={styles.settingValue}>{profile?.timezone ?? deviceTimezone}</Text>
                    </View>
                  </View>
                  <View style={styles.settingSeparator} />
                  <View style={styles.settingRow}>
                    <View style={[styles.settingIcon, { backgroundColor: COLORS.greenSoft }]}>
                      <Ionicons color={COLORS.green} name="sparkles-outline" size={19} />
                    </View>
                    <View style={styles.settingCopy}>
                      <Text style={styles.settingLabel}>AI group brief</Text>
                      <Text style={styles.settingValue}>Twice daily · 12 AM and 12 PM</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.googleNote}>Your email and profile photo come from Google. Change them in your Google account, then sign in again to refresh them here.</Text>

                <Pressable
                  onPress={confirmSignOut}
                  style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
                >
                  <Ionicons color={COLORS.danger} name="log-out-outline" size={20} />
                  <Text style={styles.signOutText}>Sign out</Text>
                </Pressable>

                <Text style={styles.memberSince}>
                  {profile?.created_at
                    ? `Planado member since ${new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(profile.created_at))}`
                    : 'Planado member'}
                </Text>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 38 },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 13 },
  loadingPage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingLogo: { width: 52, height: 52, marginBottom: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: COLORS.primary },
  loadingText: { color: COLORS.muted, fontSize: 11 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: COLORS.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  pageTitle: { marginTop: 3, color: COLORS.ink, fontSize: 28, fontWeight: '800', letterSpacing: -1 },
  editButton: { minHeight: 40, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: '#DCDCED', borderRadius: 14, backgroundColor: COLORS.surface },
  editButtonText: { color: COLORS.primary, fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  heroCard: { marginTop: 18, minHeight: 238, padding: 22, overflow: 'hidden', alignItems: 'center', borderRadius: 28, backgroundColor: COLORS.navy },
  heroGlowLarge: { position: 'absolute', width: 210, height: 210, top: -115, right: -55, borderRadius: 105, backgroundColor: '#696BD6', opacity: 0.55 },
  heroGlowSmall: { position: 'absolute', width: 135, height: 135, bottom: -86, left: 15, borderRadius: 70, backgroundColor: '#4FA8D4', opacity: 0.22 },
  avatarShell: { width: 88, height: 88, padding: 3, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 30, backgroundColor: '#8B8CE8' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 25 },
  avatarInitials: { flex: 1, color: '#FFFFFF', fontSize: 27, fontWeight: '900', textAlign: 'center', textAlignVertical: 'center' },
  googleBadge: { position: 'absolute', right: -5, bottom: -5, width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: COLORS.navy, borderRadius: 9, backgroundColor: '#FFFFFF' },
  googleBadgeImage: { width: 13, height: 13, resizeMode: 'contain' },
  heroName: { marginTop: 16, color: '#FFFFFF', fontSize: 21, fontWeight: '800', letterSpacing: -0.5 },
  heroUsername: { marginTop: 3, color: '#B8B8D9', fontSize: 11, fontWeight: '600' },
  googleConnected: { marginTop: 13, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.09)' },
  connectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#72DCB0' },
  googleConnectedText: { color: '#D7D7E9', fontSize: 8, fontWeight: '700' },
  statsRow: { marginTop: 12, minHeight: 82, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 22, backgroundColor: COLORS.surface },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { color: COLORS.ink, fontSize: 19, fontWeight: '900' },
  statLabel: { marginTop: 5, color: COLORS.faint, fontSize: 7, fontWeight: '900', letterSpacing: 0.65 },
  statDivider: { width: 1, height: 34, backgroundColor: COLORS.line },
  messageError: { marginTop: 13, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, backgroundColor: '#FFF0F1' },
  messageErrorText: { flex: 1, color: '#A6424B', fontSize: 10, lineHeight: 15 },
  messageSuccess: { marginTop: 13, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, backgroundColor: COLORS.greenSoft },
  messageSuccessText: { flex: 1, color: '#237653', fontSize: 10, lineHeight: 15 },
  formCard: { marginTop: 18, padding: 18, borderWidth: 1, borderColor: COLORS.line, borderRadius: 24, backgroundColor: COLORS.surface },
  sectionHeadingRow: { marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sectionHeader: { marginTop: 25, marginBottom: 11 },
  sectionTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '800', letterSpacing: -0.25 },
  sectionSubtitle: { marginTop: 3, color: COLORS.faint, fontSize: 9 },
  inputLabel: { marginTop: 16, marginBottom: 7, color: '#6E6E79', fontSize: 8, fontWeight: '900', letterSpacing: 0.85 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  bioCount: { marginBottom: 7, color: COLORS.faint, fontSize: 8 },
  useDevice: { marginBottom: 7, color: COLORS.primary, fontSize: 8, fontWeight: '800' },
  inputShell: { minHeight: 51, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#DEDEE8', borderRadius: 15, backgroundColor: '#FAFAFD' },
  input: { flex: 1, paddingVertical: 12, color: COLORS.ink, fontSize: 12 },
  characterCount: { color: COLORS.faint, fontSize: 8 },
  atSymbol: { color: COLORS.primary, fontSize: 16, fontWeight: '800' },
  inputHint: { marginTop: 6, color: COLORS.faint, fontSize: 8, lineHeight: 12 },
  bioShell: { minHeight: 104, alignItems: 'flex-start' },
  bioInput: { minHeight: 98, lineHeight: 18 },
  formActions: { marginTop: 22, flexDirection: 'row', gap: 10 },
  cancelButton: { flex: 1, minHeight: 49, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, backgroundColor: COLORS.surface },
  cancelButtonText: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },
  saveButton: { flex: 1.6, minHeight: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: COLORS.primary },
  disabledButton: { opacity: 0.45 },
  saveButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  aboutCard: { minHeight: 84, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: COLORS.surface },
  aboutIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: COLORS.primarySoft },
  aboutText: { flex: 1, color: COLORS.ink, fontSize: 11, lineHeight: 17 },
  aboutPlaceholder: { color: COLORS.muted, fontStyle: 'italic' },
  settingsCard: { overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line, borderRadius: 21, backgroundColor: COLORS.surface },
  settingRow: { minHeight: 72, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingIcon: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  settingCopy: { flex: 1 },
  settingLabel: { color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  settingValue: { marginTop: 4, color: COLORS.muted, fontSize: 9 },
  settingSeparator: { height: 1, marginLeft: 66, backgroundColor: COLORS.line },
  googleNote: { marginTop: 12, paddingHorizontal: 5, color: COLORS.faint, fontSize: 8, lineHeight: 13, textAlign: 'center' },
  signOutButton: { minHeight: 50, marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#F0D8DB', borderRadius: 16, backgroundColor: '#FFF9F9' },
  signOutText: { color: COLORS.danger, fontSize: 11, fontWeight: '800' },
  memberSince: { marginTop: 13, color: COLORS.faint, fontSize: 8, textAlign: 'center' },
});
