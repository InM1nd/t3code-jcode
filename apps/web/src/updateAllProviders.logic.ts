import type { ServerProvider } from "@t3tools/contracts";

import {
  canOneClickUpdateProviderCandidate,
  collectProviderUpdateCandidates,
  type ProviderUpdateCandidate,
} from "./components/ProviderUpdateLaunchNotification.logic";

export function collectOneClickUpdateCandidates(
  providers: ReadonlyArray<ServerProvider>,
): ProviderUpdateCandidate[] {
  return collectProviderUpdateCandidates(providers).filter((candidate) =>
    canOneClickUpdateProviderCandidate(candidate, providers),
  );
}

export function updateAllProvidersButtonLabel(count: number): string {
  return count === 1 ? "Update" : "Update all";
}

export function updateAllProvidersAriaLabel(count: number): string {
  return count === 1 ? "Update 1 provider" : `Update all ${count} providers`;
}
