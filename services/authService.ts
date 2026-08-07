import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export interface ProfileUpdate {
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
  bio?: string | null;
  timezone?: string;
  onboarding_completed?: boolean;
}

const googleRedirectUri = makeRedirectUri({
  scheme: 'planado',
  path: 'auth/callback',
});

async function createSessionFromUrl(url: string): Promise<Session> {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    const description =
      typeof params.error_description === 'string'
        ? params.error_description
        : errorCode;

    throw new Error(description);
  }

  // Support PKCE redirects if Supabase returns an authorization code.
  if (typeof params.code === 'string') {
    const { data, error } = await supabase.auth.exchangeCodeForSession(
      params.code,
    );

    if (error) {
      throw error;
    }

    if (!data.session) {
      throw new Error('Google sign-in completed without a valid session.');
    }

    return data.session;
  }

  // Supabase's native OAuth flow normally returns tokens in the URL fragment.
  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;

  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    throw new Error('Google sign-in completed without a valid session.');
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw error;
  }

  if (!data.session) {
    throw new Error('Google sign-in completed without a valid session.');
  }

  return data.session;
}

export async function signInWithGoogle(): Promise<Session | null> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: googleRedirectUri,
      skipBrowserRedirect: true,
      scopes: 'openid email profile',
    },
  });

  if (error) {
    throw error;
  }

  if (!data.url) {
    throw new Error('Supabase did not return a Google authorization URL.');
  }

  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    googleRedirectUri,
  );

  if (result.type !== 'success') {
    return null;
  }

  return createSessionFromUrl(result.url);
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return data.user;
}

export async function getMyProfile() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateMyProfile(changes: ProfileUpdate) {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('You must be signed in to update your profile.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(changes)
    .eq('id', user.id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export function getGoogleRedirectUri() {
  return googleRedirectUri;
}
