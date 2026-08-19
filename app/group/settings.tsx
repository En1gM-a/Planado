import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlanadoAlert as Alert } from '../../components/PlanadoAlert';
import { PlanadoLoader } from '../../components/PlanadoLoader';
import { useAuth } from '../../hooks/useAuth';
import {
  getEditableGroup,
  updateGroupDetails,
  type EditableGroup,
} from '../../services/groupService';
import { syncSelectedWidgetGroupName } from '../../services/widgetService';
import { COLORS } from '../../theme/colors';

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
        <View style={styles.failurePage}>
          <View style={styles.failureIcon}>
            <Ionicons color={COLORS.red} name="lock-closed-outline" size={30} />
          </View>
          <Text style={styles.failureTitle}>Cannot edit this group</Text>
          <Text style={styles.failureBody}>{error ?? 'Only the creator or an admin can edit group details.'}</Text>
          <Pressable onPress={() => router.back()} style={styles.failureButton}>
            <Text style={styles.failureButtonText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const groupTypeLabel = group.group_type === 'cit_u_classmates' ? 'CIT-U classmates' : 'General group';

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.page}>
            <View style={styles.header}>
              <Pressable onPress={() => router.back()} style={styles.headerButton}>
                <Ionicons color={COLORS.ink} name="arrow-back" size={21} />
              </Pressable>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>GROUP MANAGEMENT</Text>
                <Text style={styles.headerTitle}>Edit group</Text>
              </View>
              <View style={[styles.headerButton, styles.headerIcon]}>
                <Ionicons color={COLORS.primary} name="create-outline" size={20} />
              </View>
            </View>

            <View style={styles.hero}>
              <View style={styles.heroGlow} />
              <View style={styles.heroAvatar}>
                <Text style={styles.heroInitial}>{name.trim().charAt(0).toUpperCase() || 'P'}</Text>
              </View>
              <View style={styles.heroCopy}>
                <Text numberOfLines={1} style={styles.heroTitle}>{name.trim() || 'Planado group'}</Text>
                <Text style={styles.heroBody}>Changes are immediately visible to every member.</Text>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBanner}>
                <Ionicons color={COLORS.red} name="alert-circle" size={17} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Group details</Text>
            <View style={styles.formCard}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>GROUP NAME</Text>
                <Text style={styles.count}>{name.length}/80</Text>
              </View>
              <View style={styles.inputShell}>
                <Ionicons color={COLORS.primary} name="people-outline" size={18} />
                <TextInput autoCapitalize="words" maxLength={80} onChangeText={setName} placeholder="Group name" placeholderTextColor={COLORS.faint} style={styles.input} value={name} />
              </View>

              <View style={styles.labelRow}>
                <Text style={styles.label}>DESCRIPTION</Text>
                <Text style={styles.count}>{description.length}/500</Text>
              </View>
              <View style={[styles.inputShell, styles.textAreaShell]}>
                <Ionicons color={COLORS.primary} name="document-text-outline" size={18} style={styles.textAreaIcon} />
                <TextInput maxLength={500} multiline onChangeText={setDescription} placeholder="What does this group plan together?" placeholderTextColor={COLORS.faint} style={[styles.input, styles.textArea]} textAlignVertical="top" value={description} />
              </View>

              <View style={styles.labelRow}>
                <Text style={styles.label}>TIMEZONE</Text>
              </View>
              <View style={styles.inputShell}>
                <Ionicons color={COLORS.primary} name="globe-outline" size={18} />
                <TextInput autoCapitalize="none" autoCorrect={false} maxLength={100} onChangeText={setTimezone} placeholder="Asia/Taipei" placeholderTextColor={COLORS.faint} style={styles.input} value={timezone} />
              </View>
              <Text style={styles.hint}>Use an IANA timezone such as Asia/Manila or Asia/Taipei.</Text>
            </View>

            <Text style={styles.sectionTitle}>Group type</Text>
            <View style={styles.typeCard}>
              <View style={styles.typeIcon}>
                <Ionicons color={COLORS.primary} name={group.group_type === 'cit_u_classmates' ? 'school-outline' : 'people-outline'} size={22} />
              </View>
              <View style={styles.typeCopy}>
                <Text style={styles.typeTitle}>{groupTypeLabel}</Text>
                <Text style={styles.typeBody}>The group type stays fixed so its schedule and integrations remain consistent.</Text>
              </View>
              <Ionicons color={COLORS.green} name="shield-checkmark-outline" size={20} />
            </View>

            <Pressable disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.saveButton, saving && styles.saveButtonDisabled, pressed && styles.pressed]}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons color="#FFFFFF" name="checkmark-circle-outline" size={21} />}
              <Text style={styles.saveButtonText}>{saving ? 'Saving changes...' : 'Save group changes'}</Text>
            </Pressable>
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
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 18 },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, backgroundColor: COLORS.surface },
  headerIcon: { backgroundColor: COLORS.primarySoft },
  headerCopy: { flex: 1 },
  eyebrow: { color: COLORS.primary, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  headerTitle: { marginTop: 3, color: COLORS.ink, fontSize: 23, fontWeight: '900', letterSpacing: -0.5 },
  hero: { minHeight: 100, padding: 16, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 23, backgroundColor: '#292953' },
  heroGlow: { position: 'absolute', width: 145, height: 145, top: -88, right: -24, borderRadius: 73, backgroundColor: '#686AD6', opacity: 0.54 },
  heroAvatar: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#FFFFFF' },
  heroInitial: { color: '#5B5CE2', fontSize: 23, fontWeight: '900' },
  heroCopy: { flex: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  heroBody: { marginTop: 5, color: '#C7C7E2', fontSize: 9, lineHeight: 14 },
  errorBanner: { marginTop: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, backgroundColor: COLORS.redSoft },
  errorText: { flex: 1, color: COLORS.red, fontSize: 9, lineHeight: 14 },
  sectionTitle: { marginTop: 24, marginBottom: 10, color: COLORS.ink, fontSize: 17, fontWeight: '900' },
  formCard: { padding: 15, borderWidth: 1, borderColor: COLORS.line, borderRadius: 22, backgroundColor: COLORS.surface },
  labelRow: { marginTop: 13, marginBottom: 7, flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: COLORS.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.75 },
  count: { color: COLORS.faint, fontSize: 7 },
  inputShell: { minHeight: 50, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, backgroundColor: COLORS.input },
  input: { flex: 1, paddingVertical: 11, color: COLORS.ink, fontSize: 11 },
  textAreaShell: { minHeight: 112, alignItems: 'flex-start' },
  textAreaIcon: { marginTop: 14 },
  textArea: { minHeight: 102, lineHeight: 17 },
  hint: { marginTop: 7, color: COLORS.faint, fontSize: 8, lineHeight: 12 },
  typeCard: { minHeight: 82, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: COLORS.surface },
  typeIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: COLORS.primarySoft },
  typeCopy: { flex: 1 },
  typeTitle: { color: COLORS.ink, fontSize: 10, fontWeight: '900' },
  typeBody: { marginTop: 4, color: COLORS.muted, fontSize: 8, lineHeight: 12 },
  saveButton: { minHeight: 55, marginTop: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 17, backgroundColor: COLORS.primary },
  saveButtonDisabled: { opacity: 0.65 },
  saveButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  failurePage: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  failureIcon: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: COLORS.redSoft },
  failureTitle: { marginTop: 15, color: COLORS.ink, fontSize: 18, fontWeight: '900' },
  failureBody: { maxWidth: 340, marginTop: 7, color: COLORS.muted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  failureButton: { minHeight: 44, marginTop: 17, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: COLORS.primary },
  failureButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
});
