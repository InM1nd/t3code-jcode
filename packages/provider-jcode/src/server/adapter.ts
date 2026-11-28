import {
  ProviderDriverKind,
  type OrchestrationV2ProviderCapabilities,
  type ThreadId,
} from "@t3tools/contracts";
import {
  AcpProviderCapabilitiesV2,
  makeAcpAdapterV2,
  type AcpAdapterV2Flavor,
  type AcpAdapterV2Options,
  type AcpAdapterV2RuntimeInput,
} from "@t3tools/provider-acp/server/adapter";
import { makeAcpNativeLoggerFactory } from "@t3tools/provider-acp/server/nativeLogging";
import {
  ProviderAdapterDriverCreateError,
  type ProviderAdapterDriver,
  type ProviderAdapterDriverCreateInput,
} from "@t3tools/provider-core/server/adapterDriver";
import type * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import { mergeProviderInstanceEnvironment } from "@t3tools/provider-core/server/instanceEnvironment";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import * as ProviderEventLoggers from "@t3tools/provider-core/server/ProviderEventLoggers";
import * as ProviderHost from "@t3tools/provider-core/server/ProviderHost";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { resolveSelfInvocation, type SelfInvocation } from "@t3tools/shared/nodeRuntime";
import type * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as EffectAcpErrors from "effect-acp/errors";

import { JcodeSettings } from "../settings.ts";
import {
  applyJcodeAcpModelSelection,
  currentJcodeModelIdFromSessionSetup,
  makeJcodeAcpRuntime,
  resolveJcodeAcpBaseModelId,
  resolveJcodeLaunchProvider,
  resolveJcodeRuntimeModelId,
} from "./acpSupport.ts";
import { makeJcodeDaemonPool } from "./daemonPool.ts";
import { clearJcodeMcpAuthFile, installJcodeMcpBridgeFiles } from "./mcpConfig.ts";

export const JCODE_DRIVER_KIND = ProviderDriverKind.make("jcode");
const DEFAULT_JCODE_SETTINGS = Schema.decodeSync(JcodeSettings)({});

/**
 * jcode rejects `session/set_model`, so a model change needs a new thread.
 * MCP still works: the session writes a project-local stdio bridge because
 * jcode also rejects ACP `mcpServers`.
 */
const JcodeProviderCapabilitiesV2 = {
  ...AcpProviderCapabilitiesV2,
  sessions: {
    ...AcpProviderCapabilitiesV2.sessions,
    supportsModelSwitchInSession: false,
  },
} satisfies OrchestrationV2ProviderCapabilities;

export interface JcodeAdapterV2Options {
  readonly instanceId: AcpAdapterV2Options["instanceId"];
  readonly settings: JcodeSettings;
  readonly environment: NodeJS.ProcessEnv;
  readonly selfInvocation: SelfInvocation;
  readonly nativeLogging?: AcpAdapterV2Options["nativeLogging"];
  readonly testHooks?: AcpAdapterV2Options["testHooks"];
}

function jcodeLaunchProvider(
  input: AcpAdapterV2RuntimeInput,
  settings: JcodeSettings,
): string | undefined {
  return resolveJcodeLaunchProvider({
    modelSelection: input.launchModelSelection,
    settingsProvider: settings.jcodeProvider,
    fallbackModel: settings.model,
  });
}

function jcodeLaunchModel(
  input: AcpAdapterV2RuntimeInput,
  settings: JcodeSettings,
  provider: string | undefined,
) {
  return (
    resolveJcodeRuntimeModelId(provider, input.launchModelSelection?.model || settings.model) ??
    resolveJcodeAcpBaseModelId(input.launchModelSelection?.model ?? settings.model)
  );
}

