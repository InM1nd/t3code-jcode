import type { ScopedThreadRef } from "@t3tools/contracts";

import { findThreadRef, useThreadShell } from "~/state/entities";

import { PreviewFaviconIcon } from "./PreviewFaviconIcon";
import { portOwnerLabel } from "./portOwnerLabel";
import type { PreviewableServer } from "./useDiscoveredLocalServers";

interface Props {
  threadRef: ScopedThreadRef;
  server: PreviewableServer;
  onOpen: () => void;
}

export function PreviewLocalServerCard({ threadRef, server, onOpen }: Props) {
  const subtitle = describeServer(server);
  const ownerRef =
    server.terminal && server.terminal.threadId !== threadRef.threadId
      ? findThreadRef(server.terminal.threadId)
      : null;
  const ownerShell = useThreadShell(ownerRef);
  const ownerLabel = portOwnerLabel({
    terminal: server.terminal,
    currentThreadId: threadRef.threadId,
    ownerTitle: ownerShell?.title ?? null,
  });
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <PreviewFaviconIcon threadRef={threadRef} url={server.requestedUrl} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{subtitle}</span>
        <span className="truncate text-xs text-muted-foreground">
          {server.host}:{server.port}
          {ownerLabel ? ` · ${ownerLabel}` : ""}
        </span>
      </div>
    </button>
  );
}

function describeServer(server: PreviewableServer): string {
  if (server.processName) return server.processName;
  return "Listening";
}
