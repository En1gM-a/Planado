import { useState } from 'react';
import { Alert, Button, Text, View } from 'react-native';

import { signInWithGoogle } from '../../services/authService';

// This is a simple login screen that demonstrates how to use the signInWithGoogle function (ilisdi ni)
export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    try {
      setLoading(true);

      const session = await signInWithGoogle();

      if (session) {
        Alert.alert('Success', 'Google authentication succeeded.');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Google login failed.';

      Alert.alert('Login failed', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}
    >
      <Text>Planado authentication test</Text>

      <Button
        title={loading ? 'Signing in...' : 'Continue with Google'}
        disabled={loading}
        onPress={handleGoogleLogin}
      />
    </View>
  );
}