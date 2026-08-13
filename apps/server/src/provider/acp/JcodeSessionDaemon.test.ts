import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/unstable/process";

import { buildJcodeSessionDaemonInput, startJcodeSessionDaemon } from "./JcodeSessionDaemon.ts";

describe("buildJcodeSessionDaemonInput", () => {
  it("binds an exact provider and model to a dedicated socket", () => {
    expect(
      buildJcodeSessionDaemonInput({
        threadId: "thread-1",
        provider: "cursor",
        model: "cursor-grok-4.6-high-fast",
        socketPath: "/tmp/jcode-thread-1.sock",
      }),
    ).toMatchObject({
      args: [
        "serve",
        "--no-selfdev",
        "-p",
        "cursor",
        "-m",
        "cursor-grok-4.6-high-fast",
        "--socket",
        "/tmp/jcode-thread-1.sock",
      ],
    });
  });
});

describe("startJcodeSessionDaemon", () => {
  it.effect("stops only its scoped child", () =>
    Effect.gen(function* () {
      const killCount = yield* Ref.make(0);
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-jcode-daemon-" });
      const socketPath = path.join(directory, "thread-1.sock");
      const commands: Array<ReadonlyArray<string>> = [];
      const spawner = ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          commands.push((command as { readonly args: ReadonlyArray<string> }).args);
          yield* fileSystem.writeFileString(socketPath, "");
          const handle = ChildProcessSpawner.makeHandle({
            pid: ChildProcessSpawner.ProcessId(42),
            exitCode: Effect.never,
            isRunning: Effect.succeed(true),
            kill: () => Ref.update(killCount, (count) => count + 1),
            unref: Effect.succeed(Effect.void),
            stdin: Sink.drain,
            stdout: Stream.never,
            stderr: Stream.never,
            all: Stream.never,
            getInputFd: () => Sink.drain,
            getOutputFd: () => Stream.empty,
          });
          yield* Effect.addFinalizer(() => handle.kill().pipe(Effect.ignore));
          return handle;
        }),
      );

      yield* Effect.scoped(
        startJcodeSessionDaemon(
          {
            threadId: "thread-1",
            provider: "cursor",
            model: "cursor-grok-4.6-high-fast",
            socketPath,
          },
          spawner,
        ),
      );

      expect(commands[0]).toContain("cursor-grok-4.6-high-fast");
      expect(yield* Ref.get(killCount)).toBe(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
