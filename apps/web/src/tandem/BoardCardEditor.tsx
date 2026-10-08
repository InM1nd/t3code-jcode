import { ProjectBoardItemId, type ProjectBoardItem } from "@t3tools/contracts";
import { useState } from "react";

import {
  PROJECT_BOARD_STATUS_ORDER,
  projectBoardItemDisplayTitle,
  projectBoardStatusLabel,
} from "../components/ProjectBoardPanel.logic";
import { boardCardDraftFromItem, type BoardCardDraft } from "./boardCardDraft";

export function BoardCardEditor(props: {
  readonly item: ProjectBoardItem;
  readonly items: ReadonlyArray<ProjectBoardItem>;
  readonly areas: ReadonlyArray<string>;
  readonly onClose: () => void;
  readonly onSave: (draft: BoardCardDraft) => void;
  readonly onDelete: () => void;
}) {
  const [draft, setDraft] = useState(() => boardCardDraftFromItem(props.item));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const patch = (next: Partial<BoardCardDraft>) => setDraft((current) => ({ ...current, ...next }));

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.title.trim().length === 0) return;
        props.onSave(draft);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium">Card</h3>
        <button type="button" className="text-xs opacity-70" onClick={props.onClose}>
          Back
        </button>
      </div>
      <input
        value={draft.title}
        onChange={(event) => patch({ title: event.target.value })}
        aria-label="Card title"
        className="bg-transparent text-sm outline-none"
      />
      <textarea
        value={draft.notes}
        onChange={(event) => patch({ notes: event.target.value })}
        aria-label="Card notes"
        placeholder="Notes"
        rows={3}
        className="bg-transparent text-xs outline-none"
      />
      <select
        value={draft.status}
        onChange={(event) => patch({ status: event.target.value as ProjectBoardItem["status"] })}
        aria-label="Card status"
        className="bg-transparent text-xs"
      >
        {PROJECT_BOARD_STATUS_ORDER.map((status) => (
          <option key={status} value={status}>
            {projectBoardStatusLabel(status)}
          </option>
        ))}
      </select>
      <input
        value={draft.area}
        onChange={(event) => patch({ area: event.target.value })}
        aria-label="Card area"
        placeholder="Area"
        list="board-card-areas"
        className="bg-transparent text-xs outline-none"
      />
      <datalist id="board-card-areas">
        {props.areas.map((area) => (
          <option key={area} value={area} />
        ))}
      </datalist>
      <input
        value={draft.briefGoal}
        onChange={(event) => patch({ briefGoal: event.target.value })}
        aria-label="Card goal"
        placeholder="Goal"
        className="bg-transparent text-xs outline-none"
      />
      <textarea
        value={draft.briefCriteria}
        onChange={(event) => patch({ briefCriteria: event.target.value })}
        aria-label="Acceptance criteria"
        placeholder="Acceptance criteria, one per line"
        rows={3}
        className="bg-transparent text-xs outline-none"
      />
      <textarea
        value={draft.briefFiles}
        onChange={(event) => patch({ briefFiles: event.target.value })}
        aria-label="Important files"
        placeholder="Important files, one per line"
        rows={2}
        className="bg-transparent text-xs outline-none"
      />
      <textarea
        value={draft.briefNotes}
        onChange={(event) => patch({ briefNotes: event.target.value })}
        aria-label="Brief notes"
        placeholder="Brief notes"
        rows={2}
        className="bg-transparent text-xs outline-none"
      />
      <textarea
        value={draft.externalRefs}
        onChange={(event) => patch({ externalRefs: event.target.value })}
        aria-label="External links"
        placeholder="Links, one per line"
        rows={2}
        className="bg-transparent text-xs outline-none"
      />
      <select
        multiple
        value={[...draft.relatedItemIds]}
        onChange={(event) =>
          patch({
            relatedItemIds: Array.from(event.target.selectedOptions, (option) =>
              ProjectBoardItemId.make(option.value),
            ),
          })
        }
        aria-label="Related cards"
        className="bg-transparent text-xs"
      >
        {props.items
          .filter((candidate) => candidate.id !== props.item.id)
          .map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {projectBoardItemDisplayTitle(candidate.title)}
            </option>
          ))}
      </select>
      <div className="flex gap-2">
        <button type="submit" className="text-xs" disabled={draft.title.trim().length === 0}>
          Save
        </button>
        <button
          type="button"
          className="text-xs opacity-70"
          onClick={() => {
            if (!confirmingDelete) {
              setConfirmingDelete(true);
              return;
            }
            props.onDelete();
          }}
        >
          {confirmingDelete ? "Confirm delete" : "Delete"}
        </button>
      </div>
    </form>
  );
}
