import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schedule from "effect/Schedule";
import { ChildProcess, type ChildProcessSpawner } from "effect/unstable/process";

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

  yield* fileSystem.makeDirectory(path.dirname(spawn.socketPath), { recursive: true });
  yield* fileSystem.remove(spawn.socketPath, { force: true });
  yield* Effect.addFinalizer(() =>
    fileSystem.remove(spawn.socketPath, { force: true }).pipe(Effect.ignore),
  );

  const handle = yield* spawner.spawn(
    ChildProcess.make(spawn.command, spawn.args, {
      ...(spawn.cwd ? { cwd: spawn.cwd } : {}),
      ...(spawn.env ? { env: spawn.env, extendEnv: true } : {}),
    }),
  );

  yield* fileSystem
    .exists(spawn.socketPath)
    .pipe(
      Effect.repeat({ schedule: Schedule.spaced("10 millis"), until: Boolean }),
      Effect.timeout("5 seconds"),
    );

  return { handle, socketPath: spawn.socketPath };
});
