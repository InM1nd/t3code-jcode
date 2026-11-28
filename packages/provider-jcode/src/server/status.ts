import {
  type CustomModelSetting,
  type ModelCapabilities,
  ProviderDriverKind,
  type ServerProviderModel,
} from "@t3tools/contracts";
import {
  buildServerProvider,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  providerProbeEnvironment,
  spawnAndCollect,
  type ServerProviderDraft,
} from "@t3tools/provider-core/server/snapshotProbe";
import {
  JCODE_INNER_PROVIDERS,
  resolveJcodeInnerProvider,
} from "@t3tools/shared/jcodeInnerProvider";
import { createModelCapabilities } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import * as ChildProcess from "effect/process/ChildProcess";
import type * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import type { JcodeSettings } from "../settings.ts";

const JCODE_DRIVER_KIND = ProviderDriverKind.make("jcode");
const JCODE_PRESENTATION = {
  displayName: "Jcode",
  badgeLabel: "Fork",
  showInteractionModeToggle: false,
} as const;
const EMPTY_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [],
});

const VERSION_PROBE_TIMEOUT_MS = 4_000;
const JCODE_MODEL_LIST_TIMEOUT_MS = 4_000;
const JCODE_DISCOVERY_OUTPUT_LIMIT = 2_000;

class JcodeModelDiscoveryError extends Schema.TaggedError<JcodeModelDiscoveryError>()(
  "JcodeModelDiscoveryError",
  {
    detail: Schema.String,
  },
) {
  override get message(): string {
    return this.detail;
  }
}

const JCODE_BUILT_IN_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "claude-opus-5",
    name: "claude-opus-5",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
];

export const buildInitialJcodeProviderSnapshot = Effect.fn("buildInitialJcodeProviderSnapshot")(
  function* (jcodeSettings: JcodeSettings): Effect.fn.Return<ServerProviderDraft> {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    const models = jcodeModelsFromSettings(jcodeSettings.customModels);

    if (!jcodeSettings.enabled) {
      return buildServerProvider({
        driver: JCODE_DRIVER_KIND,
        presentation: JCODE_PRESENTATION,
        enabled: false,
        checkedAt,
        models,
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Jcode is disabled in Tandem settings.",
        },
      });
    }

    return buildServerProvider({
      driver: JCODE_DRIVER_KIND,
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
  },
);

function jcodeModelsFromSettings(
  customModels: ReadonlyArray<CustomModelSetting> | undefined,
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

const runJcodeVersionCommand = Effect.fn("runJcodeVersionCommand")(function* (
  jcodeSettings: JcodeSettings,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const command = jcodeSettings.binaryPath || "jcode";
  const probeEnv = providerProbeEnvironment(environment);
  const spawnCommand = yield* resolveSpawnCommand(command, ["version"], {
    env: probeEnv,
  });
  return yield* spawnAndCollect(
    command,
    ChildProcess.make(spawnCommand.command, spawnCommand.args, {
      env: probeEnv,
      shell: spawnCommand.shell,
    }),
  );
});

const runJcodeModelListCommand = Effect.fn("runJcodeModelListCommand")(function* (
  jcodeSettings: JcodeSettings,
  providerId: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const command = jcodeSettings.binaryPath || "jcode";
  const probeEnv = providerProbeEnvironment(environment);
  const spawnCommand = yield* resolveSpawnCommand(
    command,
    ["model", "list", "-p", providerId, "--quiet"],
    { env: probeEnv },
  );
  return yield* spawnAndCollect(
    command,
    ChildProcess.make(spawnCommand.command, spawnCommand.args, {
      env: probeEnv,
      shell: spawnCommand.shell,
    }),
  );
});

function boundedDiscoveryOutput(output: string): string {
  const trimmed = output.trim();
  return trimmed.length <= JCODE_DISCOVERY_OUTPUT_LIMIT
    ? trimmed
    : `${trimmed.slice(0, JCODE_DISCOVERY_OUTPUT_LIMIT)}…`;
}

const discoverJcodeModelsForProviderStrict = Effect.fn("discoverJcodeModelsForProviderStrict")(
  function* (jcodeSettings: JcodeSettings, providerId: string, environment: NodeJS.ProcessEnv) {
    const result = yield* runJcodeModelListCommand(jcodeSettings, providerId, environment).pipe(
      Effect.timeoutOption(JCODE_MODEL_LIST_TIMEOUT_MS),
    );
    if (Option.isNone(result)) {
      return yield* new JcodeModelDiscoveryError({
        detail: `Timed out after ${String(JCODE_MODEL_LIST_TIMEOUT_MS)}ms while discovering Jcode models for provider '${providerId}'.`,
      });
    }
    if (result.value.code !== 0) {
      const stderr = boundedDiscoveryOutput(result.value.stderr);
      const stdout = boundedDiscoveryOutput(result.value.stdout);
      return yield* new JcodeModelDiscoveryError({
        detail: [
          `Jcode model discovery for provider '${providerId}' exited with code ${String(result.value.code)}.`,
          stderr ? `stderr: ${stderr}` : null,
          stdout ? `stdout: ${stdout}` : null,
        ]
          .filter((line) => line !== null)
          .join("\n"),
      });
    }
    return jcodeModelsFromModelList(providerId, result.value.stdout);
  },
);

const discoverJcodeModelsForProvider = (
  jcodeSettings: JcodeSettings,
  providerId: string,
  environment: NodeJS.ProcessEnv,
) =>
  discoverJcodeModelsForProviderStrict(jcodeSettings, providerId, environment).pipe(
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
): Effect.fn.Return<ServerProviderDraft, never, ChildProcessSpawner.ChildProcessSpawner> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  const fallbackModels = jcodeModelsFromSettings(jcodeSettings.customModels);

  if (!jcodeSettings.enabled) {
    return buildServerProvider({
      driver: JCODE_DRIVER_KIND,
      presentation: JCODE_PRESENTATION,
      enabled: false,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Jcode is disabled in Tandem settings.",
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
      driver: JCODE_DRIVER_KIND,
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
      driver: JCODE_DRIVER_KIND,
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
      driver: JCODE_DRIVER_KIND,
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
    driver: JCODE_DRIVER_KIND,
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
