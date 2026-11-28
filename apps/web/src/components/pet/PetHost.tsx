import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { useNowAfter } from "../../hooks/useDeadline";
import { useClientSettings } from "../../hooks/useSettings";
import { useThreadShell } from "../../state/entities";
import { resolveThreadRouteTarget } from "../../threadRoutes";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";
import { PetOverlay } from "./PetOverlay";
import {
  derivePetBaseMood,
  nextHappyPulseUntilMs,
  resolvePetMood,
  type PetBaseMood,
  type PetMood,
} from "./petMood";

function useActivePetThreadRef() {
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const activeDraftSession = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft" ? store.getDraftSession(routeTarget.draftId) : null,
  );

  if (routeTarget?.kind === "server") {
    return routeTarget.threadRef;
  }
  if (routeTarget?.kind === "draft" && activeDraftSession) {
    return scopeThreadRef(activeDraftSession.environmentId, activeDraftSession.threadId);
  }
  return null;
}

function usePetMood(): PetMood {
  const threadRef = useActivePetThreadRef();
  const shell = useThreadShell(threadRef);
  const status = shell ? resolveSidebarThreadStatus(shell) : null;
  const base = derivePetBaseMood(status);

  const [pulse, setPulse] = useState<{ base: PetBaseMood; untilMs: number | null }>({
    base,
    untilMs: null,
  });
  if (pulse.base !== base) {
    // The clock is read inside the updater, as in useNowAfter.
    setPulse((current) => ({
      base,
      untilMs:
        nextHappyPulseUntilMs({ previousBase: current.base, nextBase: base, nowMs: Date.now() }) ??
        current.untilMs,
    }));
  }
  const nowMs = useNowAfter(pulse.untilMs);

  return resolvePetMood({ base, pulseUntilMs: pulse.untilMs, nowMs });
}

function PetHostActive() {
  const mood = usePetMood();
  return <PetOverlay mood={mood} />;
}

/** Mounts the floating companion when Appearance → Companion pet is enabled. */
export function PetHost() {
  const enabled = useClientSettings((settings) => settings.petEnabled);
  if (!enabled) return null;
  return <PetHostActive />;
}
