import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'chifufu:authToken';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: string | null;
}

export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function storeToken(token: string): Promise<void> {
  return AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  return AsyncStorage.removeItem(TOKEN_KEY);
}

export async function apiRegister(email: string, password: string, name?: string): Promise<{ error?: string; message?: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  return res.json();
}

export async function apiLogin(email: string, password: string): Promise<{ token?: string; user?: AuthUser; error?: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function apiGetMe(token: string): Promise<{ user?: AuthUser; error?: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
