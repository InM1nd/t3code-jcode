import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Scope from "effect/Scope";

import { startJcodeSessionRoute } from "./JcodeAdapter.ts";

describe("startJcodeSessionRoute", () => {
  it.effect("propagates ACP model mismatch and closes both owned startup resources", () =>
    Effect.gen(function* () {
      const finalized: string[] = [];
      let sessionReturned = false;
      const sessionScope = yield* Scope.make("sequential");

      const error = yield* startJcodeSessionRoute({
        threadId: ThreadId.make("thread-route-mismatch"),
        provider: "cursor",
        requestedModelId: "cursor-grok-4.6-high-fast",
        runtimeModelId: "grok-4.6-high-fast",
        sessionScope,
        discoverModels: Effect.succeed([{ slug: "cursor-grok-4.6-high-fast" }]),
        startDaemon: Effect.addFinalizer(() =>
          Effect.sync(() => {
            finalized.push("daemon");
          }),
        ).pipe(
          Effect.provideService(Scope.Scope, sessionScope),
          Effect.as("/tmp/jcode-route.sock"),
        ),
        startAcp: (socketPath) =>
          Effect.gen(function* () {
            expect(socketPath).toBe("/tmp/jcode-route.sock");
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                finalized.push("acp");
              }),
            );
            return {
              resource: { socketPath },
              started: {
                sessionSetupResult: {
                  sessionId: "acp-session" as never,
                  models: {
                    availableModels: [],
                    currentModelId: "claude-opus-5",
                  },
                },
              },
            };
          }).pipe(Effect.provideService(Scope.Scope, sessionScope)),
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            sessionReturned = true;
          }),
        ),
        Effect.flip,
      );

      expect(error).toMatchObject({
        _tag: "ProviderAdapterValidationError",
        operation: "startSession",
        issue: expect.stringContaining(
          "requested provider 'cursor' and model 'cursor-grok-4.6-high-fast' (runtime 'grok-4.6-high-fast'), but ACP reported model 'claude-opus-5'",
        ),
      });
      expect(finalized.sort()).toEqual(["acp", "daemon"]);
      expect(sessionReturned).toBe(false);
    }),
  );
});
