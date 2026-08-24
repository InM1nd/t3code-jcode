import * as NodeSqlite from "node:sqlite";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { HostProcessEnvironment, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as TestClock from "effect/testing/TestClock";

import { parseJwtPayload, readCursorSessionToken, resolveStateDbPath } from "./cursorSession.ts";

/** Fixed so `payload.exp` comparisons are deterministic instead of racing wall-clock time. */
const NOW_MS = Date.parse("2026-01-01T00:00:00.000Z");

function fakeJwt(payload: Record<string, unknown>): string {
  const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${segment({ alg: "none" })}.${segment(payload)}.signature`;
}

/**
 * Writes a real `state.vscdb` so `readCursorSessionToken` reads it the same
 * way Cursor's own editor would leave it on disk. The parent directory must
 * already exist.
 */
function writeStateDb(dbPath: string, accessToken: string | null): void {
  const db = new NodeSqlite.DatabaseSync(dbPath);
  try {
    db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)");
    if (accessToken !== null) {
      db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
        "cursorAuth/accessToken",
        accessToken,
      );
    }
  } finally {
    db.close();
  }
}

describe("parseJwtPayload", () => {
  it("reads sub and exp from a well-formed token", () => {
    const token = fakeJwt({ sub: "user_123", exp: 4102444800 });
    expect(parseJwtPayload(token)).toEqual({ sub: "user_123", exp: 4102444800 });
  });

  it("returns null for a token that is not three dot-separated segments", () => {
    expect(parseJwtPayload("not-a-jwt")).toBeNull();
  });

  it("returns null when the payload segment is not valid base64url JSON", () => {
    expect(parseJwtPayload("header.!!!not-base64!!!.signature")).toBeNull();
  });

  it("returns null when sub or exp are missing", () => {
    expect(parseJwtPayload(fakeJwt({ sub: "user_123" }))).toBeNull();
    expect(parseJwtPayload(fakeJwt({ exp: 4102444800 }))).toBeNull();
  });
});

it.layer(NodeServices.layer)("cursorSession", (it) => {
  describe("resolveStateDbPath", () => {
    it.effect("resolves the macOS path under Application Support", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        expect(resolveStateDbPath(path, "darwin", {}, "/Users/theo")).toBe(
          path.join(
            "/Users/theo",
            "Library",
            "Application Support",
            "Cursor",
            "User",
            "globalStorage",
            "state.vscdb",
          ),
        );
      }),
    );

    it.effect("resolves the Windows path from APPDATA", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const appData = "C:\\Users\\theo\\AppData\\Roaming";
        expect(resolveStateDbPath(path, "win32", { APPDATA: appData }, "C:\\Users\\theo")).toBe(
          path.join(appData, "Cursor", "User", "globalStorage", "state.vscdb"),
        );
      }),
    );

    it.effect("returns null on Windows without APPDATA", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        expect(resolveStateDbPath(path, "win32", {}, "C:\\Users\\theo")).toBeNull();
      }),
    );

    it.effect("resolves the Linux path from XDG_CONFIG_HOME", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        expect(
          resolveStateDbPath(
            path,
            "linux",
            { XDG_CONFIG_HOME: "/home/theo/.config" },
            "/home/theo",
          ),
        ).toBe(path.join("/home/theo/.config", "Cursor", "User", "globalStorage", "state.vscdb"));
      }),
    );

    it.effect("falls back to ~/.config on Linux without XDG_CONFIG_HOME", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        expect(resolveStateDbPath(path, "linux", {}, "/home/theo")).toBe(
          path.join("/home/theo", ".config", "Cursor", "User", "globalStorage", "state.vscdb"),
        );
      }),
    );

    it.effect("returns null on an unsupported platform", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        expect(resolveStateDbPath(path, "sunos", {}, "/home/theo")).toBeNull();
      }),
    );
  });

  describe("readCursorSessionToken", () => {
    it.effect("fails with notLoggedIn when state.vscdb does not exist", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const homedir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "t3code-cursor-home-",
        });

        const error = yield* Effect.flip(
          readCursorSessionToken().pipe(
            Effect.provideService(HostProcessPlatform, "linux"),
            Effect.provideService(HostProcessEnvironment, { HOME: homedir }),
          ),
        );
        expect(error.reason).toBe("notLoggedIn");
      }),
    );

    it.effect("fails with notLoggedIn when the access token key is absent", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const homedir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "t3code-cursor-home-",
        });
        const storageDir = path.join(homedir, ".config", "Cursor", "User", "globalStorage");
        yield* fileSystem.makeDirectory(storageDir, { recursive: true });
        writeStateDb(path.join(storageDir, "state.vscdb"), null);

        const error = yield* Effect.flip(
          readCursorSessionToken().pipe(
            Effect.provideService(HostProcessPlatform, "linux"),
            Effect.provideService(HostProcessEnvironment, { HOME: homedir }),
          ),
        );
        expect(error.reason).toBe("notLoggedIn");
      }),
    );

    it.effect("fails with sessionExpired for a token whose exp has passed", () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW_MS);
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const homedir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "t3code-cursor-home-",
        });
        const storageDir = path.join(homedir, ".config", "Cursor", "User", "globalStorage");
        yield* fileSystem.makeDirectory(storageDir, { recursive: true });
        writeStateDb(
          path.join(storageDir, "state.vscdb"),
          fakeJwt({ sub: "user_123", exp: 1000000000 }),
        );

        const error = yield* Effect.flip(
          readCursorSessionToken().pipe(
            Effect.provideService(HostProcessPlatform, "linux"),
            Effect.provideService(HostProcessEnvironment, { HOME: homedir }),
          ),
        );
        expect(error.reason).toBe("sessionExpired");
      }),
    );

    it.effect("returns a dashboard cookie and userId for a live token", () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW_MS);
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const homedir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "t3code-cursor-home-",
        });
        const storageDir = path.join(homedir, ".config", "Cursor", "User", "globalStorage");
        yield* fileSystem.makeDirectory(storageDir, { recursive: true });
        const token = fakeJwt({ sub: "user_123", exp: 4102444800 });
        writeStateDb(path.join(storageDir, "state.vscdb"), token);

        const session = yield* readCursorSessionToken().pipe(
          Effect.provideService(HostProcessPlatform, "linux"),
          Effect.provideService(HostProcessEnvironment, { HOME: homedir }),
        );
        expect(session.userId).toBe("user_123");
        expect(session.cookie).toBe(`WorkosCursorSessionToken=user_123::${token}`);
      }),
    );
  });
});
