import { type JcodeSettings, type ModelSelection } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import { ChildProcessSpawner } from "effect/process";
import * as EffectAcpErrors from "effect-acp/errors";
import {
  inferJcodeInnerProviderId,
  resolveJcodeInnerProvider,
} from "@t3tools/shared/jcodeInnerProvider";
import { getModelSelectionStringOptionValue } from "@t3tools/shared/model";

import * as AcpSessionRuntime from "./AcpSessionRuntime.ts";

/** Placeholder required by AcpSessionRuntimeOptions; jcode rejects `authenticate`. */
const JCODE_AUTH_METHOD_UNUSED = "jcode";

type JcodeAcpRuntimeJcodeSettings = Pick<
  JcodeSettings,
  "binaryPath" | "model" | "providerProfile" | "jcodeProvider"
> & { readonly socketPath?: string };

export function resolveJcodeRuntimeModelId(
  _provider: string | undefined,
  model: string | undefined,
): string | undefined {
  return model?.trim() || undefined;
}

interface JcodeAcpRuntimeInput extends Omit<
  AcpSessionRuntime.AcpSessionRuntimeOptions,
  "authMethodId" | "spawn" | "skipAuthenticate" | "mcpServers" | "acpMcpServers"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly jcodeSettings: JcodeAcpRuntimeJcodeSettings | null | undefined;
  readonly environment?: NodeJS.ProcessEnv;
}

export function buildJcodeAcpSpawnInput(
  jcodeSettings: JcodeAcpRuntimeJcodeSettings | null | undefined,
  cwd: string,
  environment?: NodeJS.ProcessEnv,
): AcpSessionRuntime.AcpSpawnInput {
  const model = resolveJcodeRuntimeModelId(jcodeSettings?.jcodeProvider, jcodeSettings?.model);
  const providerProfile = jcodeSettings?.providerProfile?.trim();
  const jcodeProvider = jcodeSettings?.jcodeProvider?.trim();
  const args: Array<string> = ["acp", "--no-selfdev"];
  if (jcodeSettings?.socketPath?.trim()) {
    args.push("--socket", jcodeSettings.socketPath.trim());
  }
  if (jcodeProvider) {
    args.push("-p", jcodeProvider);
  }
  if (providerProfile) {
    args.push("--provider-profile", providerProfile);
  }
  if (model) {
    args.push("-m", model);
  }
  return {
    command: jcodeSettings?.binaryPath?.trim() || "jcode",
    args,
    cwd,
    ...(environment ? { env: environment } : {}),
  };
}

export const makeJcodeAcpRuntime = (
  input: JcodeAcpRuntimeInput,
): Effect.Effect<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  EffectAcpErrors.AcpError,
  Crypto.Crypto | Scope.Scope
> =>
  Effect.gen(function* () {
    const { childProcessSpawner, jcodeSettings, environment, ...session } = input;
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...session,
        // jcode rejects ACP mcpServers and loads tools from .jcode/mcp.json.
        mcpServers: [],
        spawn: buildJcodeAcpSpawnInput(jcodeSettings, session.cwd, environment),
        authMethodId: JCODE_AUTH_METHOD_UNUSED,
        authenticateOnAuthRequired: false,
      }).pipe(
        Layer.provide(Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, childProcessSpawner)),
      ),
    );
    return yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(
      Effect.provide(acpContext),
    );
  });

export function resolveJcodeAcpBaseModelId(model: string | null | undefined): string {
  const trimmed = model?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "claude-opus-5";
}

export function resolveJcodeAcpProvider(
  modelSelection: ModelSelection | null | undefined,
): string | undefined {
  return resolveJcodeInnerProvider(
    getModelSelectionStringOptionValue(modelSelection, "jcodeProvider"),
  )?.id;
}

/**
 * Provider for an isolated `jcode serve`. An explicit selection wins, then the
 * instance setting, then the model slug. Undefined means the turn must not
 * fall through to the shared daemon.
 */
export function resolveJcodeLaunchProvider(input: {
  readonly modelSelection: ModelSelection | null | undefined;
  readonly settingsProvider?: string | null;
  readonly fallbackModel?: string | null;
}): string | undefined {
  const explicit = resolveJcodeAcpProvider(input.modelSelection);
  if (explicit) return explicit;
  const configured = input.settingsProvider?.trim();
  if (configured) return configured;
  return inferJcodeInnerProviderId(input.modelSelection?.model ?? input.fallbackModel);
}

export function currentJcodeModelIdFromSessionSetup(sessionSetupResult: {
  readonly models?: { readonly currentModelId?: string | null } | null;
}): string | undefined {
  return sessionSetupResult.models?.currentModelId?.trim() || undefined;
}

/**
 * jcode rejects ACP `session/set_model`. Model is selected only via spawn `-m`
 * (see `buildJcodeAcpSpawnInput`). This helper validates the reported id.
 */
export function applyJcodeAcpModelSelection(input: {
  readonly currentModelId: string | undefined;
  readonly requestedModelId: string | undefined;
}): string | undefined {
  if (input.requestedModelId !== undefined && input.currentModelId !== input.requestedModelId) {
    return undefined;
  }
  return input.currentModelId ?? input.requestedModelId;
}
