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

/** Compact drops seconds and year but keeps UTC explicit: "Resets 08-31 00:02 UTC". */
function formatResetsAt(resetsAt: string, compact: boolean): string {
  const normalized = resetsAt.replace("T", " ").replace(".000Z", " UTC");
  return compact ? `${normalized.slice(5, 16)} UTC` : normalized;
}

function fallbackLimitMessage(
  provider: ProviderLimit["provider"],
  status: NonNullable<ProviderLimit["status"]>,
): string {
  if (status === "auth-required")
    return `Sign in to ${PROVIDER_LABEL[provider]} to view usage limits.`;
  if (status === "unsupported") return `${PROVIDER_LABEL[provider]} does not expose usage limits.`;
  return `${PROVIDER_LABEL[provider]} usage limits could not be refreshed.`;
}

export function ProviderLimits({
  environments,
  gridClassName,
  compact = false,
}: {
  readonly environments: readonly EnvironmentUsageStatus[];
  /** Overrides the default responsive grid, e.g. for a fixed-width popover. */
  readonly gridClassName?: string;
  /** Tighter spacing and no section title, for a sidebar popover. */
  readonly compact?: boolean;
}) {
  const environmentsWithData = environments.filter((environment) => environment.summary !== null);
  if (environmentsWithData.length === 0) return null;

  // One environment repeating its own name on every card wastes space and
  // says nothing; only worth showing once there's something to tell apart.
  const showEnvironmentLabel = environmentsWithData.length > 1;

  const limits = environmentsWithData.flatMap((environment) =>
    ALL_PROVIDERS.map((provider) => ({
      environment,
      limit: environment.summary?.limits?.find((entry) => entry.provider === provider) ?? null,
      provider,
    })),
  );

  return (
    <section className={cn("flex flex-col", compact ? "gap-2" : "gap-3")}>
      {compact ? null : <h2 className="text-sm font-medium text-foreground">Provider limits</h2>}
      <div
        className={cn(
          "grid",
          compact ? "gap-2" : "gap-3",
          gridClassName ?? "md:grid-cols-2 xl:grid-cols-4",
        )}
      >
        {limits.map(({ environment, limit, provider }) => (
          <article
            key={`${environment.environmentId}:${provider}`}
            className={cn("border border-border", compact ? "p-2" : "p-3")}
          >
            <div
              className={cn("flex items-baseline justify-between gap-2", compact ? "mb-1" : "mb-3")}
            >
              <span className={cn("font-medium text-foreground", compact ? "text-xs" : "text-sm")}>
                {PROVIDER_LABEL[provider]}
              </span>
              {showEnvironmentLabel ? (
                <span className="truncate text-xs text-muted-foreground">{environment.label}</span>
              ) : null}
            </div>
            {(() => {
              const status =
                limit?.status ??
                (limit !== null && limit.windows.length > 0 ? "ok" : "temporary-error");
              const message =
                limit === null
                  ? "No limit report was returned by this environment."
                  : status === "ok"
                    ? null
                    : (limit.message ?? fallbackLimitMessage(provider, status));
              const lastUpdatedAt =
                limit?.lastUpdatedAt ?? (status === "ok" ? environment.summary?.readAt : null);

              return (
                <div className={cn("flex flex-col", compact ? "gap-1" : "gap-2")}>
                  {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
                  {limit?.windows.map((window) => (
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
                          Resets {formatResetsAt(window.resetsAt, compact)}
                        </span>
                      )}
                    </div>
                  ))}
                  {lastUpdatedAt ? (
                    <span className="text-[11px] text-muted-foreground">
                      Updated {formatResetsAt(lastUpdatedAt, compact)}
                    </span>
                  ) : null}
                </div>
              );
            })()}
          </article>
        ))}
      </div>
    </section>
  );
}
