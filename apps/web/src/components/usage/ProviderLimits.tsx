import type { ProviderLimit } from "@t3tools/contracts";

import { cn } from "../../lib/utils";
import type { EnvironmentUsageStatus } from "../../state/usage";

const PROVIDER_LABEL: Record<ProviderLimit["provider"], string> = {
  claude: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "OpenCode",
};

const ALL_PROVIDERS = Object.keys(PROVIDER_LABEL) as ProviderLimit["provider"][];

export function ProviderLimits({
  environments,
  gridClassName,
}: {
  readonly environments: readonly EnvironmentUsageStatus[];
  /** Overrides the default responsive grid, e.g. for a fixed-width popover. */
  readonly gridClassName?: string;
}) {
  const environmentsWithData = environments.filter((environment) => environment.summary !== null);
  if (environmentsWithData.length === 0) return null;

  const limits = environmentsWithData.flatMap((environment) =>
    ALL_PROVIDERS.map((provider) => ({
      environment,
      limit: environment.summary?.limits?.find((entry) => entry.provider === provider) ?? null,
      provider,
    })),
  );

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-foreground">Provider limits</h2>
      <div className={cn("grid gap-3", gridClassName ?? "md:grid-cols-2 xl:grid-cols-4")}>
        {limits.map(({ environment, limit, provider }) => (
          <article
            key={`${environment.environmentId}:${provider}`}
            className="border border-border p-3"
          >
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <span className="font-medium text-foreground">{PROVIDER_LABEL[provider]}</span>
              <span className="truncate text-xs text-muted-foreground">{environment.label}</span>
            </div>
            {limit === null ? (
              <p className="text-xs text-muted-foreground">No limit data</p>
            ) : (
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
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
