import { describe, expect, it } from "vite-plus/test";

import {
  inferChatFileExtension,
  isAllowedChatFileMime,
  isTextLikeChatFileMime,
  resolveChatFileMimeType,
} from "./chatAttachments.ts";

describe("chatAttachments", () => {
  it("resolves empty browser mime from extension", () => {
    expect(resolveChatFileMimeType({ mimeType: "", fileName: "notes.md" })).toBe("text/markdown");
    expect(
      resolveChatFileMimeType({ mimeType: "application/octet-stream", fileName: "app.ts" }),
    ).toBe("text/typescript");
    expect(resolveChatFileMimeType({ mimeType: "application/pdf", fileName: "doc.pdf" })).toBe(
      "application/pdf",
    );
  });

  it("rejects images and unknown binaries", () => {
    expect(resolveChatFileMimeType({ mimeType: "image/png", fileName: "x.png" })).toBeNull();
    expect(resolveChatFileMimeType({ mimeType: "application/zip", fileName: "x.zip" })).toBeNull();
    expect(isAllowedChatFileMime("application/zip")).toBe(false);
    expect(isAllowedChatFileMime("text/plain")).toBe(true);
  });

  it("classifies text-like vs binary", () => {
    expect(isTextLikeChatFileMime("text/plain")).toBe(true);
    expect(isTextLikeChatFileMime("application/json")).toBe(true);
    expect(isTextLikeChatFileMime("application/pdf")).toBe(false);
  });

  it("infers safe extensions", () => {
    expect(inferChatFileExtension({ mimeType: "application/pdf", fileName: "a.pdf" })).toBe(".pdf");
    expect(inferChatFileExtension({ mimeType: "text/typescript", fileName: "a.ts" })).toBe(".ts");
  });
});
