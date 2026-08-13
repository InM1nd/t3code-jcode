import {
  type JcodeSettings,
  type ModelCapabilities,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import {
  JCODE_INNER_PROVIDERS,
  resolveJcodeInnerProvider,
} from "@t3tools/shared/jcodeInnerProvider";
import { causeErrorTag } from "@t3tools/shared/observability";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { HttpClient } from "effect/unstable/http";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { createModelCapabilities } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";

import {
  buildServerProvider,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";
import {
  enrichProviderSnapshotWithVersionAdvisory,
  type ProviderMaintenanceCapabilities,
} from "../providerMaintenance.ts";

const JCODE_PRESENTATION = {
  displayName: "Jcode",
  badgeLabel: "Fork",
  showInteractionModeToggle: false,
  requiresNewThreadForModelChange: true,
} as const;
const EMPTY_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [],
});

const VERSION_PROBE_TIMEOUT_MS = 4_000;
const JCODE_MODEL_LIST_TIMEOUT_MS = 4_000;

const JCODE_BUILT_IN_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "claude-opus-5",
    name: "claude-opus-5",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
];

export function buildInitialJcodeProviderSnapshot(
  jcodeSettings: JcodeSettings,
): Effect.Effect<ServerProviderDraft> {
  return Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    const models = jcodeModelsFromSettings(jcodeSettings.customModels);

    if (!jcodeSettings.enabled) {
      return buildServerProvider({
        presentation: JCODE_PRESENTATION,
        enabled: false,
        checkedAt,
        models,
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Jcode is disabled in T3 Code settings.",
        },
      });
    }

    return buildServerProvider({
      presentation: JCODE_PRESENTATION,
      enabled: true,
      checkedAt,
      models,
      probe: {
        installed: true,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Checking Jcode CLI availability...",
      },
    });
  });
}

function jcodeModelsFromSettings(
  customModels: ReadonlyArray<string> | undefined,
  builtInModels: ReadonlyArray<ServerProviderModel> = JCODE_BUILT_IN_MODELS,
): ReadonlyArray<ServerProviderModel> {
  return providerModelsFromSettings(builtInModels, customModels ?? [], EMPTY_CAPABILITIES);
}

export function jcodeModelsFromModelList(
  providerId: string,
  output: string,
): ReadonlyArray<ServerProviderModel> {
  const provider = resolveJcodeInnerProvider(providerId);
  if (!provider) return [];
  const seen = new Set<string>();
  const models: ServerProviderModel[] = [];
  for (const line of output.split("\n")) {
    const slug = line.trim();
    if (!slug || /\s/.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    models.push({
      slug,
      name: slug,
      subProvider: provider.label,
      isCustom: false,
      capabilities: EMPTY_CAPABILITIES,
      ...(models.length === 0 ? { isDefault: true } : {}),
    });
  }
  return models;
}

const runJcodeVersionCommand = (
  jcodeSettings: JcodeSettings,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const command = jcodeSettings.binaryPath || "jcode";
    const spawnCommand = yield* resolveSpawnCommand(command, ["version"], {
      env: environment,
    });
    return yield* spawnAndCollect(
      command,
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        env: environment,
        shell: spawnCommand.shell,
      }),
    );
  });

const runJcodeModelListCommand = (
  jcodeSettings: JcodeSettings,
  providerId: string,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const command = jcodeSettings.binaryPath || "jcode";
    const spawnCommand = yield* resolveSpawnCommand(
      command,
      ["model", "list", "-p", providerId, "--quiet"],
      { env: environment },
    );
    return yield* spawnAndCollect(
      command,
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        env: environment,
        shell: spawnCommand.shell,
      }),
    );
  });

export const discoverJcodeModelsForProvider = (
  jcodeSettings: JcodeSettings,
  providerId: string,
  environment: NodeJS.ProcessEnv,
) =>
  runJcodeModelListCommand(jcodeSettings, providerId, environment).pipe(
    Effect.timeoutOption(JCODE_MODEL_LIST_TIMEOUT_MS),
    Effect.map((result) =>
      Option.isSome(result) && result.value.code === 0
        ? jcodeModelsFromModelList(providerId, result.value.stdout)
        : [],
    ),
    Effect.catchCause(() => Effect.succeed([])),
  );

