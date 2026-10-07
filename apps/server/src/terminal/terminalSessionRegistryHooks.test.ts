/**
 * Confirms TerminalManager's persistSessionPid/clearSessionPid option hooks
 * (see ./Manager.ts and ../persistence/TerminalSessionRegistry.ts) fire at
 * the right lifecycle points, using the existing makeWithOptions test seam.
 * A fork test file, not appended to the upstream Manager.test.ts.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { DEFAULT_TERMINAL_ID, type TerminalOpenInput } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ProcessRunner from "../processRunner.ts";
import * as TerminalManager from "./Manager.ts";
import * as PtyAdapter from "./PtyAdapter.ts";

class FakePtyProcess implements PtyAdapter.PtyProcess {
  readonly pid: number;
  private readonly exitListeners = new Set<(event: PtyAdapter.PtyExitEvent) => void>();

  constructor(pid: number) {
    this.pid = pid;
  }

  write(): void {}
  resize(): void {}
  kill(): void {}
  onData(): () => void {
    return () => {};
  }
  onExit(callback: (event: PtyAdapter.PtyExitEvent) => void): () => void {
    this.exitListeners.add(callback);
    return () => this.exitListeners.delete(callback);
  }
  emitExit(event: PtyAdapter.PtyExitEvent): void {
    for (const listener of this.exitListeners) listener(event);
  }
}

class FakePtyAdapter {
  readonly processes: FakePtyProcess[] = [];
  private nextPid = 9000;

  spawn(): Effect.Effect<PtyAdapter.PtyProcess, PtyAdapter.PtySpawnError> {
    const process = new FakePtyProcess(this.nextPid++);
    this.processes.push(process);
    return Effect.succeed(process);
  }
}

function openInput(overrides: Partial<TerminalOpenInput> = {}): TerminalOpenInput {
  return {
    threadId: "thread-1",
    terminalId: DEFAULT_TERMINAL_ID,
    cwd: process.cwd(),
    cols: 100,
    rows: 24,
    ...overrides,
  };
}

it.layer(
  Layer.merge(NodeServices.layer, ProcessRunner.layer.pipe(Layer.provide(NodeServices.layer))),
  { excludeTestServices: true },
)("TerminalManager session-pid persistence hooks", (it) => {
  it.effect("persistSessionPid fires once on a successful spawn", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { join } = yield* Path.Path;
      const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-terminal-hooks-" });
      const ptyAdapter = new FakePtyAdapter();
      const persistCalls: Array<{ threadId: string; terminalId: string; pid: number }> = [];

      const manager = yield* TerminalManager.makeWithOptions({
        logsDir: join(baseDir, "logs"),
        ptyAdapter,
        persistSessionPid: (input) =>
          Effect.sync(() =>
            persistCalls.push({
              threadId: input.threadId,
              terminalId: input.terminalId,
              pid: input.pid,
            }),
          ),
      });

      yield* manager.open(openInput());

      assert.strictEqual(persistCalls.length, 1);
      assert.strictEqual(persistCalls[0]?.threadId, "thread-1");
      assert.strictEqual(persistCalls[0]?.pid, ptyAdapter.processes[0]?.pid);
    }),
  );

  it.effect("clearSessionPid fires once when the session is explicitly closed", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { join } = yield* Path.Path;
      const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-terminal-hooks-" });
      const ptyAdapter = new FakePtyAdapter();
      const clearCalls: Array<{ threadId: string; terminalId: string }> = [];

      const manager = yield* TerminalManager.makeWithOptions({
        logsDir: join(baseDir, "logs"),
        ptyAdapter,
        clearSessionPid: (input) =>
          Effect.sync(() =>
            clearCalls.push({ threadId: input.threadId, terminalId: input.terminalId }),
          ),
      });

      yield* manager.open(openInput());
      yield* manager.close({ threadId: "thread-1" });

      assert.ok(clearCalls.length >= 1);
      assert.strictEqual(clearCalls[0]?.threadId, "thread-1");
    }),
  );

  it.effect("clearSessionPid fires when the process exits on its own", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { join } = yield* Path.Path;
      const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-terminal-hooks-" });
      const ptyAdapter = new FakePtyAdapter();
      const clearCalls: Array<{ threadId: string; terminalId: string }> = [];

      const manager = yield* TerminalManager.makeWithOptions({
        logsDir: join(baseDir, "logs"),
        ptyAdapter,
        clearSessionPid: (input) =>
          Effect.sync(() =>
            clearCalls.push({ threadId: input.threadId, terminalId: input.terminalId }),
          ),
      });

      yield* manager.open(openInput());
      const spawned = ptyAdapter.processes[0];
      assert.ok(spawned !== undefined);
      spawned?.emitExit({ exitCode: 0, signal: 0 });

      yield* Effect.sleep(20);

      assert.strictEqual(clearCalls.length, 1);
      assert.strictEqual(clearCalls[0]?.threadId, "thread-1");
    }),
  );
});
