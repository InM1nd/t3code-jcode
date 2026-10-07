import { createRef } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ChatComposerHandle } from "./components/chat/ChatComposer";
import { buildAttachFilesCommandItem } from "./composerAttachmentsPalette";

describe("buildAttachFilesCommandItem", () => {
  it("stays disabled until a composer can take files", () => {
    const item = buildAttachFilesCommandItem({
      hasComposerTarget: false,
      composerHandleRef: createRef(),
    });

    expect(item.disabled).toBe(true);
    expect(item.value).toBe("action:attach-composer-images");
    expect(item.title).toBe("Attach files");
    expect(item.shortcutCommand).toBe("composer.attachImages");
  });

  it("opens the composer file picker", async () => {
    const openFilePicker = vi.fn();
    const composerHandleRef = createRef<ChatComposerHandle>();
    composerHandleRef.current = { openFilePicker } as unknown as ChatComposerHandle;
    const item = buildAttachFilesCommandItem({
      hasComposerTarget: true,
      composerHandleRef,
    });

    expect(item.disabled).toBe(false);
    await item.run();
    expect(openFilePicker).toHaveBeenCalledOnce();
  });
});
