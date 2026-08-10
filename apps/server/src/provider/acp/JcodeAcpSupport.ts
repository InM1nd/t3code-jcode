import { type JcodeSettings, ProviderDriverKind } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";
import { normalizeModelSlug } from "@t3tools/shared/model";

import * as AcpSessionRuntime from "./AcpSessionRuntime.ts";

const JCODE_DRIVER_KIND = ProviderDriverKind.make("jcode");
/** Placeholder required by AcpSessionRuntimeOptions; jcode rejects `authenticate`. */
const JCODE_AUTH_METHOD_UNUSED = "jcode";

type JcodeAcpRuntimeJcodeSettings = Pick<
  JcodeSettings,
  "binaryPath" | "model" | "providerProfile" | "jcodeProvider"
>;

interface JcodeAcpRuntimeInput extends Omit<
  AcpSessionRuntime.AcpSessionRuntimeOptions,
  "authMethodId" | "clientCapabilities" | "spawn" | "skipAuthenticate"
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
  const model = jcodeSettings?.model?.trim();
  const providerProfile = jcodeSettings?.providerProfile?.trim();
  const jcodeProvider = jcodeSettings?.jcodeProvider?.trim();
  const args: Array<string> = ["acp", "--no-selfdev"];
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
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildJcodeAcpSpawnInput(input.jcodeSettings, input.cwd, input.environment),
        authMethodId: JCODE_AUTH_METHOD_UNUSED,
        skipAuthenticate: true,
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    return yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(
      Effect.provide(acpContext),
    );
  });

export function resolveJcodeAcpBaseModelId(model: string | null | undefined): string {
  const trimmed = model?.trim();
  const base = trimmed && trimmed.length > 0 ? trimmed : "claude-opus-5";
  return normalizeModelSlug(base, JCODE_DRIVER_KIND) ?? "claude-opus-5";
}

export function currentJcodeModelIdFromSessionSetup(
  sessionSetupResult:
    | EffectAcpSchema.LoadSessionResponse
    | EffectAcpSchema.NewSessionResponse
    | EffectAcpSchema.ResumeSessionResponse,
): string | undefined {
  return sessionSetupResult.models?.currentModelId?.trim() || undefined;
}

/**
 * jcode rejects ACP `session/set_model`. Model is selected only via spawn `-m`
 * (see `buildJcodeAcpSpawnInput`). This helper only resolves the bookkeeping id.
 */
export function applyJcodeAcpModelSelection(input: {
  readonly currentModelId: string | undefined;
  readonly requestedModelId: string | undefined;
}): string | undefined {
  return input.requestedModelId ?? input.currentModelId;
}
