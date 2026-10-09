import AsyncStorage from "@react-native-async-storage/async-storage";

import { AuthUser, setAuthToken } from "../api/client";

export interface Session {
  token: string;
  user: AuthUser;
}

const KEY = "forestry:session";

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.token || !parsed?.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/** Sync the API client's in-memory bearer token with the persisted session. */
export function applySession(session: Session | null): void {
  setAuthToken(session?.token ?? null);
}
