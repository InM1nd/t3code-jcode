import { ProjectBoardItemId, type ProjectBoardItem } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { boardCardDraftFromItem, boardCardUpsertFields } from "./boardCardDraft.ts";

const item = {
  id: ProjectBoardItemId.make("card-1"),
  title: "Ship the editor",
  status: "blocked",
  notes: "Waiting on review",
  area: "board",
  source: "user",
  sourceThreadId: null,
  brief: {
    goal: "Edit a card",
    acceptanceCriteria: ["Save notes", "Delete"],
    importantFiles: ["BoardCardEditor.tsx"],
    notes: "Keep it short",
  },
  externalRefs: ["https://example.com/issue/1"],
  relatedItemIds: [ProjectBoardItemId.make("card-2")],
} satisfies Pick<
  ProjectBoardItem,
  | "id"
  | "title"
  | "notes"
  | "status"
  | "area"
  | "brief"
  | "externalRefs"
  | "relatedItemIds"
  | "source"
  | "sourceThreadId"
>;

describe("boardCardDraft", () => {
  it("keeps blocked status, the brief, and related cards", () => {
    const draft = boardCardDraftFromItem(item);
    expect(draft.status).toBe("blocked");
    expect(draft.briefCriteria).toBe("Save notes\nDelete");
    expect(boardCardUpsertFields(item, { ...draft, status: "cancelled" })).toMatchObject({
      status: "cancelled",
      notes: "Waiting on review",
      area: "board",
      brief: {
        goal: "Edit a card",
        acceptanceCriteria: ["Save notes", "Delete"],
        importantFiles: ["BoardCardEditor.tsx"],
        notes: "Keep it short",
      },
      externalRefs: ["https://example.com/issue/1"],
      relatedItemIds: [ProjectBoardItemId.make("card-2")],
      source: "user",
    });
  });

  it("clears the brief and drops a self link when the goal is empty", () => {
    const draft = boardCardDraftFromItem(item);
    expect(
      boardCardUpsertFields(item, {
        ...draft,
        briefGoal: "  ",
        notes: " ",
        area: "",
        externalRefs: "",
        relatedItemIds: [item.id, ProjectBoardItemId.make("card-2")],
      }),
    ).toMatchObject({
      brief: null,
      notes: null,
      area: null,
      externalRefs: [],
      relatedItemIds: [ProjectBoardItemId.make("card-2")],
    });
  });

  it("refuses a blank title", () => {
    const draft = boardCardDraftFromItem(item);
    expect(boardCardUpsertFields(item, { ...draft, title: "   " })).toBeNull();
  });
});
