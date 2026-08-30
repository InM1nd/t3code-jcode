import type { ProviderLimit } from "@t3tools/contracts";

import type { EnvironmentUsageStatus } from "../../state/usage";

const PROVIDER_LABEL: Record<ProviderLimit["provider"], string> = {
  claude: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "OpenCode",
};

export function ProviderLimits({
  environments,
}: {
  readonly environments: readonly EnvironmentUsageStatus[];
}) {
  const limits = environments.flatMap((environment) =>
    (environment.summary?.limits ?? []).map((limit) => ({ environment, limit })),
  );
  if (limits.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-foreground">Provider limits</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {limits.map(({ environment, limit }) => (
          <article
            key={`${environment.environmentId}:${limit.provider}`}
            className="border border-border p-3"
          >
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <span className="font-medium text-foreground">{PROVIDER_LABEL[limit.provider]}</span>
              <span className="truncate text-xs text-muted-foreground">{environment.label}</span>
            </div>
            <div className="flex flex-col gap-2">
              {limit.windows.map((window) => (
                <div key={window.label} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{window.label}</span>
                    <span className="font-medium text-foreground tabular-nums">
                      {window.usedPercent}%
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden bg-muted">
                    <div
                      className="h-full bg-foreground"
                      style={{ width: `${Math.min(100, Math.max(0, window.usedPercent))}%` }}
                    />
                  </div>
                  {window.resetsAt === null ? null : (
                    <span className="text-[11px] text-muted-foreground">
                      Resets {window.resetsAt.replace("T", " ").replace(".000Z", " UTC")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
