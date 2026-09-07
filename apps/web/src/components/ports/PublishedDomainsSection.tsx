import type { EnvironmentId } from "@t3tools/contracts";
import { Globe2 } from "lucide-react";

import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { localDomainsEnvironment } from "~/localDomainsState";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";

import { Button } from "../ui/button";

export function PublishedDomainsSection({
  environmentId,
  activePorts,
}: {
  environmentId: EnvironmentId;
  activePorts: ReadonlyArray<number>;
}) {
  const { copyToClipboard } = useCopyToClipboard({ target: "URL" });
  const localDomains = useEnvironmentQuery(
    localDomainsEnvironment.list({ environmentId, input: {} }),
  );
  const unpublish = useAtomCommand(localDomainsEnvironment.unpublish, { reportFailure: true });
  const activePortSet = new Set(activePorts);
  const stoppedDomains =
    localDomains.data?.supported === true
      ? localDomains.data.domains.filter((domain) => !activePortSet.has(domain.port))
      : [];

  if (stoppedDomains.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Globe2 className="size-4 shrink-0" />
        <h2 className="font-medium">Published domains</h2>
      </div>
      <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-background">
        {stoppedDomains.map((domain) => {
          const url = `http://${domain.domain}`;
          return (
            <div
              key={domain.domain}
              className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate font-mono">{domain.domain}</span>
              <span className="text-muted-foreground">port {domain.port} stopped</span>
              <Button size="sm" variant="ghost" onClick={() => copyToClipboard(url, undefined)}>
                Copy URL
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void unpublish({ environmentId, input: { domain: domain.domain } }).then(
                    (result) => {
                      if (result._tag === "Success") localDomains.refresh();
                    },
                  )
                }
              >
                Unpublish
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
