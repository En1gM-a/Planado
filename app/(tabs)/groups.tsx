import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import {
  createGroup,
  getMyGroups,
  joinGroupByCode,
  type GroupRole,
  type PlanadoGroup,
} from '../../services/groupService';
import { supabase } from '../../services/supabase';

type RoleFilter = 'all' | GroupRole;
type GroupModal = 'create' | 'join' | null;

const COLORS = {
  background: '#F6F6FB',
  surface: '#FFFFFF',
  ink: '#202027',
  muted: '#777782',
  faint: '#A1A1AC',
  line: '#E7E7EF',
  primary: '#5B5CE2',
  primarySoft: '#EEEEFF',
  navy: '#282852',
  green: '#24966B',
  greenSoft: '#E9F8F1',
  orange: '#DE8139',
  orangeSoft: '#FFF2E7',
  red: '#C9515A',
  redSoft: '#FFF0F1',
};

const MEMBER_COLORS = ['#5B5CE2', '#2C9B73', '#E58743', '#D45C86', '#4285D4', '#8B63C7'];
const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

function roleLabel(role: GroupRole) {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  return 'Member';
}

function nextEventLabel(group: PlanadoGroup) {
  if (!group.next_event) return 'No upcoming events';
  const date = new Date(group.next_event.start_time);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const day =
    date.toDateString() === today.toDateString()
      ? 'Today'
      : date.toDateString() === tomorrow.toDateString()
        ? 'Tomorrow'
        : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  return `${group.next_event.title} · ${day}, ${time}`;
}

