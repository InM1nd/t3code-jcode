import type { DiscoveredLocalServer, EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";

import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { formatLocalDomainUrl, localDomainsEnvironment } from "~/localDomainsState";
import { readLocalApi } from "~/localApi";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";

import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function LocalDomainsPortControls({
  server,
  environmentId,
}: {
  server: DiscoveredLocalServer;
  environmentId: EnvironmentId;
}) {
  const { copyToClipboard } = useCopyToClipboard({ target: "URL" });
  const localDomains = useEnvironmentQuery(
    localDomainsEnvironment.list({ environmentId, input: {} }),
  );
  const publish = useAtomCommand(localDomainsEnvironment.publish, { reportFailure: true });
  const unpublish = useAtomCommand(localDomainsEnvironment.unpublish, { reportFailure: true });
  const domain = localDomains.data?.domains.find((binding) => binding.port === server.port);
  const defaultDraft = domain?.domain ?? `local-${server.port}`;
  const [draftOverride, setDraftOverride] = useState<{
    readonly base: string;
    readonly value: string;
  } | null>(null);
  const domainDraft = draftOverride?.base === defaultDraft ? draftOverride.value : defaultDraft;
  if (localDomains.data?.supported === false) return null;
  if (localDomains.error) return <span className="text-destructive">{localDomains.error}</span>;
  if (localDomains.data?.supported !== true) return null;
  const localUrl = domain ? formatLocalDomainUrl(domain.domain, localDomains.data.proxyPort) : "";
  return (
    <div className="flex w-full items-center gap-2 border-t border-border/40 pt-2">
      <Input
        aria-label={`Local domain for port ${server.port}`}
        className="max-w-64"
        value={domainDraft}
        onChange={(event) => setDraftOverride({ base: defaultDraft, value: event.target.value })}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          void publish({ environmentId, input: { port: server.port, domain: domainDraft } }).then(
            (result) => {
              if (result._tag === "Success") localDomains.refresh();
            },
          )
        }
      >
        {domain ? "Update local domain" : "Publish local domain"}
      </Button>
      {domain ? (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void readLocalApi()?.shell.openExternal(localUrl)}
          >
            Open {domain.domain}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(localUrl, undefined)}>
            Copy {domain.domain}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void unpublish({ environmentId, input: { domain: domain.domain } }).then((result) => {
                if (result._tag === "Success") localDomains.refresh();
              })
            }
          >
            Unpublish
          </Button>
        </>
      ) : null}
      {localDomains.data.proxyError ? (
        <span className="text-destructive">{localDomains.data.proxyError}</span>
      ) : null}
    </div>
  );
}
