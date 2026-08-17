import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '../theme/colors';

type PlanadoLoaderProps = {
  message?: string;
  compact?: boolean;
  fullScreen?: boolean;
};

export function PlanadoLoader({
  message = 'Loading your plans...',
  compact = false,
  fullScreen = false,
}: PlanadoLoaderProps) {
  return (
    <View
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
      style={[styles.container, fullScreen && styles.fullScreen, compact && styles.compact]}
    >
      <View style={[styles.logoSurface, compact && styles.logoSurfaceCompact]}>
        <Image
          accessibilityIgnoresInvertColors
          source={require('../assets/images/planado-logo.png')}
          style={[styles.logo, compact && styles.logoCompact]}
        />
      </View>
      {!compact ? <Text style={styles.brand}>Planado</Text> : null}
      <ActivityIndicator color={COLORS.primary} size={compact ? 'small' : 'large'} />
      <Text style={[styles.message, compact && styles.messageCompact]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 230,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    backgroundColor: 'transparent',
  },
  fullScreen: {
    flex: 1,
    minHeight: undefined,
    backgroundColor: COLORS.background,
  },
  compact: {
    minHeight: 126,
    padding: 14,
  },
  logoSurface: {
    width: 78,
    height: 78,
    marginBottom: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    shadowColor: '#34358A',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
  },
  logoSurfaceCompact: {
    width: 50,
    height: 50,
    marginBottom: 7,
    borderRadius: 16,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  logo: { width: 64, height: 64, resizeMode: 'contain' },
  logoCompact: { width: 40, height: 40 },
  brand: {
    marginBottom: 10,
    color: COLORS.ink,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.75,
  },
  message: { marginTop: 9, color: COLORS.muted, fontSize: 11, textAlign: 'center' },
  messageCompact: { marginTop: 7, fontSize: 9 },
});
