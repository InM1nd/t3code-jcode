import type { DiscoveredLocalServer, EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { RadioTowerIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { resolveDiscoveredServerUrl } from "~/browser/browserTargetResolver";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { readLocalApi } from "~/localApi";
import { useDiscoveredPorts } from "~/portDiscoveryState";
import { useActiveEnvironmentId, useEnvironmentThreadRefs, useThreadShell } from "~/state/entities";
import { useEnvironments } from "~/state/environments";

import { isElectron } from "../../env";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SidebarInset } from "../ui/sidebar";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";

function PortOwnerCell({
  server,
  threadRefs,
}: {
  server: DiscoveredLocalServer;
  threadRefs: ReadonlyArray<ScopedThreadRef>;
}) {
  // Reactive on purpose: a cold deep-link to /ports can render before thread
  // refs finish bootstrapping, and a one-shot snapshot read would leave the row
  // stuck on the fallback label forever.
  const ownerRef = threadRefs.find((ref) => ref.threadId === server.terminal?.threadId) ?? null;
  const ownerShell = useThreadShell(ownerRef);
  if (!server.terminal) {
    return <span className="text-muted-foreground">Not attributed</span>;
  }
  if (!ownerRef || !ownerShell) {
    return <span className="text-muted-foreground">Another thread</span>;
  }
  return (
    <Link
      to="/$environmentId/$threadId"
      params={{ environmentId: ownerRef.environmentId, threadId: ownerRef.threadId }}
      className="truncate text-foreground hover:underline"
    >
      {ownerShell.title}
    </Link>
  );
}

function PortRow({
  server,
  environmentId,
  threadRefs,
}: {
  server: DiscoveredLocalServer;
  environmentId: EnvironmentId;
  threadRefs: ReadonlyArray<ScopedThreadRef>;
}) {
  const { copyToClipboard } = useCopyToClipboard({ target: "URL" });
  // server.url is localhost from the *environment's* point of view; on a remote
  // client that host is the wrong machine until it's resolved.
  const resolvedUrl = resolveDiscoveredServerUrl(environmentId, server.url);
  return (
    <div className="flex items-center gap-3 border-b border-border/60 px-3 py-2 text-sm last:border-b-0">
      <span className="w-36 shrink-0 truncate font-mono text-foreground">
        {server.host}:{server.port}
      </span>
      <span className="w-32 shrink-0 truncate text-muted-foreground">
        {server.processName ?? "Listening"}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <PortOwnerCell server={server} threadRefs={threadRefs} />
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void readLocalApi()
            ?.shell.openExternal(resolvedUrl)
            .catch((error: unknown) => {
              console.error(error);
            });
        }}
      >
        Open
      </Button>
      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(resolvedUrl, undefined)}>
        Copy URL
      </Button>
    </div>
  );
}

export function PortsPage() {
  const { environments } = useEnvironments();
  const activeEnvironmentId = useActiveEnvironmentId();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(
    activeEnvironmentId,
  );
  const environmentId =
    selectedEnvironmentId ?? activeEnvironmentId ?? environments[0]?.environmentId ?? null;
  const servers = useDiscoveredPorts(environmentId);
  const threadRefs = useEnvironmentThreadRefs(environmentId);
  const sortedServers = useMemo(
    () => servers.toSorted((a, b) => a.host.localeCompare(b.host) || a.port - b.port),
    [servers],
  );

  const topbarContent = (
    <div className="flex w-full min-w-0 items-center gap-3">
      <WorkspaceBreadcrumb ariaLabel="Ports breadcrumb" className="min-w-0">
        <WorkspaceBreadcrumbItem current>
          <h1>Ports</h1>
        </WorkspaceBreadcrumbItem>
      </WorkspaceBreadcrumb>
      {environments.length > 1 ? (
        <Select
          value={environmentId ?? undefined}
          onValueChange={(value) => setSelectedEnvironmentId(value as EnvironmentId)}
        >
          <SelectTrigger aria-label="Environment" size="compact" variant="ghost">
            <SelectValue>
              {
                environments.find((environment) => environment.environmentId === environmentId)
                  ?.label
              }
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {environments.map((environment) => (
              <SelectItem key={environment.environmentId} value={environment.environmentId}>
                {environment.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      ) : null}
    </div>
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <WorkspacePageHeader electron={isElectron}>{topbarContent}</WorkspacePageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <WorkspacePageContainer width="wide">
          {sortedServers.length === 0 || environmentId === null ? (
            <Empty>
              <EmptyMedia variant="icon">
                <RadioTowerIcon className="size-4.5 text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle>No local dev servers</EmptyTitle>
              <EmptyDescription>
                Run a dev script in a thread's terminal. Detected servers show up here
                automatically.
              </EmptyDescription>
            </Empty>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
              {sortedServers.map((server) => (
                <PortRow
                  key={`${server.host}:${server.port}`}
                  server={server}
                  environmentId={environmentId}
                  threadRefs={threadRefs}
                />
              ))}
            </div>
          )}
        </WorkspacePageContainer>
      </div>
    </SidebarInset>
  );
}
