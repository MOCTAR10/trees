import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { pingGateway } from "../api/client";

export type ServerStatus = "checking" | "online" | "offline";

const INTERVAL_MS = 30000;

/**
 * Whether the server can be reached — the condition for syncing scans, not
 * merely "the phone has a network". Re-checked periodically and whenever the
 * app returns to the foreground; `onOnline` fires on each offline → online
 * transition (e.g. to flush the offline queue).
 */
export function useServerStatus(active: boolean, onOnline?: () => void): {
  status: ServerStatus;
  recheck: () => Promise<void>;
} {
  const [status, setStatus] = useState<ServerStatus>("checking");
  const previous = useRef<ServerStatus>("checking");
  const onOnlineRef = useRef(onOnline);
  onOnlineRef.current = onOnline;

  const recheck = useCallback(async () => {
    const ok = await pingGateway();
    const next: ServerStatus = ok ? "online" : "offline";
    if (next === "online" && previous.current === "offline") onOnlineRef.current?.();
    previous.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    void recheck();
    const timer = setInterval(() => void recheck(), INTERVAL_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void recheck();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [active, recheck]);

  return { status, recheck };
}
