import { type Href, Redirect, useLocalSearchParams } from 'expo-router';

export default function GroupMembersRoute() {
  const params = useLocalSearchParams<{ groupId?: string | string[] }>();
  const groupId = Array.isArray(params.groupId) ? params.groupId[0] : params.groupId;
  return <Redirect href={(groupId ? `/group/${groupId}` : '/(tabs)/groups') as Href} />;
}
