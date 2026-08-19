import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { type Href, Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlanadoAlert as Alert } from '../../components/PlanadoAlert';
import { PlanadoLoader } from '../../components/PlanadoLoader';
import { useAuth } from '../../hooks/useAuth';
import { COLORS } from '../../theme/colors';
import {
  createGroupInvite,
  deleteGroup,
  getGroupDetails,
  leaveGroup,
  removeGroupMember,
  revokeGroupInvite,
  updateGroupMemberRole,
  type GroupDetails,
  type GroupInvite,
  type GroupMember,
  type GroupRole,
} from '../../services/groupService';
import { supabase } from '../../services/supabase';
import { makeGroupWidget } from '../../services/widgetService';

function roleLabel(role: GroupRole) {
  if (role === 'owner') return 'Creator';
  if (role === 'admin') return 'Admin';
  return 'Member';
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

function roleRank(role: GroupRole) {
  if (role === 'owner') return 0;
  if (role === 'admin') return 1;
  return 2;
}

function roleAppearance(role: GroupRole) {
  if (role === 'owner') return { color: COLORS.primary, background: COLORS.primarySoft, icon: 'star' as const };
  if (role === 'admin') return { color: COLORS.orange, background: COLORS.orangeSoft, icon: 'shield-checkmark' as const };
  return { color: COLORS.muted, background: COLORS.elevated, icon: 'person' as const };
}

export default function GroupDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string | string[] }>();
  const groupId = Array.isArray(params.groupId) ? params.groupId[0] : params.groupId;
  const { user, loading: authLoading } = useAuth();
  const [details, setDetails] = useState<GroupDetails | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetails = useCallback(async (isRefresh = false) => {
    if (!groupId || !user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      setDetails(await getGroupDetails(groupId));
    } catch (loadError) {
      console.error('Could not load group details:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'This group could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId, user]);

  useFocusEffect(
    useCallback(() => {
      void loadDetails();
    }, [loadDetails]),
  );

  useEffect(() => {
    if (!groupId || !user) return;
    const channel = supabase
      .channel(`group-detail:${groupId}:${Date.now()}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` }, () => {
        void loadDetails(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` }, () => {
        void loadDetails(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_invites', filter: `group_id=eq.${groupId}` }, () => {
        void loadDetails(true);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [groupId, loadDetails, user]);

  const members = useMemo(
    () => [...(details?.members ?? [])].sort((left, right) => roleRank(left.role) - roleRank(right.role)),
    [details?.members],
  );
  const myRole = details?.group.role;
  const canManageInvites = myRole === 'owner' || myRole === 'admin';

  async function createWidget() {
    if (!groupId || !details || widgetLoading) return;
    if (Platform.OS !== 'android') {
      Alert.alert('Android feature', 'Planado home-screen widgets are currently available in the installed Android app.');
      return;
    }

    setWidgetLoading(true);
    try {
      const result = await makeGroupWidget(groupId, details.group.name);
      Alert.alert(
        result.pinRequested ? 'Add Planado widget' : 'Widget is ready',
        result.pinRequested
          ? 'Confirm the Android home-screen prompt to add this group.'
          : 'Long-press your home screen, open Widgets, and choose Planado. This group is already selected.',
      );
    } catch (widgetError) {
      Alert.alert('Could not make widget', errorMessage(widgetError, 'Please try again.'));
    } finally {
      setWidgetLoading(false);
    }
  }

  function openGroupMenu() {
    const options: { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (canManageInvites) {
      options.push({ text: 'Edit group', onPress: () => router.push({ pathname: '/group/settings', params: { groupId } } as Href) });
      options.push({ text: 'Invite members', onPress: () => setInviteOpen(true) });
    }
    options.push({ text: 'View calendar', onPress: () => router.push('/(tabs)/calendar' as Href) });
    if (myRole === 'owner') options.push({ text: 'Delete group', style: 'destructive', onPress: confirmDelete });
    else options.push({ text: 'Leave group', style: 'destructive', onPress: confirmLeave });
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(details?.group.name ?? 'Group options', 'Choose an action', options);
  }

  function canManageMember(member: GroupMember) {
    if (!user || member.user_id === user.id || member.role === 'owner') return false;
    if (myRole === 'owner') return true;
    return myRole === 'admin' && member.role === 'member';
  }

  function manageMember(member: GroupMember) {
    const options: {
      text: string;
      style?: 'default' | 'cancel' | 'destructive';
      onPress?: () => void;
    }[] = [];

    if (myRole === 'owner') {
      options.push({
        text: member.role === 'admin' ? 'Change to member' : 'Make admin',
        onPress: () => confirmRoleChange(member, member.role === 'admin' ? 'member' : 'admin'),
      });
    }
    options.push({
      text: 'Remove from group',
      style: 'destructive',
      onPress: () => confirmRemoveMember(member),
    });
    options.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert(member.display_name, `Current role: ${roleLabel(member.role)}`, options);
  }

  function confirmRoleChange(member: GroupMember, nextRole: 'admin' | 'member') {
    Alert.alert(
      nextRole === 'admin' ? 'Make this member an admin?' : 'Remove admin access?',
      nextRole === 'admin'
        ? `${member.display_name} will be able to create invite codes and remove regular members.`
        : `${member.display_name} will become a regular member.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextRole === 'admin' ? 'Make admin' : 'Change role',
          onPress: () => {
            setActionLoading(true);
            void updateGroupMemberRole(member.id, nextRole)
              .then(() => loadDetails(true))
              .catch(showActionError)
              .finally(() => setActionLoading(false));
          },
        },
      ],
    );
  }

  function confirmRemoveMember(member: GroupMember) {
    Alert.alert(
      `Remove ${member.display_name}?`,
      'They will lose access to this group and its shared events. They can rejoin later with a valid invite code.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove member',
          style: 'destructive',
          onPress: () => {
            setActionLoading(true);
            void removeGroupMember(member.id)
              .then(() => loadDetails(true))
              .catch(showActionError)
              .finally(() => setActionLoading(false));
          },
        },
      ],
    );
  }

  function confirmLeave() {
    if (!groupId || !details) return;
    Alert.alert('Leave this group?', `You will lose access to ${details.group.name} and its shared plans.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave group',
        style: 'destructive',
        onPress: () => {
          setActionLoading(true);
          void leaveGroup(groupId)
            .then(() => router.replace('/(tabs)/groups'))
            .catch(showActionError)
            .finally(() => setActionLoading(false));
        },
      },
    ]);
  }

  function confirmDelete() {
    if (!groupId || !details) return;
    Alert.alert(
      `Delete ${details.group.name}?`,
      'This permanently deletes the group, memberships, invite codes, events, responses, notifications, and summaries. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: () => {
            setActionLoading(true);
            void deleteGroup(groupId)
              .then(() => router.replace('/(tabs)/groups'))
              .catch(showActionError)
              .finally(() => setActionLoading(false));
          },
        },
      ],
    );
  }

  function showActionError(actionError: unknown) {
    Alert.alert(
      'Action could not be completed',
      errorMessage(actionError, 'Please try again.'),
    );
  }

  if (!authLoading && !user) return <Redirect href="/(auth)/login" />;
  if (!groupId) return <Redirect href="/(tabs)/groups" />;

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <PlanadoLoader fullScreen message="Opening group..." />
      </SafeAreaView>
    );
  }

  if (!details) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.failurePage}>
          <View style={styles.failureIcon}>
            <Ionicons color={COLORS.red} name="people-outline" size={34} />
          </View>
          <Text style={styles.failureTitle}>Group unavailable</Text>
          <Text style={styles.failureText}>{error ?? 'You may no longer have access to this group.'}</Text>
          <Pressable onPress={() => router.replace('/(tabs)/groups')} style={styles.failureButton}>
            <Text style={styles.failureButtonText}>Back to groups</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const group = details.group;

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={[COLORS.primary]}
            onRefresh={() => void loadDetails(true)}
            refreshing={refreshing}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <Ionicons color={COLORS.ink} name="arrow-back" size={21} />
            </Pressable>
            <Text numberOfLines={1} style={styles.headerTitle}>{group.name}</Text>
            <Pressable accessibilityLabel="Group options" disabled={actionLoading} onPress={openGroupMenu} style={styles.headerButton}>
              {actionLoading ? <ActivityIndicator color={COLORS.primary} size="small" /> : <Ionicons color={COLORS.muted} name="ellipsis-horizontal" size={20} />}
            </Pressable>
          </View>

          <View style={[styles.hero, { backgroundColor: group.color }]}>
            <View style={styles.heroCircleLarge} />
            <View style={styles.heroCircleSmall} />
            <View style={styles.groupAvatar}>
              {group.image_url ? (
                <Image source={{ uri: group.image_url }} style={styles.groupImage} />
              ) : (
                <Text style={[styles.groupInitial, { color: group.color }]}>{group.name.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <Text style={styles.heroName}>{group.name}</Text>
            <Text numberOfLines={2} style={styles.heroDescription}>{group.description || 'A shared space for plans and time together.'}</Text>
            <View style={styles.heroMeta}>
              <View style={styles.heroMetaItem}>
                <Ionicons color="#FFFFFF" name="people-outline" size={14} />
                <Text style={styles.heroMetaText}>{members.length} members</Text>
              </View>
              <View style={styles.heroMetaDivider} />
              <View style={styles.heroMetaItem}>
                <Ionicons color="#FFFFFF" name="globe-outline" size={14} />
                <Text numberOfLines={1} style={styles.heroMetaText}>{group.timezone}</Text>
              </View>
            </View>
          </View>

          <View style={styles.actionRow}>
            {canManageInvites ? (
              <Pressable onPress={() => setInviteOpen(true)} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
                <View style={styles.primaryActionIcon}>
                  <Ionicons color="#FFFFFF" name="person-add-outline" size={20} />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.primaryActionTitle}>Invite friends</Text>
                  <Text style={styles.primaryActionSubtitle}>Generate and share a code</Text>
                </View>
              </Pressable>
            ) : (
              <View style={styles.memberActionInfo}>
                <Ionicons color={COLORS.primary} name="people-circle-outline" size={24} />
                <View style={styles.actionCopy}>
                  <Text style={styles.memberActionTitle}>You are a member</Text>
                  <Text style={styles.primaryActionSubtitle}>Admins manage invites and roles</Text>
                </View>
              </View>
            )}
            <View style={styles.roleCard}>
              <Text style={styles.roleCardLabel}>YOUR ROLE</Text>
              <Text style={styles.roleCardValue}>{roleLabel(group.role)}</Text>
            </View>
          </View>

          <Pressable disabled={widgetLoading} onPress={() => void createWidget()} style={({ pressed }) => [styles.widgetCard, pressed && styles.pressed]}>
            <View style={styles.widgetIcon}>
              {widgetLoading ? <ActivityIndicator color={COLORS.primary} size="small" /> : <Ionicons color={COLORS.primary} name="apps-outline" size={23} />}
            </View>
            <View style={styles.widgetCopy}>
              <View style={styles.widgetTitleRow}>
                <Text style={styles.widgetTitle}>Make widget</Text>
                <View style={styles.androidBadge}><Ionicons color={COLORS.green} name="logo-android" size={11} /><Text style={styles.androidBadgeText}>ANDROID</Text></View>
              </View>
              <Text style={styles.widgetBody}>Show today, tomorrow, and important-event countdowns on your home screen.</Text>
            </View>
            <Ionicons color={COLORS.faint} name="chevron-forward" size={18} />
          </Pressable>

          {group.group_type === 'cit_u_classmates' ? (
            <View style={styles.citConnectionCard}>
              <View style={styles.citConnectionIcon}>
                <Ionicons color={COLORS.primary} name="school-outline" size={24} />
              </View>
              <View style={styles.citConnectionCopy}>
                <Text style={styles.citConnectionEyebrow}>CIT-U SCHEDULE</Text>
                <Text style={styles.citConnectionTitle}>Import from Wildcat One</Text>
                <Text style={styles.citConnectionBody}>Sign in privately, review your classes, then add them to your calendar.</Text>
                <View style={styles.citConnectionStatus}>
                  <Ionicons color={COLORS.green} name="shield-checkmark-outline" size={13} />
                  <Text style={styles.citConnectionStatusText}>Private · owner approved</Text>
                </View>
              </View>
              <Pressable
                onPress={() => router.push({ pathname: '/cit-u/connect', params: { groupId } } as Href)}
                style={styles.citConnectionButton}
              >
                <Text style={styles.citConnectionButtonText}>Connect</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Members</Text>
              <Text style={styles.sectionSubtitle}>Creator, admins, and everyone in the group</Text>
            </View>
            <View style={styles.memberCountBadge}>
              <Text style={styles.memberCountText}>{members.length}</Text>
            </View>
          </View>

          <View style={styles.memberList}>
            {members.map((member, index) => {
              const appearance = roleAppearance(member.role);
              const isMe = member.user_id === user?.id;
              const manageable = canManageMember(member);
              return (
                <View key={member.id}>
                  <View style={styles.memberRow}>
                    <View style={[styles.memberAvatar, { backgroundColor: `${member.color}1F` }]}>
                      {member.avatar_url ? (
                        <Image source={{ uri: member.avatar_url }} style={styles.memberAvatarImage} />
                      ) : (
                        <Text style={[styles.memberInitial, { color: member.color }]}>{member.display_name.charAt(0).toUpperCase()}</Text>
                      )}
                      <View style={[styles.memberColorDot, { backgroundColor: member.color }]} />
                    </View>
                    <View style={styles.memberCopy}>
                      <View style={styles.memberNameRow}>
                        <Text numberOfLines={1} style={styles.memberName}>{member.display_name}</Text>
                        {isMe ? <Text style={styles.youLabel}>YOU</Text> : null}
                      </View>
                      <Text style={styles.memberUsername}>@{member.username}</Text>
                    </View>
                    <View style={[styles.memberRole, { backgroundColor: appearance.background }]}>
                      <Ionicons color={appearance.color} name={appearance.icon} size={11} />
                      <Text style={[styles.memberRoleText, { color: appearance.color }]}>{roleLabel(member.role)}</Text>
                    </View>
                    {manageable ? (
                      <Pressable hitSlop={8} onPress={() => manageMember(member)} style={styles.memberMenu}>
                        <Ionicons color={COLORS.muted} name="ellipsis-vertical" size={19} />
                      </Pressable>
                    ) : (
                      <View style={styles.memberMenu} />
                    )}
                  </View>
                  {index < members.length - 1 ? <View style={styles.separator} /> : null}
                </View>
              );
            })}
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Coming up</Text>
              <Text style={styles.sectionSubtitle}>The next plans for this group</Text>
            </View>
          </View>

          {details.upcoming_events.length ? (
            <View style={styles.eventList}>
              {details.upcoming_events.map((event) => (
                <Pressable key={event.id} onPress={() => router.push(`/event/${event.id}` as Href)} style={({ pressed }) => [styles.eventCard, pressed && styles.pressed]}>
                  <View style={[styles.eventDate, { backgroundColor: `${event.color ?? group.color}18` }]}>
                    <Text style={[styles.eventDateMonth, { color: event.color ?? group.color }]}>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(event.start_time)).toUpperCase()}</Text>
                    <Text style={[styles.eventDateNumber, { color: event.color ?? group.color }]}>{new Date(event.start_time).getDate()}</Text>
                  </View>
                  <View style={styles.eventCopy}>
                    <Text numberOfLines={1} style={styles.eventTitle}>{event.title}</Text>
                    <Text style={styles.eventTime}>{new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(event.start_time))}</Text>
                  </View>
                  <Ionicons color={COLORS.faint} name="calendar-outline" size={19} />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptyEvents}>
              <Ionicons color={COLORS.primary} name="calendar-clear-outline" size={25} />
              <Text style={styles.emptyEventsText}>No upcoming events for this group.</Text>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Group controls</Text>
              <Text style={styles.sectionSubtitle}>Actions based on your role</Text>
            </View>
          </View>

          {canManageInvites ? (
            <Pressable
              onPress={() => router.push({ pathname: '/group/settings', params: { groupId } } as Href)}
              style={({ pressed }) => [styles.editGroupCard, pressed && styles.pressed]}
            >
              <View style={styles.editGroupIcon}>
                <Ionicons color={COLORS.primary} name="create-outline" size={20} />
              </View>
              <View style={styles.editGroupCopy}>
                <Text style={styles.editGroupTitle}>Edit group details</Text>
                <Text style={styles.editGroupBody}>Change the name, description, and timezone.</Text>
              </View>
              <Ionicons color={COLORS.faint} name="chevron-forward" size={18} />
            </Pressable>
          ) : null}

          <View style={styles.permissionsCard}>
            <PermissionRow icon="star-outline" title="Creator" description="Edit or delete group, manage admins, remove members" color={COLORS.primary} background={COLORS.primarySoft} />
            <View style={styles.permissionSeparator} />
            <PermissionRow icon="shield-checkmark-outline" title="Admin" description="Edit group, create invites, and remove regular members" color={COLORS.orange} background={COLORS.orangeSoft} />
            <View style={styles.permissionSeparator} />
            <PermissionRow icon="person-outline" title="Member" description="View plans, participate, and leave voluntarily" color={COLORS.green} background={COLORS.greenSoft} />
          </View>

          {group.role === 'owner' ? (
            <Pressable disabled={actionLoading} onPress={confirmDelete} style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}>
              <Ionicons color={COLORS.red} name="trash-outline" size={19} />
              <Text style={styles.dangerButtonText}>Delete group permanently</Text>
            </Pressable>
          ) : (
            <Pressable disabled={actionLoading} onPress={confirmLeave} style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}>
              <Ionicons color={COLORS.red} name="exit-outline" size={19} />
              <Text style={styles.dangerButtonText}>Leave group</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <InviteModal
        groupName={group.name}
        invites={details.invites}
        onChanged={() => void loadDetails(true)}
        onClose={() => setInviteOpen(false)}
        open={inviteOpen}
        groupId={groupId}
      />
    </SafeAreaView>
  );
}

function PermissionRow({ icon, title, description, color, background }: { icon: 'star-outline' | 'shield-checkmark-outline' | 'person-outline'; title: string; description: string; color: string; background: string }) {
  return (
    <View style={styles.permissionRow}>
      <View style={[styles.permissionIcon, { backgroundColor: background }]}>
        <Ionicons color={color} name={icon} size={18} />
      </View>
      <View style={styles.permissionCopy}>
        <Text style={styles.permissionTitle}>{title}</Text>
        <Text style={styles.permissionDescription}>{description}</Text>
      </View>
    </View>
  );
}

function InviteModal({ groupId, groupName, invites, open, onClose, onChanged }: { groupId: string; groupName: string; invites: GroupInvite[]; open: boolean; onClose: () => void; onChanged: () => void }) {
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const activeInvite = invites.find((invite) => invite.is_active && (!invite.expires_at || new Date(invite.expires_at) > new Date()));

  async function generate() {
    setGenerating(true);
    try {
      await createGroupInvite(groupId);
      onChanged();
    } catch (generateError) {
      Alert.alert('Could not create invite', errorMessage(generateError, 'Please try again.'));
    } finally {
      setGenerating(false);
    }
  }

  async function copyCode(code: string) {
    await Clipboard.setStringAsync(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1800);
  }

  async function shareCode(invite: GroupInvite) {
    await Share.share({
      title: `Join ${groupName} on Planado`,
      message: `Join my group “${groupName}” on Planado with invite code: ${invite.code}`,
    });
  }

  function revoke(invite: GroupInvite) {
    Alert.alert('Deactivate this invite?', 'The code will stop working immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate',
        style: 'destructive',
        onPress: () => {
          void revokeGroupInvite(invite.id)
            .then(onChanged)
            .catch((revokeError: unknown) => Alert.alert('Could not deactivate invite', errorMessage(revokeError, 'Please try again.')));
        },
      },
    ]);
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.modalBackdrop}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.inviteIcon}>
              <Ionicons color={COLORS.primary} name="person-add-outline" size={24} />
            </View>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalTitle}>Invite friends</Text>
              <Text style={styles.modalSubtitle}>Share a secure code for {groupName}.</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <Ionicons color={COLORS.muted} name="close" size={22} />
            </Pressable>
          </View>

          {activeInvite ? (
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>ACTIVE INVITE CODE</Text>
              <Text selectable style={styles.codeValue}>{activeInvite.code}</Text>
              <View style={styles.codeMetaRow}>
                <View style={styles.codeMeta}>
                  <Ionicons color={COLORS.faint} name="people-outline" size={14} />
                  <Text style={styles.codeMetaText}>{activeInvite.use_count}/{activeInvite.max_uses ?? '∞'} uses</Text>
                </View>
                <View style={styles.codeMeta}>
                  <Ionicons color={COLORS.faint} name="time-outline" size={14} />
                  <Text style={styles.codeMetaText}>{activeInvite.expires_at ? `Expires ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(activeInvite.expires_at))}` : 'No expiry'}</Text>
                </View>
              </View>
              <View style={styles.codeActions}>
                <Pressable onPress={() => void copyCode(activeInvite.code)} style={styles.copyButton}>
                  <Ionicons color={COLORS.primary} name={copiedCode === activeInvite.code ? 'checkmark' : 'copy-outline'} size={18} />
                  <Text style={styles.copyButtonText}>{copiedCode === activeInvite.code ? 'Copied' : 'Copy code'}</Text>
                </Pressable>
                <Pressable onPress={() => void shareCode(activeInvite)} style={styles.shareButton}>
                  <Ionicons color="#FFFFFF" name="share-social-outline" size={18} />
                  <Text style={styles.shareButtonText}>Share invite</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => revoke(activeInvite)} style={styles.revokeButton}>
                <Text style={styles.revokeButtonText}>Deactivate this code</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.noCodeCard}>
              <View style={styles.noCodeIcon}>
                <Ionicons color={COLORS.primary} name="key-outline" size={30} />
              </View>
              <Text style={styles.noCodeTitle}>Generate an invite code</Text>
              <Text style={styles.noCodeBody}>The code will work for up to 25 joins and expire automatically after 7 days.</Text>
              <Pressable disabled={generating} onPress={() => void generate()} style={styles.generateButton}>
                {generating ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons color="#FFFFFF" name="sparkles-outline" size={18} />}
                <Text style={styles.generateButtonText}>{generating ? 'Generating...' : 'Generate code'}</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.inviteSecurity}>
            <Ionicons color={COLORS.green} name="shield-checkmark-outline" size={16} />
            <Text style={styles.inviteSecurityText}>Only share codes with people you want in the group. Admins can deactivate a code at any time.</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 40 },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 18 },
  loadingPage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 11 },
  loadingText: { color: COLORS.muted, fontSize: 10 },
  failurePage: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  failureIcon: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: COLORS.redSoft },
  failureTitle: { marginTop: 18, color: COLORS.ink, fontSize: 18, fontWeight: '900' },
  failureText: { maxWidth: 340, marginTop: 7, color: COLORS.muted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  failureButton: { minHeight: 44, marginTop: 18, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: COLORS.primary },
  failureButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  header: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 11 },
  headerButton: { width: 41, height: 41, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, backgroundColor: COLORS.surface },
  headerTitle: { flex: 1, color: COLORS.ink, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  hero: { minHeight: 256, padding: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 27 },
  heroCircleLarge: { position: 'absolute', width: 210, height: 210, top: -120, right: -55, borderRadius: 105, backgroundColor: 'rgba(255,255,255,0.14)' },
  heroCircleSmall: { position: 'absolute', width: 130, height: 130, bottom: -80, left: 14, borderRadius: 65, backgroundColor: 'rgba(20,20,50,0.10)' },
  groupAvatar: { width: 82, height: 82, padding: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.75)', borderRadius: 27, backgroundColor: COLORS.surface },
  groupImage: { width: '100%', height: '100%', borderRadius: 22 },
  groupInitial: { fontSize: 30, fontWeight: '900' },
  heroName: { marginTop: 14, color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  heroDescription: { maxWidth: 430, marginTop: 6, color: 'rgba(255,255,255,0.82)', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  heroMeta: { maxWidth: '100%', marginTop: 14, paddingVertical: 7, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.13)' },
  heroMetaItem: { maxWidth: 150, flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroMetaText: { flexShrink: 1, color: '#FFFFFF', fontSize: 8, fontWeight: '700' },
  heroMetaDivider: { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.35)' },
  actionRow: { marginTop: 12, flexDirection: 'row', gap: 9 },
  primaryAction: { flex: 1.7, minHeight: 76, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, backgroundColor: COLORS.primary },
  primaryActionIcon: { width: 41, height: 41, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' },
  actionCopy: { flex: 1 },
  primaryActionTitle: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  primaryActionSubtitle: { marginTop: 3, color: '#DADAFF', fontSize: 7 },
  memberActionInfo: { flex: 1.7, minHeight: 76, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: COLORS.surface },
  memberActionTitle: { color: COLORS.ink, fontSize: 11, fontWeight: '900' },
  roleCard: { flex: 1, minHeight: 76, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: COLORS.surface },
  roleCardLabel: { color: COLORS.faint, fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  roleCardValue: { marginTop: 5, color: COLORS.primary, fontSize: 12, fontWeight: '900' },
  widgetCard: { minHeight: 78, marginTop: 10, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: COLORS.surface },
  widgetIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: COLORS.primarySoft },
  widgetCopy: { flex: 1 },
  widgetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  widgetTitle: { color: COLORS.ink, fontSize: 11, fontWeight: '900' },
  widgetBody: { marginTop: 4, color: COLORS.muted, fontSize: 8, lineHeight: 12 },
  editGroupCard: { minHeight: 72, marginBottom: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: COLORS.surface },
  editGroupIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: COLORS.primarySoft },
  editGroupCopy: { flex: 1 },
  editGroupTitle: { color: COLORS.ink, fontSize: 10, fontWeight: '900' },
  editGroupBody: { marginTop: 3, color: COLORS.muted, fontSize: 8 },
  androidBadge: { paddingVertical: 3, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, backgroundColor: COLORS.greenSoft },
  androidBadgeText: { color: COLORS.green, fontSize: 6, fontWeight: '900', letterSpacing: 0.4 },
  citConnectionCard: { marginTop: 10, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: COLORS.elevated },
  citConnectionIcon: { width: 47, height: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: COLORS.primarySoft },
  citConnectionCopy: { flex: 1 },
  citConnectionEyebrow: { color: COLORS.primary, fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  citConnectionTitle: { marginTop: 3, color: COLORS.ink, fontSize: 11, fontWeight: '900' },
  citConnectionBody: { marginTop: 4, color: COLORS.muted, fontSize: 8, lineHeight: 12 },
  citConnectionStatus: { marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 4 },
  citConnectionStatusText: { flex: 1, color: COLORS.green, fontSize: 7, fontWeight: '800' },
  citConnectionButton: { minHeight: 38, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: COLORS.primary },
  citConnectionButtonText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  sectionHeader: { marginTop: 25, marginBottom: 11, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  sectionTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '900', letterSpacing: -0.35 },
  sectionSubtitle: { marginTop: 3, color: COLORS.faint, fontSize: 9 },
  memberCountBadge: { minWidth: 28, height: 28, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: COLORS.primarySoft },
  memberCountText: { color: COLORS.primary, fontSize: 9, fontWeight: '900' },
  memberList: { overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line, borderRadius: 22, backgroundColor: COLORS.surface },
  memberRow: { minHeight: 77, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberAvatar: { width: 45, height: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  memberAvatarImage: { width: '100%', height: '100%', borderRadius: 15 },
  memberInitial: { fontSize: 16, fontWeight: '900' },
  memberColorDot: { position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderWidth: 2, borderColor: COLORS.surface, borderRadius: 6 },
  memberCopy: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  memberName: { flexShrink: 1, color: COLORS.ink, fontSize: 11, fontWeight: '900' },
  youLabel: { paddingVertical: 2, paddingHorizontal: 4, color: COLORS.primary, fontSize: 6, fontWeight: '900', borderRadius: 5, backgroundColor: COLORS.primarySoft },
  memberUsername: { marginTop: 3, color: COLORS.faint, fontSize: 8 },
  memberRole: { paddingVertical: 5, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 9 },
  memberRoleText: { fontSize: 7, fontWeight: '900' },
  memberMenu: { width: 25, height: 36, alignItems: 'center', justifyContent: 'center' },
  separator: { height: 1, marginLeft: 68, backgroundColor: COLORS.line },
  eventList: { gap: 8 },
  eventCard: { minHeight: 73, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: COLORS.line, borderRadius: 19, backgroundColor: COLORS.surface },
  eventDate: { width: 46, height: 49, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  eventDateMonth: { fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  eventDateNumber: { marginTop: 1, fontSize: 17, fontWeight: '900' },
  eventCopy: { flex: 1 },
  eventTitle: { color: COLORS.ink, fontSize: 11, fontWeight: '900' },
  eventTime: { marginTop: 4, color: COLORS.muted, fontSize: 8 },
  emptyEvents: { minHeight: 84, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: COLORS.surface },
  emptyEventsText: { color: COLORS.muted, fontSize: 9 },
  permissionsCard: { overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line, borderRadius: 21, backgroundColor: COLORS.surface },
  permissionRow: { minHeight: 68, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  permissionIcon: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  permissionCopy: { flex: 1 },
  permissionTitle: { color: COLORS.ink, fontSize: 10, fontWeight: '900' },
  permissionDescription: { marginTop: 3, color: COLORS.muted, fontSize: 8 },
  permissionSeparator: { height: 1, marginLeft: 64, backgroundColor: COLORS.line },
  dangerButton: { minHeight: 50, marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: COLORS.redSoft, borderRadius: 16, backgroundColor: COLORS.redSoft },
  dangerButtonText: { color: COLORS.red, fontSize: 10, fontWeight: '900' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,20,35,0.46)' },
  modalCard: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 9, paddingBottom: 25, borderTopLeftRadius: 29, borderTopRightRadius: 29, backgroundColor: COLORS.surface },
  modalHandle: { width: 38, height: 4, alignSelf: 'center', marginBottom: 16, borderRadius: 2, backgroundColor: COLORS.line },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  inviteIcon: { width: 47, height: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: COLORS.primarySoft },
  modalHeaderCopy: { flex: 1 },
  modalTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '900' },
  modalSubtitle: { marginTop: 3, color: COLORS.muted, fontSize: 9 },
  modalClose: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: COLORS.elevatedStrong },
  codeCard: { marginTop: 20, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 23, backgroundColor: COLORS.elevated },
  codeLabel: { color: COLORS.faint, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  codeValue: { marginTop: 11, color: COLORS.navy, fontSize: 29, fontWeight: '900', letterSpacing: 5 },
  codeMetaRow: { marginTop: 13, flexDirection: 'row', gap: 15 },
  codeMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  codeMetaText: { color: COLORS.muted, fontSize: 8, fontWeight: '700' },
  codeActions: { width: '100%', marginTop: 18, flexDirection: 'row', gap: 8 },
  copyButton: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, backgroundColor: COLORS.surface },
  copyButtonText: { color: COLORS.primary, fontSize: 9, fontWeight: '900' },
  shareButton: { flex: 1.3, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, backgroundColor: COLORS.primary },
  shareButtonText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  revokeButton: { marginTop: 14, paddingVertical: 5 },
  revokeButtonText: { color: COLORS.red, fontSize: 8, fontWeight: '800' },
  noCodeCard: { marginTop: 20, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 23, backgroundColor: COLORS.input },
  noCodeIcon: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: COLORS.primarySoft },
  noCodeTitle: { marginTop: 15, color: COLORS.ink, fontSize: 14, fontWeight: '900' },
  noCodeBody: { maxWidth: 320, marginTop: 6, color: COLORS.muted, fontSize: 9, lineHeight: 14, textAlign: 'center' },
  generateButton: { minHeight: 47, marginTop: 17, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 15, backgroundColor: COLORS.primary },
  generateButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  inviteSecurity: { marginTop: 14, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 13, backgroundColor: COLORS.greenSoft },
  inviteSecurityText: { flex: 1, color: '#34765B', fontSize: 8, lineHeight: 13 },
});
