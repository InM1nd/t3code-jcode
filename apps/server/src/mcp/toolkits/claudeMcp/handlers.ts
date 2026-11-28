import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { enableClaudeMcpServer } from "../../../provider/fork/claudeMcpAuto.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { readCaller } from "../../threadAccess.ts";
import { ClaudeMcpToolkit } from "./tools.ts";

const failure = (message: string) =>
  new OrchestratorMcpFailure({ code: "invalid_request", message });

export const layer = McpToolAccess.toLayer(ClaudeMcpToolkit, {
  mcp_enable: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const { caller } = yield* readCaller();
      if (caller === undefined) return yield* failure("Only an agent in a T3 thread can do this.");
      const result = enableClaudeMcpServer(caller.id, input.name);
      if (!result.ok) return yield* failure(result.message);
      return { server: result.server, loaded: result.loaded };
    }),
  ),
});
