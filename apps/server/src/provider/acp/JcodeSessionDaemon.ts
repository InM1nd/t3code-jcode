import type { ThreadId } from "@t3tools/contracts";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import { ChildProcess, type ChildProcessSpawner } from "effect/unstable/process";

const JCODE_DAEMON_START_TIMEOUT = "5 seconds";
const JCODE_DAEMON_OUTPUT_LIMIT = 2_000;

export class JcodeSessionDaemonStartError extends Data.TaggedError("JcodeSessionDaemonStartError")<{
  readonly detail: string;
}> {
  override get message(): string {
    return this.detail;
  }
}

function appendBoundedOutput(current: string, chunk: string): string {
  const combined = `${current}${chunk}`;
  return combined.length <= JCODE_DAEMON_OUTPUT_LIMIT
    ? combined
    : combined.slice(combined.length - JCODE_DAEMON_OUTPUT_LIMIT);
}

export interface JcodeSessionDaemonInput {
  readonly threadId: ThreadId | string;
  readonly provider: string;
  readonly model: string;
  readonly cwd?: string;
  readonly socketPath?: string;
  readonly binaryPath?: string;
  readonly providerProfile?: string;
  readonly environment?: NodeJS.ProcessEnv;
}

export function buildJcodeSessionDaemonInput(input: JcodeSessionDaemonInput) {
  const socketPath = input.socketPath ?? `.jcode-${input.threadId}.sock`;
  const args = [
    "serve",
    "--no-selfdev",
    "-p",
    input.provider,
    "-m",
    input.model,
    "--socket",
    socketPath,
  ];
  if (input.providerProfile?.trim()) {
    args.push("--provider-profile", input.providerProfile.trim());
  }
  return {
    command: input.binaryPath?.trim() || "jcode",
    args,
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(input.environment ? { env: input.environment } : {}),
    socketPath,
  };
}

export const startJcodeSessionDaemon = Effect.fn("startJcodeSessionDaemon")(function* (
  input: JcodeSessionDaemonInput,
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawn = buildJcodeSessionDaemonInput(input);
  const resolvedSpawn = yield* resolveSpawnCommand(spawn.command, spawn.args, {
    ...(spawn.env ? { env: spawn.env, extendEnv: true } : {}),
  });

  yield* fileSystem.makeDirectory(path.dirname(spawn.socketPath), { recursive: true });
  yield* fileSystem.remove(spawn.socketPath, { force: true });
  yield* Effect.addFinalizer(() =>
    fileSystem.remove(spawn.socketPath, { force: true }).pipe(Effect.ignore),
  );

  const handle = yield* spawner.spawn(
    ChildProcess.make(resolvedSpawn.command, resolvedSpawn.args, {
      ...(spawn.cwd ? { cwd: spawn.cwd } : {}),
      ...(spawn.env ? { env: spawn.env, extendEnv: true } : {}),
      shell: resolvedSpawn.shell,
    }),
  );

  const output = yield* Ref.make("");
  const outputFiber = yield* handle.all.pipe(
    Stream.decodeText(),
    Stream.runForEach((chunk) =>
      Ref.update(output, (current) => appendBoundedOutput(current, chunk)),
    ),
    Effect.ignore,
    Effect.forkScoped,
  );

  const socketReady = fileSystem.exists(spawn.socketPath).pipe(
    Effect.repeat({ schedule: Schedule.spaced("10 millis"), until: Boolean }),
    Effect.timeoutOption(JCODE_DAEMON_START_TIMEOUT),
    Effect.flatMap((ready) =>
      Option.isSome(ready)
        ? Effect.void
        : Ref.get(output).pipe(
            Effect.flatMap(
              (captured) =>
                new JcodeSessionDaemonStartError({
                  detail: `Jcode daemon did not create socket '${spawn.socketPath}' within ${JCODE_DAEMON_START_TIMEOUT}.${captured.trim() ? ` Output: ${captured.trim()}` : ""}`,
                }),
            ),
          ),
    ),
  );
  const childExited = handle.exitCode.pipe(
    Effect.flatMap((code) => Fiber.join(outputFiber).pipe(Effect.as(code))),
    Effect.flatMap((code) =>
      Ref.get(output).pipe(
        Effect.flatMap(
          (captured) =>
            new JcodeSessionDaemonStartError({
              detail: `Jcode daemon exited with code ${String(Number(code))} before creating socket '${spawn.socketPath}'.${captured.trim() ? ` Output: ${captured.trim()}` : ""}`,
            }),
        ),
      ),
    ),
  );

  yield* Effect.raceFirst(socketReady, childExited);

  return { handle, socketPath: spawn.socketPath };
});