export default function GroupsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [groups, setGroups] = useState<PlanadoGroup[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [modal, setModal] = useState<GroupModal>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      setGroups(await getMyGroups());
    } catch (loadError) {
      console.error('Could not load groups:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Your groups could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadGroups();
    }, [loadGroups]),
  );

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`groups:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, () => {
        void loadGroups(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, () => {
        void loadGroups(true);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadGroups, user]);

  const visibleGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return groups.filter((group) => {
      const matchesRole = roleFilter === 'all' || group.role === roleFilter;
      const matchesSearch =
        !query ||
        group.name.toLowerCase().includes(query) ||
        group.description?.toLowerCase().includes(query);
      return matchesRole && matchesSearch;
    });
  }, [groups, roleFilter, search]);

  const managedCount = groups.filter((group) => group.role === 'owner' || group.role === 'admin').length;
  const totalPeople = groups.reduce((sum, group) => sum + group.member_count, 0);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={[COLORS.primary]}
            onRefresh={() => void loadGroups(true)}
            refreshing={refreshing}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>YOUR PEOPLE</Text>
              <Text style={styles.title}>Groups</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => setModal('join')}
                style={({ pressed }) => [styles.joinButton, pressed && styles.pressed]}
              >
                <Ionicons color={COLORS.primary} name="enter-outline" size={18} />
              </Pressable>
              <Pressable
                onPress={() => setModal('create')}
                style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
              >
                <Ionicons color="#FFFFFF" name="add" size={18} />
                <Text style={styles.createButtonText}>Create</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryGlow} />
            <View style={styles.summaryIcon}>
              <Ionicons color="#FFFFFF" name="people" size={26} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryTitle}>Plan together, stay close.</Text>
              <Text style={styles.summaryBody}>One place for shared calendars, updates, and the people that matter.</Text>
            </View>
            <View style={styles.summaryStats}>
              <Text style={styles.summaryStatNumber}>{groups.length}</Text>
              <Text style={styles.summaryStatLabel}>GROUPS</Text>
            </View>
          </View>

          <View style={styles.metricRow}>
            <View style={styles.metricCard}>
              <View style={[styles.metricIcon, { backgroundColor: COLORS.primarySoft }]}>
                <Ionicons color={COLORS.primary} name="shield-checkmark-outline" size={20} />
              </View>
              <View>
                <Text style={styles.metricNumber}>{managedCount}</Text>
                <Text style={styles.metricLabel}>Managed by you</Text>
              </View>
            </View>
            <View style={styles.metricCard}>
              <View style={[styles.metricIcon, { backgroundColor: COLORS.greenSoft }]}>
                <Ionicons color={COLORS.green} name="person-outline" size={20} />
              </View>
              <View>
                <Text style={styles.metricNumber}>{totalPeople}</Text>
                <Text style={styles.metricLabel}>Member connections</Text>
              </View>
            </View>
          </View>

          <View style={styles.searchShell}>
            <Ionicons color={COLORS.faint} name="search" size={19} />
            <TextInput
              onChangeText={setSearch}
              placeholder="Search your groups"
              placeholderTextColor="#A9A9B3"
              style={styles.searchInput}
              value={search}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')}>
                <Ionicons color={COLORS.faint} name="close-circle" size={18} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {(['all', 'owner', 'admin', 'member'] as RoleFilter[]).map((filter) => {
              const active = roleFilter === filter;
              return (
                <Pressable
                  key={filter}
                  onPress={() => setRoleFilter(filter)}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {filter === 'all' ? 'All groups' : filter === 'owner' ? 'Owned' : `${filter.charAt(0).toUpperCase()}${filter.slice(1)}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons color={COLORS.red} name="alert-circle" size={17} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Your circles</Text>
              <Text style={styles.sectionSubtitle}>
                {visibleGroups.length} group{visibleGroups.length === 1 ? '' : 's'} shown
              </Text>
            </View>
            <Pressable onPress={() => setModal('join')}>
              <Text style={styles.inviteLink}>Have an invite code?</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.loadingText}>Gathering your groups...</Text>
            </View>
          ) : visibleGroups.length ? (
            <View style={styles.groupList}>
              {visibleGroups.map((group) => (
                <Pressable
                  key={group.id}
                  onPress={() => router.push(`/group/${group.id}` as Href)}
                  style={({ pressed }) => [styles.groupCard, pressed && styles.pressed]}
                >
                  <View style={[styles.groupArt, { backgroundColor: `${group.color}1A` }]}>
                    {group.image_url ? (
                      <Image source={{ uri: group.image_url }} style={styles.groupImage} />
                    ) : (
                      <>
                        <View style={[styles.artCircleLarge, { backgroundColor: `${group.color}22` }]} />
                        <View style={[styles.artCircleSmall, { backgroundColor: `${group.color}32` }]} />
                        <Text style={[styles.groupInitial, { color: group.color }]}>{group.name.charAt(0).toUpperCase()}</Text>
                      </>
                    )}
                  </View>
                  <View style={styles.groupContent}>
                    <View style={styles.groupTitleRow}>
                      <Text numberOfLines={1} style={styles.groupName}>{group.name}</Text>
                      <View style={[styles.roleBadge, group.role === 'owner' && styles.ownerBadge]}>
                        <Text style={[styles.roleBadgeText, group.role === 'owner' && styles.ownerBadgeText]}>{roleLabel(group.role)}</Text>
                      </View>
                    </View>
                    <Text numberOfLines={2} style={styles.groupDescription}>
                      {group.description || 'A shared space for plans, updates, and time together.'}
                    </Text>
                    <View style={styles.groupMetaRow}>
                      <View style={styles.metaItem}>
                        <Ionicons color={COLORS.faint} name="people-outline" size={14} />
                        <Text style={styles.metaText}>{group.member_count}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Ionicons color={COLORS.faint} name="globe-outline" size={14} />
                        <Text numberOfLines={1} style={styles.metaText}>{group.timezone}</Text>
                      </View>
                    </View>
                    <View style={[styles.nextEvent, { backgroundColor: `${group.color}12` }]}>
                      <View style={[styles.nextEventDot, { backgroundColor: group.color }]} />
                      <Text numberOfLines={1} style={[styles.nextEventText, { color: group.color }]}>{nextEventLabel(group)}</Text>
                    </View>
                  </View>
                  <Ionicons color="#B5B5BE" name="chevron-forward" size={18} />
                </Pressable>
              ))}
            </View>
          ) : groups.length ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons color={COLORS.primary} name="search-outline" size={30} />
              </View>
              <Text style={styles.emptyTitle}>No matching groups</Text>
              <Text style={styles.emptyBody}>Try a different search or role filter.</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons color={COLORS.primary} name="people-outline" size={34} />
              </View>
              <Text style={styles.emptyTitle}>Start your first circle</Text>
              <Text style={styles.emptyBody}>Create a group for friends, family, classmates, or teammates—or join one with an invite code.</Text>
              <View style={styles.emptyActions}>
                <Pressable onPress={() => setModal('create')} style={styles.emptyPrimary}>
                  <Ionicons color="#FFFFFF" name="add" size={17} />
                  <Text style={styles.emptyPrimaryText}>Create group</Text>
                </Pressable>
                <Pressable onPress={() => setModal('join')} style={styles.emptySecondary}>
                  <Text style={styles.emptySecondaryText}>Join with code</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <GroupActionModal
        mode={modal}
        onClose={() => setModal(null)}
        onComplete={() => {
          setModal(null);
          void loadGroups(true);
        }}
      />
    </SafeAreaView>
  );
}

