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

import { PlanadoAlert as Alert, type PlanadoAlertButton } from '../../components/PlanadoAlert';
import { PlanadoLoader } from '../../components/PlanadoLoader';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TopBar } from '../../components/ui/Headers';
import { IconButton } from '../../components/ui/IconButton';
import { PressableScale } from '../../components/ui/PressableScale';
import { Reveal } from '../../components/ui/Reveal';
import { useAuth } from '../../hooks/useAuth';
import { COLORS } from '../../theme/colors';
import { gradientStyle, ON_PRIMARY, PAGE, RADIUS, SHADOW, tint, TYPE } from '../../theme/tokens';
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

const HERO_SHEEN = 'radial-gradient(circle at 92% 0%, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0) 50%), linear-gradient(180deg, rgba(10, 10, 30, 0) 25%, rgba(10, 10, 30, 0.34) 100%)';

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
  return { color: COLORS.muted, background: COLORS.elevatedStrong, icon: 'person' as const };
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
      const result = await makeGroupWidget(groupId, details.group.name, details.group.color);
      Alert.alert(
        'Widget is ready',
        result.pinRequested
          ? 'If you added it, it is on your home screen now. Otherwise long-press your home screen, open Widgets, and choose Planado. This group is already selected.'
          : 'Long-press your home screen, open Widgets, and choose Planado. This group is already selected.',
      );
    } catch (widgetError) {
      Alert.alert('Could not make widget', errorMessage(widgetError, 'Please try again.'));
    } finally {
      setWidgetLoading(false);
    }
  }

  function openGroupMenu() {
    const options: PlanadoAlertButton[] = [];
    if (canManageInvites) {
      options.push({
        text: 'Edit group',
        icon: 'create-outline',
        description: 'Name, description, and timezone',
        onPress: () => router.push({ pathname: '/group/settings', params: { groupId } } as Href),
      });
      options.push({
        text: 'Invite members',
        icon: 'person-add-outline',
        description: 'Share a secure invite code',
        onPress: () => setInviteOpen(true),
      });
    }
    options.push({
      text: 'View calendar',
      icon: 'calendar-outline',
      description: 'See upcoming plans',
      onPress: () => router.push('/(tabs)/calendar' as Href),
    });
    if (myRole === 'owner') {
      options.push({
        text: 'Delete group',
        icon: 'trash-outline',
        description: 'Removes it for every member',
        style: 'destructive',
        onPress: confirmDelete,
      });
    } else {
      options.push({
        text: 'Leave group',
        icon: 'exit-outline',
        description: 'You can rejoin with an invite code',
        style: 'destructive',
        onPress: confirmLeave,
      });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(details?.group.name ?? 'Group options', 'Choose an action', options);
  }

  function canManageMember(member: GroupMember) {
    if (!user || member.user_id === user.id || member.role === 'owner') return false;
    if (myRole === 'owner') return true;
    return myRole === 'admin' && member.role === 'member';
  }

  function manageMember(member: GroupMember) {
    const options: PlanadoAlertButton[] = [];

    if (myRole === 'owner') {
      const demote = member.role === 'admin';
      options.push({
        text: demote ? 'Change to member' : 'Make admin',
        icon: demote ? 'person-outline' : 'shield-checkmark-outline',
        description: demote ? 'Remove admin permissions' : 'Can invite and remove members',
        onPress: () => confirmRoleChange(member, demote ? 'member' : 'admin'),
      });
    }
    options.push({
      text: 'Remove from group',
      icon: 'person-remove-outline',
      description: 'They can rejoin with an invite code',
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
        <Reveal style={styles.failurePage}>
          <View style={styles.failureIcon}>
            <Ionicons color={COLORS.red} name="people-outline" size={34} />
          </View>
          <Text accessibilityRole="header" style={styles.failureTitle}>Group unavailable</Text>
          <Text style={styles.failureText}>{error ?? 'You may no longer have access to this group.'}</Text>
          <Button
            icon="arrow-back"
            label="Back to groups"
            onPress={() => router.replace('/(tabs)/groups')}
            size="md"
            style={styles.failureButton}
          />
        </Reveal>
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
          <TopBar
            onBack={() => router.back()}
            right={(
              <IconButton
                disabled={actionLoading}
                label="Group options"
                onPress={openGroupMenu}
              >
                {actionLoading
                  ? <ActivityIndicator color={COLORS.primary} size="small" />
                  : <Ionicons color={COLORS.ink} name="ellipsis-horizontal" size={20} />}
              </IconButton>
            )}
            title={group.name}
          />

          <Reveal style={[styles.hero, gradientStyle(HERO_SHEEN, group.color)]}>
            <View style={styles.groupAvatar}>
              {group.image_url ? (
                <Image source={{ uri: group.image_url }} style={styles.groupImage} />
              ) : (
                <Text style={[styles.groupInitial, { color: group.color }]}>{group.name.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <Text accessibilityRole="header" style={styles.heroName}>{group.name}</Text>
            <Text numberOfLines={2} style={styles.heroDescription}>{group.description || 'A shared space for plans and time together.'}</Text>
            <View style={styles.heroMeta}>
              <View style={styles.heroMetaItem}>
                <Ionicons color="#FFFFFF" name="people-outline" size={15} />
                <Text numberOfLines={1} style={styles.heroMetaText}>{members.length} member{members.length === 1 ? '' : 's'}</Text>
              </View>
              <View style={styles.heroMetaDivider} />
              <View style={styles.heroMetaItem}>
                <Ionicons color="#FFFFFF" name="globe-outline" size={15} />
                <Text numberOfLines={1} style={styles.heroMetaText}>{group.timezone}</Text>
              </View>
            </View>
          </Reveal>

          <Reveal index={1} style={styles.actionRow}>
            {canManageInvites ? (
              <PressableScale
                accessibilityHint="Opens invite codes for this group"
                onPress={() => setInviteOpen(true)}
                scaleTo={0.97}
                style={styles.primaryAction}
              >
                <View style={styles.primaryActionIcon}>
                  <Ionicons color={ON_PRIMARY} name="person-add-outline" size={20} />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.primaryActionTitle}>Invite friends</Text>
                  <Text style={styles.primaryActionSubtitle}>Share a secure code</Text>
                </View>
              </PressableScale>
            ) : (
              <View style={styles.memberActionInfo}>
                <Ionicons color={COLORS.primary} name="people-circle-outline" size={26} />
                <View style={styles.actionCopy}>
                  <Text style={styles.memberActionTitle}>You’re a member</Text>
                  <Text style={styles.memberActionSubtitle}>Admins manage invites</Text>
                </View>
              </View>
            )}
            <View style={styles.roleCard}>
              <Text style={styles.roleCardLabel}>Your role</Text>
              <Text style={styles.roleCardValue}>{roleLabel(group.role)}</Text>
            </View>
          </Reveal>

          <Reveal index={2}>
            <PressableScale
              accessibilityHint="Adds a home-screen widget for this group"
              accessibilityState={{ busy: widgetLoading }}
              disabled={widgetLoading}
              onPress={() => void createWidget()}
              scaleTo={0.98}
              style={styles.widgetCard}
            >
              <View style={styles.widgetIcon}>
                {widgetLoading ? <ActivityIndicator color={COLORS.primary} size="small" /> : <Ionicons color={COLORS.primary} name="apps-outline" size={23} />}
              </View>
              <View style={styles.widgetCopy}>
                <View style={styles.widgetTitleRow}>
                  <Text numberOfLines={1} style={styles.widgetTitle}>Make widget</Text>
                  <View style={styles.androidBadge}>
                    <Ionicons color={COLORS.green} name="logo-android" size={13} />
                    <Text style={styles.androidBadgeText}>Android</Text>
                  </View>
                </View>
                <Text style={styles.widgetBody}>Today, tomorrow, and important countdowns on your home screen.</Text>
              </View>
              <Ionicons color={COLORS.faint} name="chevron-forward" size={18} />
            </PressableScale>
          </Reveal>

          {group.group_type === 'cit_u_classmates' ? (
            <Reveal index={3} style={styles.citConnectionCard}>
              <View style={styles.citConnectionIcon}>
                <Ionicons color={COLORS.primary} name="school-outline" size={24} />
              </View>
              <View style={styles.citConnectionCopy}>
                <Text style={styles.citConnectionEyebrow}>CIT-U schedule</Text>
                <Text style={styles.citConnectionTitle}>Import from Wildcat One</Text>
                <Text style={styles.citConnectionBody}>Sign in privately, review your classes, then add them to your calendar.</Text>
                <View style={styles.citConnectionStatus}>
                  <Ionicons color={COLORS.green} name="shield-checkmark-outline" size={15} />
                  <Text style={styles.citConnectionStatusText}>Private · owner approved</Text>
                </View>
              </View>
              <Button
                label="Connect"
                onPress={() => router.push({ pathname: '/cit-u/connect', params: { groupId } } as Href)}
                size="sm"
              />
            </Reveal>
          ) : null}

          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Members</Text>
              <Text style={styles.sectionSubtitle}>Creator, admins, and everyone in the group</Text>
            </View>
            <View style={styles.memberCountBadge}>
              <Text style={styles.memberCountText}>{members.length}</Text>
            </View>
          </View>

          <Reveal style={styles.memberList}>
            {members.map((member, index) => {
              const appearance = roleAppearance(member.role);
              const isMe = member.user_id === user?.id;
              const manageable = canManageMember(member);
              return (
                <View key={member.id}>
                  <View style={styles.memberRow}>
                    <View style={[styles.memberAvatar, { backgroundColor: tint(member.color, 0.16), borderColor: member.color }]}>
                      {member.avatar_url ? (
                        <Image source={{ uri: member.avatar_url }} style={styles.memberAvatarImage} />
                      ) : (
                        <Text style={[styles.memberInitial, { color: member.color }]}>{member.display_name.charAt(0).toUpperCase()}</Text>
                      )}
                    </View>
                    <View style={styles.memberCopy}>
                      <View style={styles.memberNameRow}>
                        <Text numberOfLines={1} style={styles.memberName}>{member.display_name}</Text>
                        {isMe ? (
                          <View style={styles.youLabel}>
                            <Text style={styles.youLabelText}>You</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text numberOfLines={1} style={styles.memberUsername}>@{member.username}</Text>
                    </View>
                    <View style={[styles.memberRole, { backgroundColor: appearance.background }]}>
                      <Ionicons color={appearance.color} name={appearance.icon} size={12} />
                      <Text style={[styles.memberRoleText, { color: appearance.color }]}>{roleLabel(member.role)}</Text>
                    </View>
                    {manageable ? (
                      <IconButton
                        icon="ellipsis-vertical"
                        label={`Manage ${member.display_name}`}
                        onPress={() => manageMember(member)}
                        size={19}
                        tone="ghost"
                      />
                    ) : (
                      <View style={styles.memberMenuSpacer} />
                    )}
                  </View>
                  {index < members.length - 1 ? <View style={styles.separator} /> : null}
                </View>
              );
            })}
          </Reveal>

          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Coming up</Text>
              <Text style={styles.sectionSubtitle}>The next plans for this group</Text>
            </View>
          </View>

          {details.upcoming_events.length ? (
            <View style={styles.eventList}>
              {details.upcoming_events.map((event, index) => {
                const eventColor = event.color ?? group.color;
                return (
                  <Reveal index={index} key={event.id}>
                    <PressableScale
                      accessibilityLabel={`${event.title}, ${new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(event.start_time))}`}
                      onPress={() => router.push(`/event/${event.id}` as Href)}
                      scaleTo={0.98}
                      style={styles.eventCard}
                    >
                      <View style={[styles.eventDate, { backgroundColor: tint(eventColor, 0.14) }]}>
                        <Text style={[styles.eventDateMonth, { color: eventColor }]}>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(event.start_time)).toUpperCase()}</Text>
                        <Text style={[styles.eventDateNumber, { color: eventColor }]}>{new Date(event.start_time).getDate()}</Text>
                      </View>
                      <View style={styles.eventCopy}>
                        <Text numberOfLines={1} style={styles.eventTitle}>{event.title}</Text>
                        <Text style={styles.eventTime}>{new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(event.start_time))}</Text>
                      </View>
                      <Ionicons color={COLORS.faint} name="chevron-forward" size={18} />
                    </PressableScale>
                  </Reveal>
                );
              })}
            </View>
          ) : (
            <EmptyState
              body="Plans created for this group will show up here."
              compact
              icon="calendar-clear-outline"
              title="No upcoming events"
            />
          )}

          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Group controls</Text>
              <Text style={styles.sectionSubtitle}>Actions based on your role</Text>
            </View>
          </View>

          {canManageInvites ? (
            <PressableScale
              onPress={() => router.push({ pathname: '/group/settings', params: { groupId } } as Href)}
              scaleTo={0.98}
              style={styles.editGroupCard}
            >
              <View style={styles.editGroupIcon}>
                <Ionicons color={COLORS.primary} name="create-outline" size={20} />
              </View>
              <View style={styles.editGroupCopy}>
                <Text style={styles.editGroupTitle}>Edit group details</Text>
                <Text style={styles.editGroupBody}>Change the name, description, and timezone.</Text>
              </View>
              <Ionicons color={COLORS.faint} name="chevron-forward" size={18} />
            </PressableScale>
          ) : null}

          <View style={styles.permissionsCard}>
            <PermissionRow icon="star-outline" title="Creator" description="Edit or delete group, manage admins, remove members" color={COLORS.primary} background={COLORS.primarySoft} />
            <View style={styles.permissionSeparator} />
            <PermissionRow icon="shield-checkmark-outline" title="Admin" description="Edit group, create invites, and remove regular members" color={COLORS.orange} background={COLORS.orangeSoft} />
            <View style={styles.permissionSeparator} />
            <PermissionRow icon="person-outline" title="Member" description="View plans, participate, and leave voluntarily" color={COLORS.green} background={COLORS.greenSoft} />
          </View>

          {group.role === 'owner' ? (
            <Button
              disabled={actionLoading}
              icon="trash-outline"
              label="Delete group permanently"
              onPress={confirmDelete}
              style={styles.dangerButton}
              variant="danger"
            />
          ) : (
            <Button
              disabled={actionLoading}
              icon="exit-outline"
              label="Leave group"
              onPress={confirmLeave}
              style={styles.dangerButton}
              variant="danger"
            />
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
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={open}>
      <View style={styles.modalBackdrop}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.inviteIcon}>
              <Ionicons color={COLORS.primary} name="person-add-outline" size={24} />
            </View>
            <View style={styles.modalHeaderCopy}>
              <Text accessibilityRole="header" style={styles.modalTitle}>Invite friends</Text>
              <Text style={styles.modalSubtitle}>Share a secure code for {groupName}.</Text>
            </View>
            <IconButton icon="close" label="Close" onPress={onClose} tone="ghost" />
          </View>

          {activeInvite ? (
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>Active invite code</Text>
              <Text accessibilityLabel={`Invite code ${activeInvite.code.split('').join(' ')}`} selectable style={styles.codeValue}>{activeInvite.code}</Text>
              <View style={styles.codeMetaRow}>
                <View style={styles.codeMeta}>
                  <Ionicons color={COLORS.muted} name="people-outline" size={15} />
                  <Text numberOfLines={1} style={styles.codeMetaText}>{activeInvite.use_count}/{activeInvite.max_uses ?? '∞'} uses</Text>
                </View>
                <View style={styles.codeMeta}>
                  <Ionicons color={COLORS.muted} name="time-outline" size={15} />
                  <Text numberOfLines={1} style={styles.codeMetaText}>{activeInvite.expires_at ? `Expires ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(activeInvite.expires_at))}` : 'No expiry'}</Text>
                </View>
              </View>
              <View style={styles.codeActions}>
                <Button
                  icon={copiedCode === activeInvite.code ? 'checkmark' : 'copy-outline'}
                  label={copiedCode === activeInvite.code ? 'Copied' : 'Copy code'}
                  onPress={() => void copyCode(activeInvite.code)}
                  size="md"
                  style={styles.copyButton}
                  variant="secondary"
                />
                <Button
                  icon="share-social-outline"
                  label="Share invite"
                  onPress={() => void shareCode(activeInvite)}
                  size="md"
                  style={styles.shareButton}
                />
              </View>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => revoke(activeInvite)} style={styles.revokeButton}>
                <Text style={styles.revokeButtonText}>Deactivate this code</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.noCodeCard}>
              <View style={styles.noCodeIcon}>
                <Ionicons color={COLORS.primary} name="key-outline" size={30} />
              </View>
              <Text style={styles.noCodeTitle}>Generate an invite code</Text>
              <Text style={styles.noCodeBody}>The code works for up to 25 joins and expires automatically after 7 days.</Text>
              <Button
                icon="sparkles-outline"
                label={generating ? 'Generating…' : 'Generate code'}
                loading={generating}
                onPress={() => void generate()}
                size="md"
                style={styles.generateButton}
              />
            </View>
          )}

          <View style={styles.inviteSecurity}>
            <Ionicons color={COLORS.green} name="shield-checkmark-outline" size={18} />
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
  page: { width: '100%', maxWidth: PAGE.maxWidth, alignSelf: 'center', paddingHorizontal: PAGE.gutter },
  failurePage: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  failureIcon: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.xl, backgroundColor: COLORS.redSoft },
  failureTitle: { width: '100%', ...TYPE.title3, marginTop: 18, color: COLORS.ink, textAlign: 'center' },
  failureText: { width: '100%', ...TYPE.body, maxWidth: 340, marginTop: 8, color: COLORS.muted, textAlign: 'center' },
  failureButton: { marginTop: 22 },
  hero: {
    minHeight: 250,
    marginTop: 4,
    padding: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.xxl,
    boxShadow: SHADOW.md,
  },
  groupAvatar: {
    width: 84,
    height: 84,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: RADIUS.xl,
    backgroundColor: '#FFFFFF',
  },
  groupImage: { width: '100%', height: '100%' },
  groupInitial: { fontSize: 34, lineHeight: 40, fontWeight: '800' },
  heroName: { width: '100%', ...TYPE.title1, marginTop: 14, color: '#FFFFFF', textAlign: 'center' },
  heroDescription: { width: '100%', ...TYPE.callout, maxWidth: 430, marginTop: 6, color: 'rgba(255,255,255,0.9)', fontWeight: '400', textAlign: 'center' },
  heroMeta: {
    maxWidth: '100%',
    minHeight: 34,
    marginTop: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(10,10,30,0.22)',
  },
  heroMetaItem: { maxWidth: 160, flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroMetaText: { ...TYPE.footnote, flexShrink: 1, color: '#FFFFFF', fontWeight: '600' },
  heroMetaDivider: { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.4)' },
  actionRow: { marginTop: 14, flexDirection: 'row', gap: 10 },
  primaryAction: {
    flex: 1.7,
    minHeight: 80,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    boxShadow: SHADOW.primary,
  },
  primaryActionIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm, backgroundColor: 'rgba(255,255,255,0.18)' },
  actionCopy: { flex: 1 },
  primaryActionTitle: { ...TYPE.bodyStrong, color: ON_PRIMARY, fontWeight: '700' },
  primaryActionSubtitle: { ...TYPE.footnote, marginTop: 2, color: ON_PRIMARY, opacity: 0.85 },
  memberActionInfo: {
    flex: 1.7,
    minHeight: 80,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  memberActionTitle: { ...TYPE.bodyStrong, color: COLORS.ink, fontWeight: '700' },
  memberActionSubtitle: { ...TYPE.footnote, marginTop: 2, color: COLORS.muted },
  roleCard: {
    flex: 1,
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  roleCardLabel: { width: '100%', ...TYPE.footnote, color: COLORS.muted, fontWeight: '600', textAlign: 'center' },
  roleCardValue: { width: '100%', ...TYPE.headline, marginTop: 2, color: COLORS.primary, fontWeight: '800', textAlign: 'center' },
  widgetCard: {
    minHeight: 84,
    marginTop: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  widgetIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.primarySoft },
  widgetCopy: { flex: 1 },
  widgetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  widgetTitle: { ...TYPE.headline, color: COLORS.ink },
  widgetBody: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  androidBadge: { paddingVertical: 2, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADIUS.pill, backgroundColor: COLORS.greenSoft },
  androidBadgeText: { ...TYPE.footnote, color: COLORS.green, fontWeight: '700' },
  citConnectionCard: {
    marginTop: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.elevated,
  },
  citConnectionIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.primarySoft },
  citConnectionCopy: { flex: 1 },
  citConnectionEyebrow: { ...TYPE.overline, color: COLORS.primary },
  citConnectionTitle: { ...TYPE.headline, marginTop: 2, color: COLORS.ink },
  citConnectionBody: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  citConnectionStatus: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  citConnectionStatusText: { ...TYPE.footnote, flex: 1, color: COLORS.green, fontWeight: '700' },
  sectionHeader: { marginTop: 28, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  sectionCopy: { flex: 1 },
  sectionTitle: { ...TYPE.title3, color: COLORS.ink },
  sectionSubtitle: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  memberCountBadge: { minWidth: 32, height: 32, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.pill, backgroundColor: COLORS.primarySoft },
  memberCountText: { ...TYPE.subhead, color: COLORS.primary, fontWeight: '800' },
  memberList: { overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.xl, backgroundColor: COLORS.surface },
  memberRow: { minHeight: 76, paddingLeft: 14, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberAvatar: { width: 46, height: 46, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderRadius: 23 },
  memberAvatarImage: { width: '100%', height: '100%' },
  memberInitial: { ...TYPE.headline, fontWeight: '800' },
  memberCopy: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName: { ...TYPE.bodyStrong, flexShrink: 1, color: COLORS.ink },
  youLabel: { paddingVertical: 1, paddingHorizontal: 7, borderRadius: RADIUS.pill, backgroundColor: COLORS.primarySoft },
  youLabelText: { ...TYPE.footnote, color: COLORS.primary, fontWeight: '700' },
  memberUsername: { ...TYPE.subhead, marginTop: 1, color: COLORS.muted, fontWeight: '400' },
  memberRole: { minHeight: 28, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADIUS.pill },
  memberRoleText: { ...TYPE.footnote, fontWeight: '700' },
  memberMenuSpacer: { width: 8 },
  separator: { height: 1, marginLeft: 72, backgroundColor: COLORS.line },
  eventList: { gap: 10 },
  eventCard: {
    minHeight: 76,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  eventDate: { width: 52, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md },
  eventDateMonth: { ...TYPE.footnote, fontWeight: '800', letterSpacing: 0.5 },
  eventDateNumber: { fontSize: 20, lineHeight: 24, fontWeight: '800' },
  eventCopy: { flex: 1 },
  eventTitle: { ...TYPE.headline, color: COLORS.ink },
  eventTime: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  editGroupCard: {
    minHeight: 76,
    marginBottom: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  editGroupIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm, backgroundColor: COLORS.primarySoft },
  editGroupCopy: { flex: 1 },
  editGroupTitle: { ...TYPE.headline, color: COLORS.ink },
  editGroupBody: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  permissionsCard: { overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface },
  permissionRow: { minHeight: 72, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  permissionIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm },
  permissionCopy: { flex: 1 },
  permissionTitle: { ...TYPE.bodyStrong, color: COLORS.ink },
  permissionDescription: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  permissionSeparator: { height: 1, marginLeft: 70, backgroundColor: COLORS.line },
  dangerButton: { marginTop: 22 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12, 12, 24, 0.5)' },
  modalCard: {
    width: '100%',
    maxWidth: PAGE.maxWidth,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    backgroundColor: COLORS.surface,
    boxShadow: SHADOW.lg,
  },
  modalHandle: { width: 40, height: 5, alignSelf: 'center', marginBottom: 14, borderRadius: 3, backgroundColor: COLORS.line },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inviteIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.primarySoft },
  modalHeaderCopy: { flex: 1 },
  modalTitle: { ...TYPE.title3, color: COLORS.ink },
  modalSubtitle: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  codeCard: { marginTop: 20, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.xl, backgroundColor: COLORS.elevated },
  codeLabel: { width: '100%', ...TYPE.overline, color: COLORS.muted, textAlign: 'center' },
  codeValue: { marginTop: 10, color: COLORS.ink, fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: 6 },
  codeMetaRow: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16 },
  codeMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  codeMetaText: { ...TYPE.subhead, color: COLORS.muted },
  codeActions: { width: '100%', marginTop: 18, flexDirection: 'row', gap: 10 },
  copyButton: { flex: 1 },
  shareButton: { flex: 1.3 },
  revokeButton: { minHeight: 44, marginTop: 6, justifyContent: 'center' },
  revokeButtonText: { ...TYPE.subhead, color: COLORS.red, fontWeight: '700' },
  noCodeCard: { marginTop: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.xl, backgroundColor: COLORS.input },
  noCodeIcon: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.lg, backgroundColor: COLORS.primarySoft },
  noCodeTitle: { width: '100%', ...TYPE.headline, marginTop: 14, color: COLORS.ink, textAlign: 'center' },
  noCodeBody: { width: '100%', ...TYPE.subhead, maxWidth: 320, marginTop: 4, color: COLORS.muted, fontWeight: '400', textAlign: 'center' },
  generateButton: { marginTop: 18, alignSelf: 'stretch' },
  inviteSecurity: { marginTop: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: RADIUS.md, backgroundColor: COLORS.greenSoft },
  inviteSecurityText: { ...TYPE.subhead, flex: 1, color: COLORS.green, fontWeight: '500' },
});
