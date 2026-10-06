import { HostProcessEnvironment } from "@t3tools/shared/hostProcess";
import { resolveSelfInvocation } from "@t3tools/shared/nodeRuntime";
import {
  JcodeSettings,
  ProviderDriverKind,
  type OrchestrationV2ProviderCapabilities,
  type ThreadId,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { ChildProcessSpawner } from "effect/process";
import * as EffectAcpErrors from "effect-acp/errors";

import * as ServerConfig from "../../config.ts";
import * as McpProviderSession from "../../mcp/McpProviderSession.ts";
import { makeAcpNativeLoggerFactory } from "../../provider/acp/AcpNativeLogging.ts";
import {
  applyJcodeAcpModelSelection,
  currentJcodeModelIdFromSessionSetup,
  makeJcodeAcpRuntime,
  resolveJcodeAcpBaseModelId,
  resolveJcodeAcpProvider,
  resolveJcodeRuntimeModelId,
} from "../../provider/acp/JcodeAcpSupport.ts";
import { startJcodeSessionDaemon } from "../../provider/acp/JcodeSessionDaemon.ts";
import {
  clearJcodeMcpAuthFile,
  installJcodeMcpBridgeFiles,
} from "../../provider/jcodeMcpConfig.ts";
import { mergeProviderInstanceEnvironment } from "../../provider/ProviderInstanceEnvironment.ts";
import * as ProviderEventLoggers from "../../provider/ProviderEventLoggers.ts";
import * as IdAllocator from "../IdAllocator.ts";
import {
  ProviderAdapterDriverCreateError,
  type ProviderAdapterDriver,
  type ProviderAdapterDriverCreateInput,
} from "../ProviderAdapterDriver.ts";
import {
  AcpProviderCapabilitiesV2,
  makeAcpAdapterV2,
  type AcpAdapterV2Flavor,
  type AcpAdapterV2RuntimeInput,
} from "./AcpAdapterV2.ts";

const JCODE_PROVIDER = ProviderDriverKind.make("jcode");
const JCODE_DRIVER_KIND = JCODE_PROVIDER;
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
  readonly instanceId: Parameters<typeof makeAcpAdapterV2>[0]["instanceId"];
  readonly settings: JcodeSettings;
  readonly environment: NodeJS.ProcessEnv;
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly crypto: Crypto.Crypto;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly idAllocator: IdAllocator.IdAllocatorV2["Service"];
  readonly serverConfig: ServerConfig.ServerConfig["Service"];
  readonly selfInvocation: Parameters<typeof makeAcpAdapterV2>[0]["selfInvocation"];
  readonly nativeLogging?: Parameters<typeof makeAcpAdapterV2>[0]["nativeLogging"];
}

