import type { DesktopEnvironmentBootstrap } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { readDesktopSecondaryBootstraps } from "./desktopLocal";

const DESKTOP_LOCAL_BOOTSTRAP_POLL_MS = 2_000;

/**
 * Reactively track the desktop's secondary local backends (e.g. a parallel WSL
 * backend). The bridge exposes no change event, so we re-read on an interval;
 * failed reads retain the latest successful snapshot, while a successful empty
 * read clears it. Use this instead of polling the bridge ad hoc so every
 * renderer consumer reads the same topology.
 */
export function useDesktopLocalBootstraps(): ReadonlyArray<DesktopEnvironmentBootstrap> {
  const [bootstraps, setBootstraps] = useState<ReadonlyArray<DesktopEnvironmentBootstrap>>(
    readDesktopSecondaryBootstraps,
  );

  useEffect(() => {
    const read = () => setBootstraps(readDesktopSecondaryBootstraps());
    let interval: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      if (interval !== undefined) clearInterval(interval);
      interval = undefined;
      if (document.visibilityState === "visible") {
        read();
        interval = setInterval(read, DESKTOP_LOCAL_BOOTSTRAP_POLL_MS);
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      if (interval !== undefined) clearInterval(interval);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return bootstraps;
}
