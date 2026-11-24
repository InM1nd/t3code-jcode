import { OrchestratorMcpFailure, TrimmedNonEmptyString } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import { CLAUDE_MCP_ENABLE_TOOL } from "../../../provider/claudeMcpAuto.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

export const ClaudeMcpToolkit = Toolkit.make(
  Tool.make(CLAUDE_MCP_ENABLE_TOOL, {
    description:
      "Turn on one of the user's MCP servers that is not loaded in this session. Its tools appear within a few seconds, at the latest on the user's next message; if they are not there yet, finish what you can and say so. Only Claude threads with on-demand MCP servers support it.",
    parameters: Schema.Struct({
      name: TrimmedNonEmptyString.annotate({ description: "The MCP server name." }),
    }),
    success: Schema.Struct({ server: Schema.String, loaded: Schema.Array(Schema.String) }),
    failure: OrchestratorMcpFailure,
    failureMode: "return",
    dependencies: [
      McpInvocationContext.McpInvocationContext,
      ThreadManagementService.ThreadManagementService,
    ],
  })
    .annotate(Tool.Readonly, false)
    .annotate(Tool.Destructive, false),
);
