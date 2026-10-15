import * as Updates from "expo-updates";
import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

const CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * Over-the-air updates, applied when the user chooses (Slice 29).
 *
 * Checks at launch, every 30 min and when the app returns to the foreground; a new
 * version is downloaded silently and `ready` turns true. Nothing restarts until the
 * user taps « Installer » (`install`); otherwise the update applies at the next normal
 * launch. Off on the web (the site is updated by deployment) and in Expo Go / dev.
 */
export function useAppUpdate(intervalMs: number = CHECK_EVERY_MS): { ready: boolean; install: () => Promise<void> } {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web" || !Updates.isEnabled) return undefined;
    let cancelled = false;
    let busy = false;
    const check = async () => {
      if (busy || cancelled) return;
      busy = true;
      try {
        const found = await Updates.checkForUpdateAsync();
        if (found.isAvailable) {
          const fetched = await Updates.fetchUpdateAsync();
          if (fetched.isNew && !cancelled) setReady(true);
        }
      } catch {
        // offline or server unreachable: try again later
      } finally {
        busy = false;
      }
    };
    void check();
    const timer = setInterval(() => void check(), intervalMs);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [intervalMs]);

  const install = useCallback(async () => {
    await Updates.reloadAsync();
  }, []);

  return { ready, install };
}