const installThreadMcpBridge = Effect.fn("installThreadMcpBridge")(
  function* (input: {
    readonly cwd: string;
    readonly secretsDir: string;
    readonly threadId: ThreadId;
    readonly selfInvocation: SelfInvocation;
    readonly mcpProviderSessions: McpProviderSessions.McpProviderSessions["Service"];
  }) {
    const session = yield* input.mcpProviderSessions.read(input.threadId);
    if (session === undefined) {
      return;
    }
    yield* Effect.try({
      try: () =>
        installJcodeMcpBridgeFiles({
          cwd: input.cwd,
          secretsDir: input.secretsDir,
          threadId: input.threadId,
          endpoint: session.endpoint,
          authorizationHeader: session.authorizationHeader,
          selfInvocation: input.selfInvocation,
        }),
      catch: (cause) =>
        new EffectAcpErrors.AcpTransportError({
          detail: "Failed to install the Jcode MCP bridge.",
          cause,
        }),
    });
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => clearJcodeMcpAuthFile(input.secretsDir, input.threadId)),
    );
  },
  (effect) =>
    effect.pipe(
      Effect.tapError((error) =>
        Effect.logWarning("jcode MCP stdio bridge install failed; continuing without it", {
          detail: error.detail,
        }),
      ),
      Effect.ignore,
    ),
);

interface JcodeRuntimeDeps {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly secretsDir: string;
  readonly mcpProviderSessions: McpProviderSessions.McpProviderSessions["Service"];
}

function makeJcodeRuntime(options: JcodeAdapterV2Options, deps: JcodeRuntimeDeps) {
  const daemons = makeJcodeDaemonPool({
    spawner: deps.childProcessSpawner,
    fileSystem: deps.fileSystem,
    path: deps.path,
  });
  return (input: AcpAdapterV2RuntimeInput) =>
    Effect.gen(function* () {
      const provider = jcodeLaunchProvider(input, options.settings);
      if (provider === undefined) {
        return yield* new EffectAcpErrors.AcpTransportError({
          detail: "Choose a model Jcode can route before starting a turn.",
          cause: "missing-jcode-provider",
        });
      }
      const model = jcodeLaunchModel(input, options.settings, provider);
      if (input.threadId != null) {
        yield* installThreadMcpBridge({
          cwd: input.cwd,
          secretsDir: deps.secretsDir,
          threadId: input.threadId,
          selfInvocation: options.selfInvocation,
          mcpProviderSessions: deps.mcpProviderSessions,
        });
      }

      const socketPath = yield* daemons
        .acquire({
          provider,
          model,
          ...(options.settings.binaryPath ? { binaryPath: options.settings.binaryPath } : {}),
          ...(options.settings.providerProfile
            ? { providerProfile: options.settings.providerProfile }
            : {}),
          environment: options.environment,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new EffectAcpErrors.AcpTransportError({
                detail: cause.message,
                cause,
              }),
          ),
        );

      return yield* makeJcodeAcpRuntime({
        cwd: input.cwd,
        ...(input.resumeSessionId === undefined ? {} : { resumeSessionId: input.resumeSessionId }),
        interruptPromptOnCancel: input.interruptPromptOnCancel ?? false,
        clientCapabilities: input.clientCapabilities,
        clientInfo: input.clientInfo,
        ...(input.requestLogger === undefined ? {} : { requestLogger: input.requestLogger }),
        protocolLogging: input.protocolLogging,
        onTermination: input.onTermination,
        ...(input.onOutgoingResponseFailure === undefined
          ? {}
          : { onOutgoingResponseFailure: input.onOutgoingResponseFailure }),
        ...(input.onOutgoingResponse === undefined
          ? {}
          : { onOutgoingResponse: input.onOutgoingResponse }),
        ...(input.onIncomingRequest === undefined
          ? {}
          : { onIncomingRequest: input.onIncomingRequest }),
        ...(input.onUndecodableNotification === undefined
          ? {}
          : { onUndecodableNotification: input.onUndecodableNotification }),
        environment: { ...options.environment, ...input.processEnvironment },
        jcodeSettings: {
          ...options.settings,
          model,
          jcodeProvider: provider,
          socketPath,
        },
      });
    });
}

