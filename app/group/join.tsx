import { Redirect } from 'expo-router';

export default function JoinGroupRoute() {
  return <Redirect href={{ pathname: '/(tabs)/groups', params: { open: 'join' } }} />;
}
