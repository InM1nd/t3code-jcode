import { ProjectId, TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { latestBoardTurnId, resolveCallerBoardProject } from "./projectScope.ts";

const own = ProjectId.make("own");
const other = ProjectId.make("other");

describe("resolveCallerBoardProject", () => {
  it("uses the calling thread when no project is named", () => {
    expect(resolveCallerBoardProject({ callerProjectId: own, requestedProjectId: undefined })).toBe(
      own,
    );
  });

  it("keeps an explicit id that matches the calling thread", () => {
    expect(resolveCallerBoardProject({ callerProjectId: own, requestedProjectId: own })).toBe(own);
  });

  it("refuses a thread that names another project", () => {
    expect(resolveCallerBoardProject({ callerProjectId: own, requestedProjectId: other })).toBe(
      "mismatch",
    );
  });

  it("lets a client outside a thread name a project", () => {
    expect(
      resolveCallerBoardProject({ callerProjectId: undefined, requestedProjectId: other }),
    ).toBe(other);
  });

  it("asks for a project when nothing identifies one", () => {
    expect(
      resolveCallerBoardProject({ callerProjectId: undefined, requestedProjectId: undefined }),
    ).toBe("missing");
  });
});

describe("latestBoardTurnId", () => {
  it("picks the highest ordinal", () => {
    expect(
      latestBoardTurnId([
        { id: "early", ordinal: 1 },
        { id: "late", ordinal: 3 },
        { id: "middle", ordinal: 2 },
      ]),
    ).toBe(TurnId.make("late"));
  });

  it("returns nothing when the thread has no turn", () => {
    expect(latestBoardTurnId([])).toBeUndefined();
  });
});
