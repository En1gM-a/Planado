import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export type AppRelease = {
  platform: 'android' | 'ios';
  latest_build_number: number;
  minimum_supported_build_number: number;
  version_name: string;
  title: string;
  message: string;
  download_url: string;
  is_active: boolean;
};

export type AvailableNativeUpdate = {
  currentBuildNumber: number;
  currentVersionName: string;
  required: boolean;
  release: AppRelease;
};

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
  const currentBuildNumber = currentNativeBuildNumber();

  // The browser and Expo Go do not have a Planado native build to replace.
  if (!platform || currentBuildNumber === null) return null;

  const { data, error } = await supabase
    .from('app_releases')
    .select(
      'platform, latest_build_number, minimum_supported_build_number, version_name, title, message, download_url, is_active',
    )
    .eq('platform', platform)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  if (!data || currentBuildNumber >= data.latest_build_number) return null;

  return {
    currentBuildNumber,
    currentVersionName: Constants.expoConfig?.version ?? `Build ${currentBuildNumber}`,
    required: currentBuildNumber < data.minimum_supported_build_number,
    release: data as AppRelease,
  };
}