export function makeJcodeAcpAdapterFlavor(
  options: JcodeAdapterV2Options,
  deps: JcodeRuntimeDeps,
): AcpAdapterV2Flavor {
  return {
    driver: JCODE_DRIVER_KIND,
    runtimeHarness: "Jcode",
    capabilities: JcodeProviderCapabilitiesV2,
    // Jcode's ACP PromptResponse.usage reports per-turn token counts.
    reportsPerTurnPromptUsage: true,
    resolveModelId: (selection) => resolveJcodeAcpBaseModelId(selection.model),
    applyModelSelection: ({ startResult, modelSelection }) =>
      Effect.succeed(
        applyJcodeAcpModelSelection({
          currentModelId: currentJcodeModelIdFromSessionSetup(startResult.sessionSetupResult),
          requestedModelId: resolveJcodeAcpBaseModelId(modelSelection.model),
        }),
      ),
    makeRuntime: makeJcodeRuntime(options, deps),
  };
}

export const makeJcodeAdapterV2 = Effect.fn("makeJcodeAdapterV2")(function* (
  options: JcodeAdapterV2Options,
) {
  const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const host = yield* ProviderHost.ProviderHost;
  const mcpProviderSessions = yield* McpProviderSessions.McpProviderSessions;
  const secretsDir = path.join(host.paths.stateDir, "secrets");
  return yield* makeAcpAdapterV2({
    instanceId: options.instanceId,
    flavor: makeJcodeAcpAdapterFlavor(options, {
      childProcessSpawner,
      fileSystem,
      path,
      secretsDir,
      mcpProviderSessions,
    }),
    selfInvocation: options.selfInvocation,
    ...(options.nativeLogging === undefined ? {} : { nativeLogging: options.nativeLogging }),
    ...(options.testHooks === undefined ? {} : { testHooks: options.testHooks }),
  });
});

export type JcodeAdapterV2DriverEnv =
  | ChildProcessSpawner.ChildProcessSpawner
  | SecureRandom.SecureRandom
  | FileSystem.FileSystem
  | IdAllocator.IdAllocatorV2
  | Path.Path
  | McpProviderSessions.McpProviderSessions
  | ProviderEventLoggers.ProviderEventLoggers
  | ProviderHost.ProviderHost;

export const makeJcodeAdapterV2Driver = (): ProviderAdapterDriver<
  JcodeSettings,
  JcodeAdapterV2DriverEnv
> => ({
  driverKind: JCODE_DRIVER_KIND,
  configSchema: JcodeSettings,
  defaultConfig: (): JcodeSettings => DEFAULT_JCODE_SETTINGS,
  create: Effect.fn("JcodeAdapterV2Driver.create")(
    function* (input: ProviderAdapterDriverCreateInput<JcodeSettings>) {
      const hostEnvironment = yield* HostProcess.Environment;
      const selfInvocation = yield* resolveSelfInvocation();
      const providerEventLoggers = yield* ProviderEventLoggers.ProviderEventLoggers;
      const makeNativeLogger = yield* makeAcpNativeLoggerFactory();
      return yield* makeJcodeAdapterV2({
        instanceId: input.instanceId,
        settings: { ...input.config, enabled: input.enabled },
        environment: yield* mergeProviderInstanceEnvironment(input.environment, hostEnvironment),
        selfInvocation,
        nativeLogging: (threadId) =>
          makeNativeLogger({
            nativeEventLogger: providerEventLoggers.native,
            provider: JCODE_DRIVER_KIND,
            threadId,
          }),
      });
    },
    (effect, input) =>
      effect.pipe(
        Effect.mapError(
          (cause) =>
            new ProviderAdapterDriverCreateError({
              driver: JCODE_DRIVER_KIND,
              instanceId: input.instanceId,
              detail: "Failed to create Jcode ACP adapter.",
              cause,
            }),
        ),
      ),
  ),
});