const discoverJcodeModels = (jcodeSettings: JcodeSettings, environment: NodeJS.ProcessEnv) =>
  Effect.forEach(
    JCODE_INNER_PROVIDERS,
    (provider) => discoverJcodeModelsForProvider(jcodeSettings, provider.id, environment),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((groups) => groups.flat()));

export const checkJcodeProviderStatus = Effect.fn("checkJcodeProviderStatus")(function* (
  jcodeSettings: JcodeSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<
  ServerProviderDraft,
  never,
  ChildProcessSpawner.ChildProcessSpawner | Crypto.Crypto
> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  const fallbackModels = jcodeModelsFromSettings(jcodeSettings.customModels);

  if (!jcodeSettings.enabled) {
    return buildServerProvider({
      presentation: JCODE_PRESENTATION,
      enabled: false,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Jcode is disabled in T3 Code settings.",
      },
    });
  }

  const versionResult = yield* runJcodeVersionCommand(jcodeSettings, environment).pipe(
    Effect.timeoutOption(VERSION_PROBE_TIMEOUT_MS),
    Effect.result,
  );

  if (Result.isFailure(versionResult)) {
    const error = versionResult.failure;
    yield* Effect.logWarning("Jcode CLI health check failed.", {
      errorTag: error._tag,
    });
    return buildServerProvider({
      presentation: JCODE_PRESENTATION,
      enabled: jcodeSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: !isCommandMissingCause(error),
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: isCommandMissingCause(error)
          ? "Jcode CLI (`jcode`) is not installed or not on PATH."
          : "Failed to execute Jcode CLI health check.",
      },
    });
  }

  if (Option.isNone(versionResult.success)) {
    return buildServerProvider({
      presentation: JCODE_PRESENTATION,
      enabled: jcodeSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: "Jcode CLI is installed but timed out while running `jcode version`.",
      },
    });
  }

  const versionOutput = versionResult.success.value;
  const version = parseGenericCliVersion(`${versionOutput.stdout}\n${versionOutput.stderr}`);
  if (versionOutput.code !== 0) {
    yield* Effect.logWarning("Jcode CLI version probe exited with a non-zero status.", {
      exitCode: versionOutput.code,
      stdoutLength: versionOutput.stdout.length,
      stderrLength: versionOutput.stderr.length,
    });
    return buildServerProvider({
      presentation: JCODE_PRESENTATION,
      enabled: jcodeSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: "Jcode CLI is installed but failed to run.",
      },
    });
  }

  const discoveredModels = yield* discoverJcodeModels(jcodeSettings, environment);
  const models =
    discoveredModels.length > 0
      ? jcodeModelsFromSettings(jcodeSettings.customModels, discoveredModels)
      : fallbackModels;

  return buildServerProvider({
    presentation: JCODE_PRESENTATION,
    enabled: jcodeSettings.enabled,
    checkedAt,
    models,
    probe: {
      installed: true,
      version,
      status: "ready",
      auth: { status: "unknown" },
    },
  });
});

export const enrichJcodeSnapshot = (input: {
  readonly snapshot: ServerProvider;
  readonly maintenanceCapabilities: ProviderMaintenanceCapabilities;
  readonly enableProviderUpdateChecks?: boolean;
  readonly publishSnapshot: (snapshot: ServerProvider) => Effect.Effect<void>;
  readonly httpClient: HttpClient.HttpClient;
}): Effect.Effect<void> => {
  const { snapshot, publishSnapshot } = input;

  return enrichProviderSnapshotWithVersionAdvisory(snapshot, input.maintenanceCapabilities, {
    enableProviderUpdateChecks: input.enableProviderUpdateChecks,
  }).pipe(
    Effect.provideService(HttpClient.HttpClient, input.httpClient),
    Effect.flatMap((enrichedSnapshot) => publishSnapshot(enrichedSnapshot)),
    Effect.catchCause((cause) =>
      Effect.logWarning("Jcode version advisory enrichment failed", {
        errorTag: causeErrorTag(cause),
      }),
    ),
    Effect.asVoid,
  );
};
