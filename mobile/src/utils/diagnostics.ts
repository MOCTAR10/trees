import { sendClientLog } from "../api/client";

const bootStart = Date.now();
const marks: Record<string, number> = {};
const SLOW_BOOT_MS = 8000;
let bootReported = false;
let installed = false;
let sent = 0;

/** Records the time since app start for one boot step (first occurrence only). */
export function markBoot(step: string): void {
  if (marks[step] == null) marks[step] = Date.now() - bootStart;
}

/** Sends the boot timings once if the app took longer than expected to become usable. */
export function finishBoot(step: string): void {
  markBoot(step);
  if (bootReported) return;
  bootReported = true;
  if (marks[step] >= SLOW_BOOT_MS) {
    void sendClientLog({ kind: "slow_boot", message: `Démarrage en ${marks[step]} ms`, timings_ms: { ...marks } });
  }
}

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;

/** Forwards uncaught JavaScript errors to the server log, then lets React Native handle them. */
export function installErrorReporting(): void {
  const utils = (globalThis as { ErrorUtils?: { getGlobalHandler: () => GlobalHandler; setGlobalHandler: (h: GlobalHandler) => void } })
    .ErrorUtils;
  if (installed || !utils || __DEV__) return;
  installed = true;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    if (sent < 5) {
      sent += 1;
      const err = error instanceof Error ? error : new Error(String(error));
      void sendClientLog({
        kind: isFatal ? "fatal_error" : "error",
        message: err.message,
        stack: err.stack,
        timings_ms: { ...marks, at: Date.now() - bootStart },
      });
    }
    previous(error, isFatal);
  });
}
