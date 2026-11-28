import { TextGenerationError } from "@t3tools/contracts";
import type { ProviderTextGeneration } from "@t3tools/provider-core/server/textGeneration";
import * as TextGenerationOperations from "@t3tools/provider-core/server/textGenerationOperations";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import type * as EffectAcpErrors from "effect-acp/errors";

import type { JcodeSettings } from "../settings.ts";
import {
  makeJcodeAcpRuntime,
  resolveJcodeAcpBaseModelId,
  resolveJcodeLaunchProvider,
} from "./acpSupport.ts";

const JCODE_TIMEOUT_MS = 180_000;

const isTextGenerationError = Schema.is(TextGenerationError);

export const makeJcodeTextGeneration = Effect.fn("makeJcodeTextGeneration")(function* (
  jcodeSettings: JcodeSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<
  ProviderTextGeneration,
  never,
  SecureRandom.SecureRandom | ChildProcessSpawner.ChildProcessSpawner
> {
  const random = yield* SecureRandom.SecureRandom;
  const commandSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const runJcodeJson: TextGenerationOperations.Runner = Effect.fn(
    "JcodeTextGeneration.runJcodeJson",
  )(
    function* (request) {
      const { operation, cwd, prompt, modelSelection } = request;
      const resolvedModel = resolveJcodeAcpBaseModelId(modelSelection.model);
      const resolvedProvider = resolveJcodeLaunchProvider({
        modelSelection,
        settingsProvider: jcodeSettings.jcodeProvider,
        fallbackModel: resolvedModel,
      });
      const outputRef = yield* Ref.make("");
      const runtime = yield* makeJcodeAcpRuntime({
        jcodeSettings: {
          ...jcodeSettings,
          model: resolvedModel,
          ...(resolvedProvider ? { jcodeProvider: resolvedProvider } : {}),
        },
        environment,
        cwd,
        clientInfo: { name: "t3-code-jcode-git-text", version: "0.0.0" },
      }).pipe(
        Effect.provideService(SecureRandom.SecureRandom, random),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, commandSpawner),
      );

      yield* runtime.handleRequestPermission(() =>
        Effect.succeed({ outcome: { outcome: "cancelled" as const } }),
      );

      yield* runtime.handleSessionUpdate((notification) => {
        const update = notification.update;
        if (update.sessionUpdate !== "agent_message_chunk") {
          return Effect.void;
        }
        const content = update.content;
        if (content.type !== "text") {
          return Effect.void;
        }
        return Ref.update(outputRef, (current) => current + content.text);
      });

      const promptResult = yield* Effect.gen(function* () {
        yield* runtime.start();
        return yield* runtime.prompt({
          prompt: [{ type: "text", text: prompt }],
        });
      }).pipe(
        Effect.timeoutOption(JCODE_TIMEOUT_MS),
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.fail(
                new TextGenerationError({ operation, detail: "Jcode ACP request timed out." }),
              ),
            onSome: (value) => Effect.succeed(value),
          }),
        ),
        Effect.mapError((cause: EffectAcpErrors.AcpError | TextGenerationError) =>
          isTextGenerationError(cause)
            ? cause
            : new TextGenerationError({
                operation,
                detail: "Jcode ACP request failed.",
                cause,
              }),
        ),
      );

      const trimmed = (yield* Ref.get(outputRef)).trim();
      if (!trimmed) {
        return yield* new TextGenerationError({
          operation,
          detail:
            promptResult.stopReason === "cancelled"
              ? "Jcode ACP request was cancelled."
              : "Jcode Agent returned empty output.",
        });
      }

      return yield* TextGenerationOperations.decodeJsonReply(request, "Jcode Agent", trimmed);
    },
    (effect, request) => {
      const { operation } = request;
      return effect.pipe(
        Effect.mapError((cause) =>
          isTextGenerationError(cause)
            ? cause
            : new TextGenerationError({
                operation,
                detail: "Jcode ACP text generation failed.",
                cause,
              }),
        ),
        Effect.scoped,
      );
    },
  );

  return TextGenerationOperations.fromRunner(
    "JcodeTextGeneration",
    TextGenerationOperations.withoutInvestigation("Jcode", runJcodeJson),
  );
});
