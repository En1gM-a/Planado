import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

import { supabase } from './supabase';

export type AppRelease = {
  platform: 'android' | 'ios';
  latest_build_number: number;
  minimum_supported_build_number: number;
  version_name: string;
  title: string;
  message: string;
  download_url: string;
  required_capability: string | null;
  is_active: boolean;
};

export type AvailableNativeUpdate = {
  /** Null when the installed build does not report its number (see below). */
  currentBuildNumber: number | null;
  currentVersionName: string;
  nativeCapabilityMissing: boolean;
  required: boolean;
  release: AppRelease;
};

type PlanadoWidgetCapabilities = {
  saveGroupWidgetDataV2?: (...args: unknown[]) => Promise<boolean>;
  saveGroupWidgetDataV3?: (...args: unknown[]) => Promise<boolean>;
};

function supportsRequiredCapability(capability: string | null) {
  if (!capability) return true;

  if (capability === 'important_widget_v2') {
    const widget = NativeModules.PlanadoWidget as PlanadoWidgetCapabilities | undefined;
    return typeof widget?.saveGroupWidgetDataV2 === 'function';
  }

  // The redesigned home-screen widget (structured rows, accent color, quick add).
  if (capability === 'planado_widget_v3') {
    const widget = NativeModules.PlanadoWidget as PlanadoWidgetCapabilities | undefined;
    return typeof widget?.saveGroupWidgetDataV3 === 'function';
  }

  // Unknown capabilities should fail closed so an outdated native app is not
  // incorrectly treated as current.
  return false;
}

function supportedPlatform(): AppRelease['platform'] | null {
  if (Platform.OS === 'android' || Platform.OS === 'ios') return Platform.OS;
  return null;
}

function currentNativeBuildNumber() {
  if (Platform.OS === 'android') {
    const versionCode = Constants.platform?.android?.versionCode;
    const parsed = Number(versionCode);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  if (Platform.OS === 'ios') {
    const buildNumber = Constants.platform?.ios?.buildNumber;
    const parsed = Number(buildNumber);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

export async function getAvailableNativeUpdate(): Promise<AvailableNativeUpdate | null> {
  const platform = supportedPlatform();
  // expo-constants reports no versionCode on Android, so the build number is
  // often unknown. The release's required capability still tells an outdated
  // build apart, so the check carries on without it.
  const currentBuildNumber = currentNativeBuildNumber();

  // The browser and Expo Go do not have a Planado native build to replace.
  if (!platform || !NativeModules.PlanadoWidget) return null;

  const { data, error } = await supabase
    .from('app_releases')
    .select(
      'platform, latest_build_number, minimum_supported_build_number, version_name, title, message, download_url, required_capability, is_active',
    )
    .eq('platform', platform)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const nativeCapabilityMissing = !supportsRequiredCapability(data.required_capability);
  const newerBuildAvailable = currentBuildNumber !== null && currentBuildNumber < data.latest_build_number;
  if (!newerBuildAvailable && !nativeCapabilityMissing) return null;

  return {
    currentBuildNumber,
    currentVersionName: Constants.expoConfig?.version ?? 'Current build',
    nativeCapabilityMissing,
    required:
      nativeCapabilityMissing
      || (currentBuildNumber !== null && currentBuildNumber < data.minimum_supported_build_number),
    release: data as AppRelease,
  };
}
