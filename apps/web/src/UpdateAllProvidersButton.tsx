import type { EnvironmentId, ServerProvider } from "@t3tools/contracts";
import { DownloadIcon, LoaderIcon } from "lucide-react";
import { useCallback, useState } from "react";

import {
  firstFailedProviderUpdateMessage,
  formatProviderList,
} from "./components/ProviderUpdateLaunchNotification.logic";
import { Button } from "./components/ui/button";
import { stackedThreadToast, toastManager } from "./components/ui/toast";
import { serverEnvironment } from "./state/server";
import { useAtomCommand } from "./state/use-atom-command";
import {
  collectOneClickUpdateCandidates,
  updateAllProvidersAriaLabel,
  updateAllProvidersButtonLabel,
} from "./updateAllProviders.logic";

export function UpdateAllProvidersButton({
  environmentId,
  providers,
}: {
  readonly environmentId: EnvironmentId;
  readonly providers: ReadonlyArray<ServerProvider>;
}) {
  const updateProvider = useAtomCommand(serverEnvironment.updateProvider, {
    reportFailure: false,
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const candidates = collectOneClickUpdateCandidates(providers);

  const runUpdates = useCallback(async () => {
    if (isUpdating || candidates.length === 0) {
      return;
    }
    setIsUpdating(true);
    const results = [];
    for (const candidate of candidates) {
      results.push(
        await updateProvider({
          environmentId,
          input: {
            provider: candidate.driver,
            instanceId: candidate.instanceId,
          },
        }),
      );
    }
    setIsUpdating(false);

    const failedMessage = firstFailedProviderUpdateMessage(results);
    if (failedMessage) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not update providers",
          description: failedMessage,
        }),
      );
      return;
    }

    toastManager.add({
      type: "success",
      title: `Updated ${formatProviderList(candidates)}`,
    });
  }, [candidates, environmentId, isUpdating, updateProvider]);

  if (candidates.length === 0) {
    return null;
  }

  return (
    <Button
      type="button"
      size="xs"
      variant="ghost-muted"
      disabled={isUpdating}
      onClick={() => void runUpdates()}
      aria-label={updateAllProvidersAriaLabel(candidates.length)}
    >
      {isUpdating ? (
        <LoaderIcon className="size-3 animate-spin" />
      ) : (
        <DownloadIcon className="size-3" />
      )}
      {updateAllProvidersButtonLabel(candidates.length)}
    </Button>
  );
}