function jcodeLaunchProvider(
  input: AcpAdapterV2RuntimeInput,
  settings: JcodeSettings,
): string | undefined {
  return (
    resolveJcodeAcpProvider(input.launchModelSelection) ??
    (settings.jcodeProvider.trim() || undefined)
  );
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

function installThreadMcpBridge(input: {
  readonly cwd: string;
  readonly secretsDir: string;
  readonly threadId: ThreadId;
}) {
  const session = McpProviderSession.readMcpProviderSession(input.threadId);
  if (session === undefined) {
    return Effect.void;
  }
  return Effect.gen(function* () {
    yield* Effect.try({
      try: () =>
        installJcodeMcpBridgeFiles({
          cwd: input.cwd,
          secretsDir: input.secretsDir,
          threadId: input.threadId,
          endpoint: session.endpoint,
          authorizationHeader: session.authorizationHeader,
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
  }).pipe(
    Effect.tapError((error) =>
      Effect.logWarning("jcode MCP stdio bridge install failed; continuing without it", {
        detail: error.detail,
      }),
    ),
    Effect.ignore,
  );
}

function makeJcodeRuntime(options: JcodeAdapterV2Options) {
  return (input: AcpAdapterV2RuntimeInput) =>
    Effect.gen(function* () {
      const provider = jcodeLaunchProvider(input, options.settings);
      const model = jcodeLaunchModel(input, options.settings, provider);
      if (input.threadId != null) {
        yield* installThreadMcpBridge({
          cwd: input.cwd,
          secretsDir: options.serverConfig.secretsDir,
          threadId: input.threadId,
        });
      }

      let socketPath: string | undefined;
      if (provider !== undefined) {
        const directory = yield* options.fileSystem
          .makeTempDirectoryScoped({ prefix: "jcode-session-" })
          .pipe(
            Effect.mapError(
              (cause) =>
                new EffectAcpErrors.AcpTransportError({
                  detail: "Failed to create a Jcode session directory.",
                  cause,
                }),
            ),
          );
        socketPath = options.path.join(directory, "daemon.sock");
        yield* startJcodeSessionDaemon(
          {
            threadId: input.threadId ?? "jcode",
            provider,
            model,
            cwd: input.cwd,
            socketPath,
            ...(options.settings.binaryPath ? { binaryPath: options.settings.binaryPath } : {}),
            ...(options.settings.providerProfile
              ? { providerProfile: options.settings.providerProfile }
              : {}),
            environment: options.environment,
          },
          options.childProcessSpawner,
        ).pipe(
          Effect.provideService(FileSystem.FileSystem, options.fileSystem),
          Effect.provideService(Path.Path, options.path),
          Effect.mapError(
            (cause) =>
              new EffectAcpErrors.AcpTransportError({
                detail: cause.message,
                cause,
              }),
          ),
        );
      }

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
        childProcessSpawner: options.childProcessSpawner,
        environment: options.environment,
        jcodeSettings: {
          ...options.settings,
          model,
          ...(provider === undefined ? {} : { jcodeProvider: provider }),
          ...(socketPath === undefined ? {} : { socketPath }),
        },
      });
    });
}

function makeJcodeAcpAdapterFlavor(options: JcodeAdapterV2Options): AcpAdapterV2Flavor {
  return {
    driver: JCODE_PROVIDER,
    runtimeHarness: "Jcode",
    capabilities: JcodeProviderCapabilitiesV2,
    resolveModelId: (selection) => resolveJcodeAcpBaseModelId(selection.model),
    applyModelSelection: ({ startResult, modelSelection }) =>
      Effect.succeed(
        applyJcodeAcpModelSelection({
          currentModelId: currentJcodeModelIdFromSessionSetup(startResult.sessionSetupResult),
          requestedModelId: resolveJcodeAcpBaseModelId(modelSelection.model),
        }),
      ),
    makeRuntime: makeJcodeRuntime(options),
  };
}

function makeJcodeAdapterV2(options: JcodeAdapterV2Options) {
  return makeAcpAdapterV2({
    instanceId: options.instanceId,
    flavor: makeJcodeAcpAdapterFlavor(options),
    crypto: options.crypto,
    fileSystem: options.fileSystem,
    idAllocator: options.idAllocator,
    serverConfig: options.serverConfig,
    selfInvocation: options.selfInvocation,
    ...(options.nativeLogging === undefined ? {} : { nativeLogging: options.nativeLogging }),
  });
}

export type JcodeAdapterV2DriverEnv =
  | ChildProcessSpawner.ChildProcessSpawner
  | Crypto.Crypto
  | FileSystem.FileSystem
  | IdAllocator.IdAllocatorV2
  | Path.Path
  | ProviderEventLoggers.ProviderEventLoggers
  | ServerConfig.ServerConfig;

export const JcodeAdapterV2Driver: ProviderAdapterDriver<JcodeSettings, JcodeAdapterV2DriverEnv> = {
  driverKind: JCODE_DRIVER_KIND,
  configSchema: JcodeSettings,
  defaultConfig: (): JcodeSettings => DEFAULT_JCODE_SETTINGS,
  create: Effect.fn("JcodeAdapterV2Driver.create")(
    function* (input: ProviderAdapterDriverCreateInput<JcodeSettings>) {
      const hostEnvironment = yield* HostProcessEnvironment;
      const selfInvocation = yield* resolveSelfInvocation();
      const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const crypto = yield* Crypto.Crypto;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const idAllocator = yield* IdAllocator.IdAllocatorV2;
      const providerEventLoggers = yield* ProviderEventLoggers.ProviderEventLoggers;
      const serverConfig = yield* ServerConfig.ServerConfig;
      const makeNativeLogger = yield* makeAcpNativeLoggerFactory();
      return makeJcodeAdapterV2({
        instanceId: input.instanceId,
        settings: { ...input.config, enabled: input.enabled },
        environment: mergeProviderInstanceEnvironment(input.environment, hostEnvironment),
        childProcessSpawner,
        crypto,
        fileSystem,
        path,
        idAllocator,
        serverConfig,
        selfInvocation,
        nativeLogging: (threadId) =>
          makeNativeLogger({
            nativeEventLogger: providerEventLoggers.native,
            provider: JCODE_PROVIDER,
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
};
