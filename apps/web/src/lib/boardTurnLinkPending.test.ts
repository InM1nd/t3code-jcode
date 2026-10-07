import { ProjectBoardItemId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  consumeBoardItemAwaitingTurnLink,
  markBoardItemAwaitingTurnLink,
  peekBoardItemAwaitingTurnLink,
} from "./boardTurnLinkPending";

describe("boardTurnLinkPending", () => {
  it("returns a mark once", () => {
    const threadId = ThreadId.make("thread-link");
    const itemId = ProjectBoardItemId.make("card-link");
    markBoardItemAwaitingTurnLink(threadId, itemId);
    expect(peekBoardItemAwaitingTurnLink(threadId)).toBe(itemId);
    expect(consumeBoardItemAwaitingTurnLink(threadId)).toBe(itemId);
    expect(consumeBoardItemAwaitingTurnLink(threadId)).toBeNull();
  });
});
