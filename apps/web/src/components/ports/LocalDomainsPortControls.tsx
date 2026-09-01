import type { DiscoveredLocalServer, EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";

import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { localDomainsEnvironment } from "~/localDomainsState";
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
  const [domainDraft, setDomainDraft] = useState(domain?.domain ?? `local-${server.port}`);
  if (localDomains.data?.supported === false) {
    return (
      <span className="text-muted-foreground">
        Local development domains are available on macOS only.
      </span>
    );
  }
  if (localDomains.error) return <span className="text-destructive">{localDomains.error}</span>;
  if (localDomains.data?.supported !== true) return null;
  const localUrl = domain ? `http://${domain.domain}` : "";
  return (
    <div className="flex w-full items-center gap-2 border-t border-border/40 pt-2">
      <Input
        aria-label={`Local domain for port ${server.port}`}
        className="max-w-64 font-mono"
        value={domainDraft}
        onChange={(event) => setDomainDraft(event.target.value)}
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
