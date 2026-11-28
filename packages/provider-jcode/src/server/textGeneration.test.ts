import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import { JcodeSettings } from "../settings.ts";
import { makeJcodeAcpRuntime, makeJcodeTextGeneration } from "../testing.ts";

const decodeSettings = Schema.decodeSync(JcodeSettings);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const decodeRequest = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      id: Schema.Union([Schema.String, Schema.Number]),
      method: Schema.String,
    }),
  ),
);

const layerTextGenerationTest = Layer.mergeAll(NodeServices.layer, NodeCrypto.layer);

function makeFakeAcpSpawner(replyJson: string, spawnedArgs: Array<ReadonlyArray<string>>) {
  return ChildProcessSpawner.make((command) =>
    Effect.gen(function* () {
      if (ChildProcess.isStandardCommand(command)) {
        spawnedArgs.push(command.args.map((arg) => (typeof arg === "string" ? arg : String(arg))));
      }
      const output = yield* Queue.unbounded<Uint8Array>();
      const exited = yield* Deferred.make<ChildProcessSpawner.ExitCode>();
      let buffer = "";

      const emit = (payload: unknown) =>
        Queue.offer(output, encoder.encode(`${JSON.stringify(payload)}\n`)).pipe(Effect.asVoid);

      const handleLine = (line: string) =>
        Effect.gen(function* () {
          const trimmed = line.trim();
          if (!trimmed) return;
          const request = decodeRequest(trimmed);
          if (request.method === "initialize") {
            yield* emit({
              jsonrpc: "2.0",
              id: request.id,
              result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] },
            });
            return;
          }
          if (request.method === "session/new") {
            yield* emit({
              jsonrpc: "2.0",
              id: request.id,
              result: { sessionId: "jcode-test-session" },
            });
            return;
          }
          if (request.method === "session/prompt") {
            yield* emit({
              jsonrpc: "2.0",
              method: "session/update",
              params: {
                sessionId: "jcode-test-session",
                update: {
                  sessionUpdate: "agent_message_chunk",
                  content: { type: "text", text: replyJson },
                },
              },
            });
            yield* emit({
              jsonrpc: "2.0",
              id: request.id,
              result: { stopReason: "end_turn" },
            });
          }
        });

      const stdin = Sink.forEach<Uint8Array, void, never, never>((chunk) =>
        Effect.gen(function* () {
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            yield* handleLine(line);
          }
        }),
      );

      const terminate = Deferred.succeed(exited, ChildProcessSpawner.ExitCode(0)).pipe(
        Effect.andThen(Queue.shutdown(output)),
        Effect.asVoid,
      );

      return ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(900_000_202),
        exitCode: Deferred.await(exited),
        isRunning: Effect.map(Deferred.isDone(exited), (done) => !done),
        kill: () => terminate,
        unref: Effect.succeed(Effect.void),
        stdin,
        stdout: Stream.fromQueue(output),
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
      });
    }),
  );
}

it.layer(layerTextGenerationTest)("JcodeTextGeneration", (it) => {
  it.effect(
    "implements all ProviderTextGeneration operations and rejects investigation-only review guides",
    () =>
      Effect.gen(function* () {
        const spawnedArgs: Array<ReadonlyArray<string>> = [];
        const spawner = makeFakeAcpSpawner(
          JSON.stringify({ branch: "feat/jcode-package" }),
          spawnedArgs,
        );
        const textGeneration = yield* makeJcodeTextGeneration(
          decodeSettings({ binaryPath: "/usr/local/bin/jcode" }),
          {},
        ).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner));

        assert.isFunction(textGeneration.generateCommitMessage);
        assert.isFunction(textGeneration.generatePrContent);
        assert.isFunction(textGeneration.generateBranchName);
        assert.isFunction(textGeneration.generateThreadTitle);
        assert.isFunction(textGeneration.generateTranscriptionPostProcessing);
        assert.isFunction(textGeneration.generateReviewGuide);

        const modelSelection = createModelSelection(
          ProviderInstanceId.make("jcode"),
          "claude-opus-5",
        );

        const branch = yield* textGeneration.generateBranchName({
          cwd: process.cwd(),
          message: "Package jcode as a standalone provider package",
          modelSelection,
        });
        assert.equal(branch.branch, "feat/jcode-package");
        assert.isNotEmpty(spawnedArgs);
        assert.include(spawnedArgs[0] ?? [], "acp");

        const reviewResult = yield* textGeneration
          .generateReviewGuide({
            cwd: process.cwd(),
            projectCwd: process.cwd(),
            number: 42,
            title: "Package Jcode provider",
            description: "Port Jcode to @t3tools/provider-jcode",
            baseBranch: "main",
            baseCommit: "0000000000000000000000000000000000000000",
            settledReview: "",
            modelSelection,
          })
          .pipe(Effect.result);
        assert.isTrue(Result.isFailure(reviewResult));
        if (Result.isFailure(reviewResult)) {
          assert.include(reviewResult.failure.detail, "Jcode");
        }
      }),
  );

  it.effect("exposes makeJcodeAcpRuntime via testing entrypoint", () =>
    Effect.gen(function* () {
      const spawnedArgs: Array<ReadonlyArray<string>> = [];
      const spawner = makeFakeAcpSpawner("{}", spawnedArgs);
      const runtime = yield* makeJcodeAcpRuntime({
        jcodeSettings: decodeSettings({}),
        environment: {},
        cwd: process.cwd(),
        clientInfo: { name: "test-jcode-runtime", version: "0.0.0" },
      }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner));
      assert.isFunction(runtime.start);
      assert.isFunction(runtime.prompt);
    }).pipe(Effect.scoped),
  );
});
