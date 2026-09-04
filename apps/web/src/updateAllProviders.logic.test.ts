import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  collectOneClickUpdateCandidates,
  updateAllProvidersAriaLabel,
  updateAllProvidersButtonLabel,
} from "./updateAllProviders.logic";

const codexId = ProviderInstanceId.make("codex");
const claudeId = ProviderInstanceId.make("claudeAgent");

function provider(input: {
  readonly instanceId: ProviderInstanceId;
  readonly driver: string;
  readonly canUpdate?: boolean;
}): ServerProvider {
  return {
    instanceId: input.instanceId,
    driver: ProviderDriverKind.make(input.driver),
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-09-04T12:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    versionAdvisory: {
      status: "behind_latest",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      updateCommand: `npm install -g ${input.driver}`,
      canUpdate: input.canUpdate ?? true,
      checkedAt: "2026-09-04T12:00:00.000Z",
      message: "Update available.",
    },
  };
}

describe("updateAllProviders.logic", () => {
  it("collects one-click outdated providers and skips those that cannot auto-update", () => {
    expect(
      collectOneClickUpdateCandidates([
        provider({ instanceId: codexId, driver: "codex" }),
        provider({ instanceId: claudeId, driver: "claudeAgent", canUpdate: false }),
      ]).map((candidate) => candidate.instanceId),
    ).toEqual([codexId]);
  });

  it("labels a single candidate as Update and many as Update all", () => {
    expect(updateAllProvidersButtonLabel(1)).toBe("Update");
    expect(updateAllProvidersButtonLabel(2)).toBe("Update all");
    expect(updateAllProvidersAriaLabel(1)).toBe("Update 1 provider");
    expect(updateAllProvidersAriaLabel(2)).toBe("Update all 2 providers");
  });
});
