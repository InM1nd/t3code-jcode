import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
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

  return useMemo(() => {
    if (routeTarget?.kind === "server") {
      return routeTarget.threadRef;
    }
    if (routeTarget?.kind === "draft" && activeDraftSession) {
      return {
        environmentId: activeDraftSession.environmentId,
        threadId: activeDraftSession.threadId,
      };
    }
    return null;
  }, [activeDraftSession, routeTarget]);
}

function usePetMood(): PetMood {
  const threadRef = useActivePetThreadRef();
  const shell = useThreadShell(threadRef);
  const status = shell ? resolveSidebarThreadStatus(shell) : null;
  const base = derivePetBaseMood(status);

  const previousBaseRef = useRef<PetBaseMood>(base);
  const [pulseUntilMs, setPulseUntilMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const previous = previousBaseRef.current;
    previousBaseRef.current = base;
    const pulse = nextHappyPulseUntilMs({
      previousBase: previous,
      nextBase: base,
      nowMs: Date.now(),
    });
    if (pulse !== null) {
      setPulseUntilMs(pulse);
      setNowMs(Date.now());
    }
  }, [base]);

  useEffect(() => {
    if (pulseUntilMs === null) return;
    const remaining = pulseUntilMs - Date.now();
    if (remaining <= 0) {
      setPulseUntilMs(null);
      return;
    }
    const tick = window.setInterval(() => setNowMs(Date.now()), 200);
    const clear = window.setTimeout(() => {
      setPulseUntilMs(null);
      setNowMs(Date.now());
    }, remaining);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(clear);
    };
  }, [pulseUntilMs]);

  return resolvePetMood({ base, pulseUntilMs, nowMs });
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
