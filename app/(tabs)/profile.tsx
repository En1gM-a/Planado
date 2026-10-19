import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, useRouter } from 'expo-router';
import { type ComponentProps, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
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

import { PlanadoAlert as Alert } from '../../components/PlanadoAlert';
import { PlanadoLoader } from '../../components/PlanadoLoader';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { PageHeader, SectionHeader } from '../../components/ui/Headers';
import { IconButton } from '../../components/ui/IconButton';
import { Reveal } from '../../components/ui/Reveal';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useAuth } from '../../hooks/useAuth';
import { usePlanadoTheme } from '../../hooks/usePlanadoTheme';
import { getMyProfile, updateMyProfile } from '../../services/authService';
import { supabase } from '../../services/supabase';
import { COLORS } from '../../theme/colors';
import { GRADIENT, gradientStyle, PAGE, RADIUS, SHADOW, TYPE } from '../../theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

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
  const { mode: themeMode, setMode: setThemeMode } = usePlanadoTheme();
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
  const memberSinceYear = profile?.created_at ? new Date(profile.created_at).getFullYear() : null;

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
        <PlanadoLoader fullScreen message="Loading your profile..." />
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
            <PageHeader
              actions={!editing ? (
                <Button icon="pencil" label="Edit" onPress={startEditing} size="sm" variant="secondary" />
              ) : undefined}
              eyebrow="Your space"
              title="Profile"
            />

            <Reveal index={1} style={[styles.heroCard, gradientStyle(GRADIENT.hero, GRADIENT.heroFallback)]}>
              <View style={styles.avatarShell}>
                {avatarUrl ? (
                  <Image accessibilityLabel={`${displayName}'s photo`} source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitials}>{initials || 'P'}</Text>
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
              <Text style={styles.heroName}>{displayName}</Text>
              <Text style={styles.heroUsername}>@{profile?.username ?? 'member'}</Text>
              <View style={styles.googleConnected}>
                <View style={styles.connectedDot} />
                <Text numberOfLines={1} style={styles.googleConnectedText}>Google account connected</Text>
              </View>
            </Reveal>

            <Reveal index={2} style={styles.statsRow}>
              <Stat label="Groups" value={String(groupCount)} />
              <View style={styles.statDivider} />
              <Stat label="Events made" value={String(eventCount)} />
              <View style={styles.statDivider} />
              <Stat label="Member since" value={memberSinceYear ? String(memberSinceYear) : '—'} />
            </Reveal>

            <Banner message={error} />
            <Banner message={savedMessage} tone="success" />

            {editing ? (
              <Reveal style={styles.formCard}>
                <View style={styles.formHeader}>
                  <View style={styles.formHeaderCopy}>
                    <Text accessibilityRole="header" style={styles.formTitle}>Edit your details</Text>
                    <Text style={styles.formSubtitle}>How your groups see you</Text>
                  </View>
                  <IconButton icon="close" label="Cancel editing" onPress={cancelEditing} tone="ghost" />
                </View>

                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>Display name</Text>
                  <Text style={styles.characterCount}>{form.displayName.length}/60</Text>
                </View>
                <View style={styles.inputShell}>
                  <Ionicons color={COLORS.muted} name="person-outline" size={18} />
                  <TextInput
                    accessibilityLabel="Display name"
                    autoCapitalize="words"
                    maxLength={60}
                    onChangeText={(displayNameValue) =>
                      setForm((current) => ({ ...current, displayName: displayNameValue }))
                    }
                    placeholder="Your display name"
                    placeholderTextColor={COLORS.faint}
                    style={styles.input}
                    value={form.displayName}
                  />
                </View>

                <Text style={styles.inputLabel}>Username</Text>
                <View style={styles.inputShell}>
                  <Text style={styles.atSymbol}>@</Text>
                  <TextInput
                    accessibilityLabel="Username"
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
                    placeholderTextColor={COLORS.faint}
                    style={styles.input}
                    value={form.username}
                  />
                </View>
                <Text style={styles.inputHint}>3–30 lowercase letters, numbers, dots, or underscores.</Text>

                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>Bio</Text>
                  <Text style={styles.characterCount}>{form.bio.length}/300</Text>
                </View>
                <View style={[styles.inputShell, styles.bioShell]}>
                  <TextInput
                    accessibilityLabel="Bio"
                    maxLength={300}
                    multiline
                    onChangeText={(bioValue) =>
                      setForm((current) => ({ ...current, bio: bioValue }))
                    }
                    placeholder="Tell your groups a little about you..."
                    placeholderTextColor={COLORS.faint}
                    style={[styles.input, styles.bioInput]}
                    textAlignVertical="top"
                    value={form.bio}
                  />
                </View>

                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>Timezone</Text>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() =>
                      setForm((current) => ({ ...current, timezone: deviceTimezone }))
                    }
                  >
                    <Text style={styles.useDevice}>Use device timezone</Text>
                  </Pressable>
                </View>
                <View style={styles.inputShell}>
                  <Ionicons color={COLORS.muted} name="globe-outline" size={18} />
                  <TextInput
                    accessibilityLabel="Timezone"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={(timezoneValue) =>
                      setForm((current) => ({ ...current, timezone: timezoneValue }))
                    }
                    placeholder="Asia/Manila"
                    placeholderTextColor={COLORS.faint}
                    style={styles.input}
                    value={form.timezone}
                  />
                </View>
                <Text style={styles.inputHint}>Used to display event times and reminders correctly.</Text>

                <View style={styles.formActions}>
                  <Button
                    disabled={saving}
                    label="Cancel"
                    onPress={cancelEditing}
                    size="md"
                    style={styles.cancelButton}
                    variant="secondary"
                  />
                  <Button
                    disabled={!dirty}
                    icon="checkmark"
                    label={saving ? 'Saving…' : 'Save changes'}
                    loading={saving}
                    onPress={() => void saveProfile()}
                    size="md"
                    style={styles.saveButton}
                  />
                </View>
              </Reveal>
            ) : (
              <>
                <SectionHeader subtitle="Visible to people in your groups" title="About you" />
                <Reveal style={styles.aboutCard}>
                  <View style={styles.aboutIcon}>
                    <Ionicons color={COLORS.primary} name="chatbubble-ellipses-outline" size={20} />
                  </View>
                  <Text style={[styles.aboutText, !profile?.bio && styles.aboutPlaceholder]}>
                    {profile?.bio || 'Add a short bio so your groups know a little more about you.'}
                  </Text>
                </Reveal>

                <SectionHeader subtitle="Your identity and planning preferences" title="Account" />
                <Reveal style={styles.settingsCard}>
                  <SettingRow
                    background={COLORS.primarySoft}
                    color={COLORS.primary}
                    icon="mail-outline"
                    label="Google email"
                    trailing={<Ionicons accessibilityLabel="Verified" color={COLORS.green} name="checkmark-circle" size={20} />}
                    value={user?.email ?? 'Connected account'}
                  />
                  <View style={styles.settingSeparator} />
                  <SettingRow
                    accessibilityHint="Connect Google Calendar and manage automatic imports"
                    background={COLORS.blueSoft}
                    color={COLORS.blue}
                    icon="calendar-outline"
                    label="Google Calendar"
                    onPress={() => router.push('/settings/google-calendar' as Href)}
                    value="Import and automatically sync your events"
                  />
                  <View style={styles.settingSeparator} />
                  <SettingRow
                    background={COLORS.orangeSoft}
                    color={COLORS.orange}
                    icon="globe-outline"
                    label="Timezone"
                    value={profile?.timezone ?? deviceTimezone}
                  />
                  <View style={styles.settingSeparator} />
                  <SettingRow
                    background={COLORS.greenSoft}
                    color={COLORS.green}
                    icon="sparkles-outline"
                    label="AI group brief"
                    trailing={(
                      <View style={styles.soonPill}>
                        <Text style={styles.soonPillText}>Soon</Text>
                      </View>
                    )}
                    value="A future update · Not active yet"
                  />
                </Reveal>

                <SectionHeader subtitle="Choose how Planado looks" title="Appearance" />
                <Reveal>
                  <SegmentedControl
                    onChange={setThemeMode}
                    options={[
                      { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
                      { value: 'light', label: 'Light', icon: 'sunny-outline' },
                      { value: 'dark', label: 'Dark', icon: 'moon-outline' },
                    ]}
                    value={themeMode}
                  />
                </Reveal>

                <Text style={styles.googleNote}>
                  Your email and profile photo come from Google. Change them in your Google account, then sign in again to refresh them here.
                </Text>

                <Button
                  icon="log-out-outline"
                  label="Sign out"
                  onPress={confirmSignOut}
                  style={styles.signOutButton}
                  variant="danger"
                />

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statNumber}>{value}</Text>
      <Text numberOfLines={1} style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SettingRow({
  accessibilityHint,
  background,
  color,
  icon,
  label,
  onPress,
  trailing,
  value,
}: {
  accessibilityHint?: string;
  background: string;
  color: string;
  icon: IconName;
  label: string;
  onPress?: () => void;
  trailing?: ReactNode;
  value: string;
}) {
  const content = (
    <>
      <View style={[styles.settingIcon, { backgroundColor: background }]}>
        <Ionicons color={color} name={icon} size={19} />
      </View>
      <View style={styles.settingCopy}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.settingValue}>{value}</Text>
      </View>
      {trailing ?? (onPress ? <Ionicons color={COLORS.faint} name="chevron-forward" size={18} /> : null)}
    </>
  );

  if (!onPress) return <View style={styles.settingRow}>{content}</View>;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.settingRow, pressed && styles.settingRowPressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 40 },
  page: { width: '100%', maxWidth: PAGE.maxWidth, alignSelf: 'center', paddingHorizontal: PAGE.gutter, paddingTop: 12 },
  heroCard: {
    marginTop: 18,
    paddingVertical: 26,
    paddingHorizontal: 22,
    overflow: 'hidden',
    alignItems: 'center',
    borderRadius: RADIUS.xxl,
    boxShadow: SHADOW.md,
  },
  avatarShell: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 46,
    backgroundColor: '#7C7EEB',
  },
  avatarImage: { width: 86, height: 86, borderRadius: 43 },
  avatarInitials: { color: '#FFFFFF', fontSize: 30, lineHeight: 36, fontWeight: '800' },
  googleBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#2E2F86',
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
  },
  googleBadgeImage: { width: 14, height: 14 },
  heroName: { width: '100%', ...TYPE.title2, marginTop: 16, color: '#FFFFFF', fontWeight: '800', textAlign: 'center' },
  heroUsername: { width: '100%', ...TYPE.callout, marginTop: 2, color: 'rgba(255,255,255,0.78)', textAlign: 'center' },
  googleConnected: {
    minHeight: 30,
    marginTop: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  connectedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#7BE3BA' },
  googleConnectedText: { ...TYPE.footnote, color: '#FFFFFF', fontWeight: '600' },
  statsRow: {
    marginTop: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  statItem: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statNumber: { fontSize: 22, lineHeight: 28, color: COLORS.ink, fontWeight: '800' },
  statLabel: { ...TYPE.footnote, marginTop: 2, color: COLORS.muted },
  statDivider: { width: 1, height: 36, backgroundColor: COLORS.line },
  formCard: {
    marginTop: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surface,
  },
  formHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  formHeaderCopy: { flex: 1 },
  formTitle: { ...TYPE.title3, color: COLORS.ink },
  formSubtitle: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  inputLabel: { ...TYPE.subhead, marginTop: 18, marginBottom: 8, color: COLORS.ink, fontWeight: '700' },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  characterCount: { ...TYPE.footnote, marginBottom: 8, color: COLORS.muted },
  useDevice: { ...TYPE.subhead, marginBottom: 8, color: COLORS.primary, fontWeight: '700' },
  inputShell: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.input,
  },
  input: { ...TYPE.body, flex: 1, paddingVertical: 12, color: COLORS.ink },
  atSymbol: { ...TYPE.headline, color: COLORS.primary },
  inputHint: { ...TYPE.footnote, marginTop: 8, color: COLORS.muted },
  bioShell: { minHeight: 108, alignItems: 'flex-start' },
  bioInput: { minHeight: 100 },
  formActions: { marginTop: 24, flexDirection: 'row', gap: 10 },
  cancelButton: { flex: 1 },
  saveButton: { flex: 1.6 },
  aboutCard: {
    minHeight: 84,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  aboutIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm, backgroundColor: COLORS.primarySoft },
  aboutText: { ...TYPE.body, flex: 1, color: COLORS.ink },
  aboutPlaceholder: { color: COLORS.muted, fontStyle: 'italic' },
  settingsCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  settingRow: { minHeight: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  settingRowPressed: { backgroundColor: COLORS.elevated },
  settingIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm },
  settingCopy: { flex: 1 },
  settingLabel: { ...TYPE.bodyStrong, color: COLORS.ink },
  settingValue: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  settingSeparator: { height: 1, marginLeft: 70, backgroundColor: COLORS.line },
  soonPill: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: RADIUS.pill, backgroundColor: COLORS.greenSoft },
  soonPillText: { ...TYPE.footnote, color: COLORS.green, fontWeight: '700' },
  googleNote: { ...TYPE.footnote, marginTop: 16, paddingHorizontal: 8, color: COLORS.muted, textAlign: 'center' },
  signOutButton: { marginTop: 22 },
  memberSince: { ...TYPE.footnote, marginTop: 14, color: COLORS.muted, textAlign: 'center' },
});
