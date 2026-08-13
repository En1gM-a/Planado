import { Redirect } from 'expo-router';

export default function CreateGroupRoute() {
  return <Redirect href={{ pathname: '/(tabs)/groups', params: { open: 'create' } }} />;
}
