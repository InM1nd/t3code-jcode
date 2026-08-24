import { PaperclipIcon } from "lucide-react";
import type { RefObject } from "react";

import type { ChatComposerHandle } from "./components/chat/ChatComposer";
import type { CommandPaletteActionItem } from "./components/CommandPalette.logic";
import { ITEM_ICON_CLASS } from "./components/CommandPalette.logic";

/** Fork-owned palette entry; see `projectBoardPalette.tsx` for why it lives here. */
export function buildAttachFilesCommandItem(input: {
  readonly hasComposerTarget: boolean;
  readonly composerHandleRef: RefObject<ChatComposerHandle | null> | null;
}): CommandPaletteActionItem {
  return {
    kind: "action",
    value: "action:attach-composer-images",
    searchTerms: [
      "attach",
      "image",
      "images",
      "photo",
      "upload",
      "file",
      "files",
      "pdf",
      "paperclip",
    ],
    title: "Attach files",
    disabled: !input.hasComposerTarget,
    icon: <PaperclipIcon className={ITEM_ICON_CLASS} />,
    shortcutCommand: "composer.attachImages",
    run: async () => {
      input.composerHandleRef?.current?.openImagePicker();
    },
  };
}
