import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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

import { PlanadoAlert as Alert } from '../../components/PlanadoAlert';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/Headers';
import { IconButton } from '../../components/ui/IconButton';
import { PressableScale } from '../../components/ui/PressableScale';
import { Reveal } from '../../components/ui/Reveal';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { SkeletonList } from '../../components/ui/Skeleton';
import { useAuth } from '../../hooks/useAuth';
import { COLORS } from '../../theme/colors';
import { GRADIENT, gradientStyle, ON_PRIMARY, PAGE, RADIUS, SHADOW, tint, TYPE } from '../../theme/tokens';
import {
  createGroup,
  getMyGroups,
  joinGroupByCode,
  type GroupRole,
  type GroupType,
  type PlanadoGroup,
} from '../../services/groupService';
import { supabase } from '../../services/supabase';

type RoleFilter = 'all' | GroupRole;
type GroupModal = 'create' | 'join' | null;

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
  const params = useLocalSearchParams<{ open?: string | string[] }>();
  const requestedModal = Array.isArray(params.open) ? params.open[0] : params.open;
  const { user } = useAuth();
  const [groups, setGroups] = useState<PlanadoGroup[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [modal, setModal] = useState<GroupModal>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (requestedModal !== 'create' && requestedModal !== 'join') return;
    setModal(requestedModal);
    router.setParams({ open: '' });
  }, [requestedModal, router]);

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
      .channel(`groups:${user.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`)
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
        keyboardShouldPersistTaps="handled"
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
          <PageHeader
            actions={
              <>
                <IconButton icon="enter-outline" color={COLORS.primary} label="Join with invite code" onPress={() => setModal('join')} />
                <Button icon="add" label="Create" onPress={() => setModal('create')} size="sm" />
              </>
            }
            eyebrow="Your people"
            title="Groups"
          />

          <Reveal index={1} style={[styles.summaryCard, gradientStyle(GRADIENT.hero, GRADIENT.heroFallback)]}>
            <View style={styles.summaryTop}>
              <View style={styles.summaryIcon}>
                <Ionicons color="#FFFFFF" name="people" size={24} />
              </View>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryTitle}>Plan together, stay close.</Text>
                <Text style={styles.summaryBody}>Shared calendars and updates for the people that matter.</Text>
              </View>
            </View>
            <View style={styles.statsRow}>
              <Stat label="Groups" value={groups.length} />
              <View style={styles.statDivider} />
              <Stat label="You manage" value={managedCount} />
              <View style={styles.statDivider} />
              <Stat label="Connections" value={totalPeople} />
            </View>
          </Reveal>

          <Reveal index={2} style={styles.searchShell}>
            <Ionicons color={COLORS.muted} name="search" size={19} />
            <TextInput
              accessibilityLabel="Search your groups"
              onChangeText={setSearch}
              placeholder="Search your groups"
              placeholderTextColor={COLORS.faint}
              returnKeyType="search"
              style={styles.searchInput}
              value={search}
            />
            {search ? (
              <Pressable accessibilityLabel="Clear search" accessibilityRole="button" hitSlop={10} onPress={() => setSearch('')}>
                <Ionicons color={COLORS.faint} name="close-circle" size={20} />
              </Pressable>
            ) : null}
          </Reveal>

          <Reveal index={3} style={styles.filters}>
            <SegmentedControl
              onChange={setRoleFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'owner', label: 'Owned' },
                { value: 'admin', label: 'Admin' },
                { value: 'member', label: 'Member' },
              ]}
              value={roleFilter}
            />
          </Reveal>

          <Banner message={error} />

          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Your circles</Text>
              <Text style={styles.sectionSubtitle}>
                {loading ? 'Loading…' : `${visibleGroups.length} group${visibleGroups.length === 1 ? '' : 's'} shown`}
              </Text>
            </View>
            <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setModal('join')} style={styles.inviteLink}>
              <Ionicons color={COLORS.primary} name="key-outline" size={15} />
              <Text numberOfLines={1} style={styles.inviteLinkText}>Have a code?</Text>
            </Pressable>
          </View>

          {loading ? (
            <SkeletonList count={3} label="Loading your groups" />
          ) : visibleGroups.length ? (
            <View style={styles.groupList}>
              {visibleGroups.map((group, index) => (
                <Reveal index={index} key={group.id}>
                  <PressableScale
                    accessibilityHint="Opens the group"
                    accessibilityLabel={`${group.name}, ${roleLabel(group.role)}, ${group.member_count} members`}
                    onPress={() => router.push(`/group/${group.id}` as Href)}
                    scaleTo={0.98}
                    style={styles.groupCard}
                  >
                    <View style={styles.groupTop}>
                      <View style={[styles.groupArt, { backgroundColor: tint(group.color, 0.16) }]}>
                        {group.image_url ? (
                          <Image source={{ uri: group.image_url }} style={styles.groupImage} />
                        ) : (
                          <Text style={[styles.groupInitial, { color: group.color }]}>{group.name.charAt(0).toUpperCase()}</Text>
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
                            <Ionicons color={COLORS.muted} name="people-outline" size={15} />
                            <Text style={styles.metaText}>{group.member_count}</Text>
                          </View>
                          <View style={styles.metaItem}>
                            <Ionicons color={COLORS.muted} name="globe-outline" size={15} />
                            <Text numberOfLines={1} style={styles.metaText}>{group.timezone}</Text>
                          </View>
                          {group.group_type === 'cit_u_classmates' ? (
                            <View style={styles.citBadge}>
                              <Ionicons color={COLORS.primary} name="school-outline" size={13} />
                              <Text style={styles.citBadgeText}>CIT-U</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <Ionicons color={COLORS.faint} name="chevron-forward" size={18} />
                    </View>
                    <View style={[styles.nextEvent, { backgroundColor: tint(group.color, 0.1) }]}>
                      <Ionicons color={group.color} name={group.next_event ? 'calendar' : 'calendar-clear-outline'} size={15} />
                      <Text numberOfLines={1} style={[styles.nextEventText, !group.next_event && styles.nextEventEmpty]}>
                        {nextEventLabel(group)}
                      </Text>
                    </View>
                  </PressableScale>
                </Reveal>
              ))}
            </View>
          ) : groups.length ? (
            <EmptyState
              body="Try a different search or role filter."
              icon="search-outline"
              title="No matching groups"
            >
              <Button
                label="Clear filters"
                onPress={() => {
                  setSearch('');
                  setRoleFilter('all');
                }}
                size="sm"
                variant="soft"
              />
            </EmptyState>
          ) : (
            <EmptyState
              body="Create a group for friends, family, classmates, or teammates—or join one with an invite code."
              icon="people-outline"
              title="Start your first circle"
            >
              <Button icon="add" label="Create group" onPress={() => setModal('create')} size="sm" />
              <Button label="Join with code" onPress={() => setModal('join')} size="sm" variant="secondary" />
            </EmptyState>
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text numberOfLines={1} style={styles.statLabel}>{label}</Text>
    </View>
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
  const [groupType, setGroupType] = useState<GroupType>('general');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) {
      setName('');
      setDescription('');
      setTimezone(deviceTimezone);
      setInviteCode('');
      setColor(MEMBER_COLORS[0]);
      setGroupType('general');
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
        await createGroup({ name: name.trim(), description, timezone, color, groupType });
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

  const creating = mode === 'create';

  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={Boolean(mode)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={[styles.modalIcon, { backgroundColor: creating ? COLORS.primarySoft : COLORS.greenSoft }]}>
              <Ionicons color={creating ? COLORS.primary : COLORS.green} name={creating ? 'people-outline' : 'enter-outline'} size={24} />
            </View>
            <View style={styles.modalHeaderCopy}>
              <Text accessibilityRole="header" style={styles.modalTitle}>{creating ? 'Create a group' : 'Join a group'}</Text>
              <Text style={styles.modalSubtitle}>{creating ? 'Make a shared home for your plans.' : 'Enter the code shared by a group admin.'}</Text>
            </View>
            <IconButton icon="close" label="Close" onPress={onClose} tone="ghost" />
          </View>

          <Banner message={error} />

          {creating ? (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.modalScroll}>
              <Text style={styles.inputLabel}>Group type</Text>
              <View style={styles.groupTypeRow}>
                <ChoiceCard
                  active={groupType === 'general'}
                  body="Friends, family, or a team"
                  icon="people-outline"
                  onPress={() => setGroupType('general')}
                  title="General"
                />
                <ChoiceCard
                  active={groupType === 'cit_u_classmates'}
                  body="Ready for class schedule import"
                  icon="school-outline"
                  onPress={() => setGroupType('cit_u_classmates')}
                  title="CIT-U classmates"
                />
              </View>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Group name</Text>
                <Text style={styles.inputCount}>{name.length}/80</Text>
              </View>
              <View style={styles.inputShell}>
                <Ionicons color={COLORS.muted} name="people-outline" size={18} />
                <TextInput accessibilityLabel="Group name" maxLength={80} onChangeText={setName} placeholder="Weekend crew" placeholderTextColor={COLORS.faint} style={styles.input} value={name} />
              </View>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Description</Text>
                <Text style={styles.inputCount}>{description.length}/500</Text>
              </View>
              <View style={[styles.inputShell, styles.descriptionShell]}>
                <TextInput accessibilityLabel="Description" maxLength={500} multiline onChangeText={setDescription} placeholder="What does this group plan together?" placeholderTextColor={COLORS.faint} style={[styles.input, styles.descriptionInput]} textAlignVertical="top" value={description} />
              </View>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Timezone</Text>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setTimezone(deviceTimezone)}>
                  <Text style={styles.deviceTimezone}>Use device</Text>
                </Pressable>
              </View>
              <View style={styles.inputShell}>
                <Ionicons color={COLORS.muted} name="globe-outline" size={18} />
                <TextInput accessibilityLabel="Timezone" autoCapitalize="none" onChangeText={setTimezone} placeholder="Asia/Manila" placeholderTextColor={COLORS.faint} style={styles.input} value={timezone} />
              </View>
            </ScrollView>
          ) : (
            <View>
              <Text style={styles.inputLabel}>Invite code</Text>
              <View style={[styles.inputShell, styles.codeShell]}>
                <TextInput
                  accessibilityLabel="Invite code"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={12}
                  onChangeText={(value) => setInviteCode(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="AB12CD34"
                  placeholderTextColor={COLORS.faint}
                  style={styles.codeInput}
                  value={inviteCode}
                />
              </View>
              <Text style={styles.codeHint}>Invite codes contain 6–12 letters and numbers.</Text>
            </View>
          )}

          <Text style={styles.inputLabel}>Your color in this group</Text>
          <View style={styles.colorRow}>
            {MEMBER_COLORS.map((option, index) => {
              const active = color === option;
              return (
                <PressableScale
                  accessibilityLabel={`Color ${index + 1}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  key={option}
                  onPress={() => setColor(option)}
                  scaleTo={0.9}
                  style={[styles.colorOption, { backgroundColor: option }, active && styles.colorOptionActive]}
                >
                  {active ? <Ionicons color="#FFFFFF" name="checkmark" size={18} /> : null}
                </PressableScale>
              );
            })}
          </View>
          <Text style={styles.colorHint}>This color marks your events in this group.</Text>

          <Button
            icon={creating ? 'add-circle-outline' : 'enter-outline'}
            label={saving ? 'Please wait…' : creating ? 'Create group' : 'Join group'}
            loading={saving}
            onPress={() => void submit()}
            style={styles.submitButton}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ChoiceCard({
  active,
  body,
  icon,
  onPress,
  title,
}: {
  active: boolean;
  body: string;
  icon: 'people-outline' | 'school-outline';
  onPress: () => void;
  title: string;
}) {
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      scaleTo={0.97}
      style={[styles.groupTypeCard, active && styles.groupTypeCardActive]}
    >
      <View style={[styles.groupTypeIcon, active && styles.groupTypeIconActive]}>
        <Ionicons color={active ? COLORS.primary : COLORS.muted} name={icon} size={20} />
      </View>
      <Text style={[styles.groupTypeTitle, active && styles.groupTypeTitleActive]}>{title}</Text>
      <Text style={styles.groupTypeBody}>{body}</Text>
      {active ? (
        <View style={styles.groupTypeCheck}>
          <Ionicons color={ON_PRIMARY} name="checkmark" size={13} />
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 36 },
  page: { width: '100%', maxWidth: PAGE.maxWidth, alignSelf: 'center', paddingHorizontal: PAGE.gutter, paddingTop: 12 },
  summaryCard: { marginTop: 18, padding: 18, overflow: 'hidden', borderRadius: RADIUS.xxl, boxShadow: SHADOW.md },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  summaryIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: 'rgba(255,255,255,0.16)' },
  summaryCopy: { flex: 1 },
  summaryTitle: { ...TYPE.headline, color: '#FFFFFF', fontWeight: '800' },
  summaryBody: { ...TYPE.subhead, marginTop: 3, color: 'rgba(255,255,255,0.8)', fontWeight: '400' },
  statsRow: {
    marginTop: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statValue: { fontSize: 22, lineHeight: 26, color: '#FFFFFF', fontWeight: '800' },
  statLabel: { ...TYPE.footnote, marginTop: 2, color: 'rgba(255,255,255,0.75)' },
  statDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.16)' },
  searchShell: {
    minHeight: 50,
    marginTop: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
  },
  searchInput: { ...TYPE.body, flex: 1, paddingVertical: 12, color: COLORS.ink },
  filters: { marginTop: 12 },
  sectionHeader: { marginTop: 26, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  sectionCopy: { flex: 1 },
  sectionTitle: { ...TYPE.title3, color: COLORS.ink },
  sectionSubtitle: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  inviteLink: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5 },
  inviteLinkText: { ...TYPE.subhead, color: COLORS.primary, fontWeight: '700' },
  groupList: { gap: 12 },
  groupCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surface,
  },
  groupTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  groupArt: { width: 64, height: 64, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.lg },
  groupImage: { width: '100%', height: '100%' },
  groupInitial: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  groupContent: { flex: 1 },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupName: { ...TYPE.headline, flexShrink: 1, color: COLORS.ink },
  roleBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: RADIUS.pill, backgroundColor: COLORS.elevatedStrong },
  ownerBadge: { backgroundColor: COLORS.primarySoft },
  roleBadgeText: { ...TYPE.footnote, color: COLORS.muted, fontWeight: '700' },
  ownerBadgeText: { color: COLORS.primary },
  groupDescription: { ...TYPE.subhead, marginTop: 3, color: COLORS.muted, fontWeight: '400' },
  groupMetaRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 6 },
  metaItem: { maxWidth: 150, flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...TYPE.footnote, flexShrink: 1, color: COLORS.muted },
  citBadge: { paddingVertical: 2, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADIUS.pill, backgroundColor: COLORS.primarySoft },
  citBadgeText: { ...TYPE.footnote, color: COLORS.primary, fontWeight: '700' },
  nextEvent: { marginTop: 12, minHeight: 38, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: RADIUS.sm },
  nextEventText: { ...TYPE.subhead, flex: 1, color: COLORS.ink, fontWeight: '600' },
  nextEventEmpty: { color: COLORS.muted, fontWeight: '400' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12, 12, 24, 0.5)' },
  modalCard: {
    width: '100%',
    maxWidth: PAGE.maxWidth,
    maxHeight: '92%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    backgroundColor: COLORS.surface,
    boxShadow: SHADOW.lg,
  },
  modalHandle: { width: 40, height: 5, alignSelf: 'center', marginBottom: 14, borderRadius: 3, backgroundColor: COLORS.line },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md },
  modalHeaderCopy: { flex: 1 },
  modalTitle: { ...TYPE.title3, color: COLORS.ink },
  modalSubtitle: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  modalScroll: { flexGrow: 0 },
  groupTypeRow: { flexDirection: 'row', gap: 10 },
  groupTypeCard: { flex: 1, minHeight: 124, padding: 14, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.lg, backgroundColor: COLORS.input },
  groupTypeCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  groupTypeIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm, backgroundColor: COLORS.elevatedStrong },
  groupTypeIconActive: { backgroundColor: COLORS.surface },
  groupTypeTitle: { ...TYPE.callout, marginTop: 10, color: COLORS.ink, fontWeight: '700' },
  groupTypeTitleActive: { color: COLORS.primary },
  groupTypeBody: { ...TYPE.footnote, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  groupTypeCheck: { position: 'absolute', top: 12, right: 12, width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: COLORS.primary },
  inputLabel: { ...TYPE.subhead, marginTop: 18, marginBottom: 8, color: COLORS.ink, fontWeight: '700' },
  labelRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  inputShell: { minHeight: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.md, backgroundColor: COLORS.input },
  input: { ...TYPE.body, flex: 1, paddingVertical: 12, color: COLORS.ink },
  inputCount: { ...TYPE.footnote, marginBottom: 8, color: COLORS.muted },
  descriptionShell: { minHeight: 96, alignItems: 'flex-start' },
  descriptionInput: { minHeight: 90 },
  deviceTimezone: { ...TYPE.subhead, marginBottom: 8, color: COLORS.primary, fontWeight: '700' },
  codeShell: { minHeight: 72, justifyContent: 'center' },
  codeInput: { flex: 1, color: COLORS.ink, fontSize: 26, fontWeight: '800', letterSpacing: 6, textAlign: 'center' },
  codeHint: { ...TYPE.footnote, marginTop: 8, color: COLORS.muted, textAlign: 'center' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorOption: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: COLORS.surface, borderRadius: 22 },
  colorOptionActive: { borderColor: COLORS.primarySoft, boxShadow: SHADOW.sm },
  colorHint: { ...TYPE.footnote, marginTop: 8, color: COLORS.muted },
  submitButton: { marginTop: 22 },
});
