import type { ScopedThreadRef } from "@t3tools/contracts";
import { DiscoveryListRow } from "../ui/discovery-list";
import { useThreadShell } from "~/state/entities";

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
      ? { environmentId: threadRef.environmentId, threadId: server.terminal.threadId }
      : null;
  const ownerShell = useThreadShell(ownerRef);
  const ownerLabel = portOwnerLabel({
    terminal: server.terminal,
    currentThreadId: threadRef.threadId,
    ownerTitle: ownerShell?.title ?? null,
  });
  return (
    <DiscoveryListRow
      onClick={onOpen}
      icon={<PreviewFaviconIcon threadRef={threadRef} url={server.requestedUrl} />}
      title={subtitle}
      description={`${server.host}:${server.port}${ownerLabel ? ` · ${ownerLabel}` : ""}`}
    />
  );
}

function describeServer(server: PreviewableServer): string {
  if (server.processName) return server.processName;
  return "Listening";
}
