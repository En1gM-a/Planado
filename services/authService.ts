import type { User } from '@supabase/supabase-js';

import { supabase } from './supabase';

export interface SignUpInput {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

export interface ProfileUpdate {
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
  bio?: string | null;
  timezone?: string;
}

export async function signUp({
  email,
  password,
  username,
  displayName,
}: SignUpInput) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        username: username.trim().toLowerCase(),
        display_name: displayName.trim(),
      },
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    throw error;
  }

  return data;
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

export async function sendPasswordReset(email: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    {
      redirectTo: 'planado://reset-password',
    },
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function updatePassword(password: string) {
  const { data, error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    throw error;
  }

  return data;
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
    throw new Error('You must be logged in to update your profile.');
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