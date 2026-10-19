import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
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
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { TopBar } from '../../components/ui/Headers';
import { Reveal } from '../../components/ui/Reveal';
import { useAuth } from '../../hooks/useAuth';
import {
  getEditableGroup,
  updateGroupDetails,
  type EditableGroup,
} from '../../services/groupService';
import { syncSelectedWidgetGroupName } from '../../services/widgetService';
import { COLORS } from '../../theme/colors';
import { GRADIENT, gradientStyle, PAGE, RADIUS, SHADOW, TYPE } from '../../theme/tokens';

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message) return message;
  }
  return 'The group could not be updated.';
}

export default function GroupSettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string | string[] }>();
  const groupId = Array.isArray(params.groupId) ? params.groupId[0] : params.groupId;
  const { user, loading: authLoading } = useAuth();
  const [group, setGroup] = useState<EditableGroup | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [timezone, setTimezone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId || !user) return;
    let active = true;
    setLoading(true);
    setError(null);
    void getEditableGroup(groupId)
      .then((data) => {
        if (!active) return;
        setGroup(data);
        setName(data.name);
        setDescription(data.description ?? '');
        setTimezone(data.timezone);
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [groupId, user]);

  async function save() {
    if (!groupId || saving) return;
    setError(null);
    if (!name.trim()) return setError('Group name is required.');
    if (name.trim().length > 80) return setError('Group name must be 80 characters or fewer.');
    if (description.trim().length > 500) return setError('Description must be 500 characters or fewer.');
    if (!timezone.trim()) return setError('Timezone is required.');

    setSaving(true);
    try {
      const updated = await updateGroupDetails(groupId, { name, description, timezone });
      await syncSelectedWidgetGroupName(groupId, updated.name).catch((widgetError) => {
        console.warn('Group updated, but its widget name could not refresh:', widgetError);
      });
      Alert.alert('Group updated', `${updated.name} now has the latest details.`, [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (!authLoading && !user) return <Redirect href="/(auth)/login" />;
  if (!groupId) return <Redirect href="/(tabs)/groups" />;

  if (authLoading || loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <PlanadoLoader fullScreen message="Opening group settings..." />
      </SafeAreaView>
    );
  }

  if (!group) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <Reveal style={styles.failurePage}>
          <View style={styles.failureIcon}>
            <Ionicons color={COLORS.red} name="lock-closed-outline" size={30} />
          </View>
          <Text accessibilityRole="header" style={styles.failureTitle}>Cannot edit this group</Text>
          <Text style={styles.failureBody}>{error ?? 'Only the creator or an admin can edit group details.'}</Text>
          <Button icon="arrow-back" label="Go back" onPress={() => router.back()} size="md" style={styles.failureButton} />
        </Reveal>
      </SafeAreaView>
    );
  }

  const groupTypeLabel = group.group_type === 'cit_u_classmates' ? 'CIT-U classmates' : 'General group';

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.page}>
            <TopBar eyebrow="Group management" onBack={() => router.back()} title="Edit group" />

            <Reveal style={[styles.hero, gradientStyle(GRADIENT.hero, GRADIENT.heroFallback)]}>
              <View style={styles.heroAvatar}>
                <Text style={styles.heroInitial}>{name.trim().charAt(0).toUpperCase() || 'P'}</Text>
              </View>
              <View style={styles.heroCopy}>
                <Text numberOfLines={1} style={styles.heroTitle}>{name.trim() || 'Planado group'}</Text>
                <Text style={styles.heroBody}>Changes are immediately visible to every member.</Text>
              </View>
            </Reveal>

            <Banner message={error} />

            <Text accessibilityRole="header" style={styles.sectionTitle}>Group details</Text>
            <Reveal index={1} style={styles.formCard}>
              <View style={[styles.labelRow, styles.labelRowFirst]}>
                <Text style={styles.label}>Group name</Text>
                <Text style={styles.count}>{name.length}/80</Text>
              </View>
              <View style={styles.inputShell}>
                <Ionicons color={COLORS.primary} name="people-outline" size={18} />
                <TextInput accessibilityLabel="Group name" autoCapitalize="words" maxLength={80} onChangeText={setName} placeholder="Group name" placeholderTextColor={COLORS.faint} style={styles.input} value={name} />
              </View>

              <View style={styles.labelRow}>
                <Text style={styles.label}>Description</Text>
                <Text style={styles.count}>{description.length}/500</Text>
              </View>
              <View style={[styles.inputShell, styles.textAreaShell]}>
                <Ionicons color={COLORS.primary} name="document-text-outline" size={18} style={styles.textAreaIcon} />
                <TextInput accessibilityLabel="Description" maxLength={500} multiline onChangeText={setDescription} placeholder="What does this group plan together?" placeholderTextColor={COLORS.faint} style={[styles.input, styles.textArea]} textAlignVertical="top" value={description} />
              </View>

              <View style={styles.labelRow}>
                <Text style={styles.label}>Timezone</Text>
              </View>
              <View style={styles.inputShell}>
                <Ionicons color={COLORS.primary} name="globe-outline" size={18} />
                <TextInput accessibilityLabel="Timezone" autoCapitalize="none" autoCorrect={false} maxLength={100} onChangeText={setTimezone} placeholder="Asia/Taipei" placeholderTextColor={COLORS.faint} style={styles.input} value={timezone} />
              </View>
              <Text style={styles.hint}>Use an IANA timezone such as Asia/Manila or Asia/Taipei.</Text>
            </Reveal>

            <Text accessibilityRole="header" style={styles.sectionTitle}>Group type</Text>
            <Reveal index={2} style={styles.typeCard}>
              <View style={styles.typeIcon}>
                <Ionicons color={COLORS.primary} name={group.group_type === 'cit_u_classmates' ? 'school-outline' : 'people-outline'} size={22} />
              </View>
              <View style={styles.typeCopy}>
                <Text style={styles.typeTitle}>{groupTypeLabel}</Text>
                <Text style={styles.typeBody}>The group type stays fixed so its schedule and integrations remain consistent.</Text>
              </View>
              <Ionicons accessibilityLabel="Locked" color={COLORS.green} name="shield-checkmark-outline" size={20} />
            </Reveal>

            <Button
              icon="checkmark-circle-outline"
              label={saving ? 'Saving changes…' : 'Save group changes'}
              loading={saving}
              onPress={() => void save()}
              style={styles.saveButton}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 42 },
  page: { width: '100%', maxWidth: PAGE.maxWidth, alignSelf: 'center', paddingHorizontal: PAGE.gutter },
  hero: {
    minHeight: 100,
    marginTop: 4,
    padding: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: RADIUS.xl,
    boxShadow: SHADOW.md,
  },
  heroAvatar: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: '#FFFFFF' },
  heroInitial: { color: '#5B5CE2', fontSize: 24, lineHeight: 30, fontWeight: '800' },
  heroCopy: { flex: 1 },
  heroTitle: { ...TYPE.headline, color: '#FFFFFF', fontWeight: '800' },
  heroBody: { ...TYPE.subhead, marginTop: 2, color: 'rgba(255,255,255,0.82)' },
  sectionTitle: { ...TYPE.title3, marginTop: 28, marginBottom: 12, color: COLORS.ink },
  formCard: { padding: 16, borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.xl, backgroundColor: COLORS.surface },
  labelRow: { marginTop: 16, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  labelRowFirst: { marginTop: 0 },
  label: { ...TYPE.subhead, color: COLORS.ink, fontWeight: '700' },
  count: { ...TYPE.footnote, color: COLORS.muted },
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
  textAreaShell: { minHeight: 116, alignItems: 'flex-start' },
  textAreaIcon: { marginTop: 15 },
  textArea: { minHeight: 106 },
  hint: { ...TYPE.footnote, marginTop: 8, color: COLORS.muted },
  typeCard: {
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
  typeIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.primarySoft },
  typeCopy: { flex: 1 },
  typeTitle: { ...TYPE.headline, color: COLORS.ink },
  typeBody: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  saveButton: { marginTop: 28 },
  failurePage: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  failureIcon: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.xl, backgroundColor: COLORS.redSoft },
  failureTitle: { width: '100%', ...TYPE.title3, marginTop: 18, color: COLORS.ink, textAlign: 'center' },
  failureBody: { width: '100%', ...TYPE.body, maxWidth: 340, marginTop: 8, color: COLORS.muted, textAlign: 'center' },
  failureButton: { marginTop: 22 },
});