function GroupActionModal({
  mode,
  onClose,
  onComplete,
}: {
  mode: GroupModal;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [timezone, setTimezone] = useState(deviceTimezone);
  const [inviteCode, setInviteCode] = useState('');
  const [color, setColor] = useState(MEMBER_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) {
      setName('');
      setDescription('');
      setTimezone(deviceTimezone);
      setInviteCode('');
      setColor(MEMBER_COLORS[0]);
      setError(null);
      setSaving(false);
    }
  }, [mode]);

  async function submit() {
    if (!mode || saving) return;
    setError(null);

    if (mode === 'create' && !name.trim()) {
      setError('Group name is required.');
      return;
    }
    if (mode === 'create' && name.trim().length > 80) {
      setError('Group name must be 80 characters or fewer.');
      return;
    }
    if (mode === 'create' && description.trim().length > 500) {
      setError('Description must be 500 characters or fewer.');
      return;
    }
    if (mode === 'join' && !/^[A-Z0-9]{6,12}$/.test(inviteCode)) {
      setError('Enter a valid 6–12 character invite code.');
      return;
    }

    setSaving(true);
    try {
      if (mode === 'create') {
        await createGroup({ name: name.trim(), description, timezone, color });
        Alert.alert('Group created', `${name.trim()} is ready for plans.`);
      } else {
        const joined = (await joinGroupByCode(inviteCode, color)) as { name?: string } | null;
        Alert.alert('You joined the group', joined?.name ? `Welcome to ${joined.name}.` : 'The group is now in your list.');
      }
      onComplete();
    } catch (submitError) {
      const message = errorMessage(submitError, 'The group action could not be completed.');
      setError(message.replace(/^.*?message[:=]\s*/i, ''));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={Boolean(mode)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={[styles.modalIcon, { backgroundColor: mode === 'create' ? COLORS.primarySoft : COLORS.greenSoft }]}>
              <Ionicons color={mode === 'create' ? COLORS.primary : COLORS.green} name={mode === 'create' ? 'people-outline' : 'enter-outline'} size={23} />
            </View>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalTitle}>{mode === 'create' ? 'Create a group' : 'Join a group'}</Text>
              <Text style={styles.modalSubtitle}>{mode === 'create' ? 'Make a shared home for your plans.' : 'Enter the code shared by a group admin.'}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <Ionicons color={COLORS.muted} name="close" size={22} />
            </Pressable>
          </View>

          {error ? (
            <View style={styles.modalError}>
              <Ionicons color={COLORS.red} name="alert-circle" size={16} />
              <Text style={styles.modalErrorText}>{error}</Text>
            </View>
          ) : null}

          {mode === 'create' ? (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>GROUP NAME</Text>
              <View style={styles.inputShell}>
                <Ionicons color={COLORS.faint} name="people-outline" size={18} />
                <TextInput maxLength={80} onChangeText={setName} placeholder="Weekend crew" placeholderTextColor="#ABABB4" style={styles.input} value={name} />
                <Text style={styles.inputCount}>{name.length}/80</Text>
              </View>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>DESCRIPTION</Text>
                <Text style={styles.inputCount}>{description.length}/500</Text>
              </View>
              <View style={[styles.inputShell, styles.descriptionShell]}>
                <TextInput maxLength={500} multiline onChangeText={setDescription} placeholder="What does this group plan together?" placeholderTextColor="#ABABB4" style={[styles.input, styles.descriptionInput]} textAlignVertical="top" value={description} />
              </View>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>TIMEZONE</Text>
                <Pressable onPress={() => setTimezone(deviceTimezone)}>
                  <Text style={styles.deviceTimezone}>Use device</Text>
                </Pressable>
              </View>
              <View style={styles.inputShell}>
                <Ionicons color={COLORS.faint} name="globe-outline" size={18} />
                <TextInput autoCapitalize="none" onChangeText={setTimezone} placeholder="Asia/Manila" placeholderTextColor="#ABABB4" style={styles.input} value={timezone} />
              </View>
            </ScrollView>
          ) : (
            <View>
              <Text style={styles.inputLabel}>INVITE CODE</Text>
              <View style={[styles.inputShell, styles.codeShell]}>
                <TextInput
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={12}
                  onChangeText={(value) => setInviteCode(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="AB12CD34"
                  placeholderTextColor="#B5B5C0"
                  style={styles.codeInput}
                  value={inviteCode}
                />
              </View>
              <Text style={styles.codeHint}>Invite codes contain 6–12 letters and numbers.</Text>
            </View>
          )}

          <Text style={styles.inputLabel}>YOUR GROUP COLOR</Text>
          <View style={styles.colorRow}>
            {MEMBER_COLORS.map((option) => (
              <Pressable key={option} onPress={() => setColor(option)} style={[styles.colorOption, { backgroundColor: option }, color === option && styles.colorOptionActive]}>
                {color === option ? <Ionicons color="#FFFFFF" name="checkmark" size={17} /> : null}
              </Pressable>
            ))}
          </View>
          <Text style={styles.colorHint}>This color identifies your events from this group.</Text>

          <Pressable disabled={saving} onPress={() => void submit()} style={({ pressed }) => [styles.submitButton, saving && styles.submitButtonDisabled, pressed && styles.pressed]}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons color="#FFFFFF" name={mode === 'create' ? 'add-circle-outline' : 'enter-outline'} size={19} />}
            <Text style={styles.submitButtonText}>{saving ? 'Please wait...' : mode === 'create' ? 'Create group' : 'Join group'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 36 },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 13 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: COLORS.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.15 },
  title: { marginTop: 3, color: COLORS.ink, fontSize: 28, fontWeight: '800', letterSpacing: -1 },
  headerActions: { flexDirection: 'row', gap: 8 },
  joinButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, backgroundColor: COLORS.surface },
  createButton: { minHeight: 42, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, backgroundColor: COLORS.primary },
  createButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  summaryCard: { minHeight: 120, marginTop: 18, padding: 18, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 25, backgroundColor: COLORS.navy },
  summaryGlow: { position: 'absolute', width: 160, height: 160, top: -100, right: -35, borderRadius: 80, backgroundColor: '#696BD8', opacity: 0.55 },
  summaryIcon: { width: 49, height: 49, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: COLORS.primary },
  summaryCopy: { flex: 1 },
  summaryTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  summaryBody: { marginTop: 5, color: '#C4C4DF', fontSize: 9, lineHeight: 14 },
  summaryStats: { minWidth: 52, alignItems: 'center' },
  summaryStatNumber: { color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  summaryStatLabel: { marginTop: 3, color: '#B5B5D5', fontSize: 7, fontWeight: '900', letterSpacing: 0.65 },
  metricRow: { marginTop: 11, flexDirection: 'row', gap: 9 },
  metricCard: { flex: 1, minHeight: 70, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: 19, backgroundColor: COLORS.surface },
  metricIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  metricNumber: { color: COLORS.ink, fontSize: 16, fontWeight: '900' },
  metricLabel: { marginTop: 2, color: COLORS.faint, fontSize: 7 },
  searchShell: { minHeight: 49, marginTop: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: COLORS.line, borderRadius: 16, backgroundColor: COLORS.surface },
  searchInput: { flex: 1, color: COLORS.ink, fontSize: 11 },
  filters: { paddingTop: 10, paddingBottom: 2, gap: 7 },
  filterChip: { minHeight: 34, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 13, backgroundColor: COLORS.surface },
  filterChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  filterText: { color: COLORS.muted, fontSize: 8, fontWeight: '800' },
  filterTextActive: { color: COLORS.primary },
  errorBanner: { marginTop: 11, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 13, backgroundColor: COLORS.redSoft },
  errorText: { flex: 1, color: '#9F4148', fontSize: 9, lineHeight: 14 },
  sectionHeader: { marginTop: 23, marginBottom: 11, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  sectionTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.35 },
  sectionSubtitle: { marginTop: 3, color: COLORS.faint, fontSize: 9 },
  inviteLink: { color: COLORS.primary, fontSize: 9, fontWeight: '800' },
  loadingState: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: COLORS.muted, fontSize: 9 },
  groupList: { gap: 10 },
  groupCard: { minHeight: 155, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.line, borderRadius: 22, backgroundColor: COLORS.surface },
  groupArt: { width: 94, height: 125, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  groupImage: { width: '100%', height: '100%' },
  artCircleLarge: { position: 'absolute', width: 90, height: 90, top: -44, right: -35, borderRadius: 45 },
  artCircleSmall: { position: 'absolute', width: 55, height: 55, bottom: -24, left: -19, borderRadius: 28 },
  groupInitial: { fontSize: 34, fontWeight: '900' },
  groupContent: { flex: 1 },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  groupName: { flexShrink: 1, color: COLORS.ink, fontSize: 14, fontWeight: '900' },
  roleBadge: { paddingVertical: 4, paddingHorizontal: 7, borderRadius: 8, backgroundColor: '#F0F0F4' },
  ownerBadge: { backgroundColor: COLORS.primarySoft },
  roleBadgeText: { color: COLORS.muted, fontSize: 6, fontWeight: '900', textTransform: 'uppercase' },
  ownerBadgeText: { color: COLORS.primary },
  groupDescription: { marginTop: 6, color: COLORS.muted, fontSize: 8, lineHeight: 13 },
  groupMetaRow: { marginTop: 8, flexDirection: 'row', gap: 12 },
  metaItem: { maxWidth: 120, flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { flexShrink: 1, color: COLORS.faint, fontSize: 7, fontWeight: '700' },
  nextEvent: { marginTop: 9, minHeight: 27, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10 },
  nextEventDot: { width: 6, height: 6, borderRadius: 3 },
  nextEventText: { flex: 1, fontSize: 7, fontWeight: '800' },
  emptyState: { minHeight: 300, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 24, backgroundColor: COLORS.surface },
  emptyIcon: { width: 78, height: 78, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: COLORS.primarySoft },
  emptyTitle: { marginTop: 17, color: COLORS.ink, fontSize: 16, fontWeight: '900' },
  emptyBody: { maxWidth: 330, marginTop: 6, color: COLORS.muted, fontSize: 9, lineHeight: 15, textAlign: 'center' },
  emptyActions: { marginTop: 18, flexDirection: 'row', gap: 8 },
  emptyPrimary: { minHeight: 42, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, backgroundColor: COLORS.primary },
  emptyPrimaryText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  emptySecondary: { minHeight: 42, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14 },
  emptySecondaryText: { color: COLORS.primary, fontSize: 9, fontWeight: '800' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,20,35,0.45)' },
  modalCard: { width: '100%', maxWidth: 720, maxHeight: '90%', alignSelf: 'center', paddingHorizontal: 20, paddingTop: 9, paddingBottom: Platform.OS === 'ios' ? 32 : 22, borderTopLeftRadius: 29, borderTopRightRadius: 29, backgroundColor: COLORS.surface },
  modalHandle: { width: 38, height: 4, alignSelf: 'center', marginBottom: 16, borderRadius: 2, backgroundColor: '#D9D9E2' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  modalIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  modalHeaderCopy: { flex: 1 },
  modalTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '900' },
  modalSubtitle: { marginTop: 3, color: COLORS.muted, fontSize: 9 },
  modalClose: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#F4F4F8' },
  modalError: { marginTop: 14, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 13, backgroundColor: COLORS.redSoft },
  modalErrorText: { flex: 1, color: '#9F4148', fontSize: 9, lineHeight: 14 },
  inputLabel: { marginTop: 16, marginBottom: 7, color: '#6E6E79', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  labelRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  inputShell: { minHeight: 51, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#DEDEE8', borderRadius: 15, backgroundColor: '#FAFAFD' },
  input: { flex: 1, paddingVertical: 11, color: COLORS.ink, fontSize: 11 },
  inputCount: { color: COLORS.faint, fontSize: 7 },
  descriptionShell: { minHeight: 91, alignItems: 'flex-start' },
  descriptionInput: { minHeight: 86, lineHeight: 16 },
  deviceTimezone: { marginBottom: 7, color: COLORS.primary, fontSize: 8, fontWeight: '800' },
  codeShell: { minHeight: 68, justifyContent: 'center' },
  codeInput: { flex: 1, color: COLORS.ink, fontSize: 22, fontWeight: '900', letterSpacing: 5, textAlign: 'center' },
  codeHint: { marginTop: 6, color: COLORS.faint, fontSize: 8, textAlign: 'center' },
  colorRow: { flexDirection: 'row', gap: 10 },
  colorOption: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: COLORS.surface, borderRadius: 14 },
  colorOptionActive: { borderColor: '#D9D9E3', transform: [{ scale: 1.08 }] },
  colorHint: { marginTop: 7, color: COLORS.faint, fontSize: 8 },
  submitButton: { minHeight: 52, marginTop: 21, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 16, backgroundColor: COLORS.primary },
  submitButtonDisabled: { opacity: 0.65 },
  submitButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
});
