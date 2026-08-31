/**
 * Reads Cursor's own dashboard session so the usage scan can call the
 * (unofficial) dashboard API without asking the user to sign in separately.
 *
 * Cursor stores its auth token in the same key-value `state.vscdb` every VS
 * Code fork uses for `ItemTable`, under the `cursorAuth/accessToken` key. That
 * file lives at the same relative path on every OS, unlike the `cursor-agent`
 * CLI's own config, so this is read directly rather than via a CLI helper.
 *
 * @module usage/cursorSession
 */
import * as NodeOS from "node:os";
import * as NodeSqlite from "node:sqlite";

import { HostProcessEnvironment, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

export interface CursorSession {
  /** `Cookie` header value for the `cursor.com` dashboard API. */
  readonly cookie: string;
  /** Raw OAuth token: `api2.cursor.sh`'s Connect-RPC endpoints want a Bearer token, not the cookie. */
  readonly accessToken: string;
  readonly userId: string;
}

export class CursorSessionError extends Schema.TaggedErrorClass<CursorSessionError>()(
  "CursorSessionError",
  {
    reason: Schema.Literals(["notLoggedIn", "sessionExpired", "unsupportedPlatform"]),
  },
) {
  override get message(): string {
    switch (this.reason) {
      case "notLoggedIn":
        return "Cursor is not signed in on this machine.";
      case "sessionExpired":
        return "Cursor's session has expired. Sign in to Cursor again.";
      case "unsupportedPlatform":
        return "Cursor usage is not supported on this platform.";
    }
  }
}

/** `state.vscdb`'s directory, one level per OS; same layout every VS Code fork uses. */
export function resolveStateDbPath(
  path: Path.Path,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  homedir: string,
): string | null {
  switch (platform) {
    case "darwin":
      return path.join(
        homedir,
        "Library",
        "Application Support",
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb",
      );
    case "win32": {
      const appData = env["APPDATA"];
      if (!appData) return null;
      return path.join(appData, "Cursor", "User", "globalStorage", "state.vscdb");
    }
    case "linux": {
      const configHome = env["XDG_CONFIG_HOME"] ?? path.join(homedir, ".config");
      return path.join(configHome, "Cursor", "User", "globalStorage", "state.vscdb");
    }
    default:
      return null;
  }
}

function readAccessTokenSync(dbPath: string): string | null {
  const db = new NodeSqlite.DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db
      .prepare("SELECT value FROM ItemTable WHERE key = ?")
      .get("cursorAuth/accessToken") as { value?: unknown } | undefined;
    return typeof row?.value === "string" ? row.value : null;
  } finally {
    db.close();
  }
}

/** Decodes a JWT's payload without verifying the signature: we only read claims from our own stored token, we don't trust it as a bearer of authority here. */
export function parseJwtPayload(token: string): { sub: string; exp: number } | null {
  const segment = token.split(".")[1];
  if (segment === undefined) return null;
  try {
    const payload = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (typeof payload["sub"] !== "string" || typeof payload["exp"] !== "number") return null;
    return { sub: payload["sub"], exp: payload["exp"] };
  } catch {
    return null;
  }
}

export const readCursorSessionToken = Effect.fn("readCursorSessionToken")(
  function* (): Effect.fn.Return<CursorSession, CursorSessionError, Path.Path> {
    const nowMs = yield* Clock.currentTimeMillis;
    const path = yield* Path.Path;
    const platform = yield* HostProcessPlatform;
    const env = yield* HostProcessEnvironment;

    const homedir = env["HOME"]?.trim() || NodeOS.homedir();
    const dbPath = resolveStateDbPath(path, platform, env, homedir);
    if (dbPath === null) {
      return yield* new CursorSessionError({ reason: "unsupportedPlatform" });
    }

    const token = yield* Effect.try({
      try: () => readAccessTokenSync(dbPath),
      catch: () => new CursorSessionError({ reason: "notLoggedIn" }),
    });
    if (token === null) {
      return yield* new CursorSessionError({ reason: "notLoggedIn" });
    }

    const payload = parseJwtPayload(token);
    if (payload === null) {
      return yield* new CursorSessionError({ reason: "notLoggedIn" });
    }
    if (payload.exp * 1000 < nowMs) {
      return yield* new CursorSessionError({ reason: "sessionExpired" });
    }

    return {
      cookie: `WorkosCursorSessionToken=${payload.sub}::${token}`,
      accessToken: token,
      userId: payload.sub,
    };
  },
);
