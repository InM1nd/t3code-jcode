import { PaperclipIcon } from "lucide-react";
import type { RefObject } from "react";

import type { ChatComposerHandle } from "./components/chat/ChatComposer";
import { ITEM_ICON_CLASS, type CommandPaletteActionItem } from "./components/CommandPalette.logic";

/**
 * Command palette entry for the composer file picker.
 * The command id matches keybindings saved by the previous app. It has no
 * default chord: mod+shift+a switches work mode.
 */
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
      input.composerHandleRef?.current?.openFilePicker();
    },
  };
}
