/** Shared mime/extension helpers for non-image chat file attachments. */

export const PROVIDER_SEND_TURN_MAX_FILE_TEXT_CHARS = 256_000;

const TEXT_LIKE_MIME_EXACT = new Set([
  "application/json",
  "application/javascript",
  "application/typescript",
  "application/xml",
  "application/x-javascript",
  "application/x-typescript",
  "application/x-yaml",
  "application/yaml",
  "application/sql",
  "application/graphql",
  "application/x-sh",
  "application/x-bash",
]);

const BINARY_ALLOWED_MIME_EXACT = new Set(["application/pdf"]);

/** Extension → canonical mime used when the browser sends an empty/octet-stream type. */
export const CHAT_FILE_EXTENSION_MIME: Readonly<Record<string, string>> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".jsonc": "application/json",
  ".js": "text/javascript",
  ".jsx": "text/javascript",
  ".mjs": "text/javascript",
  ".cjs": "text/javascript",
  ".ts": "text/typescript",
  ".tsx": "text/tsx",
  ".py": "text/x-python",
  ".rb": "text/x-ruby",
  ".go": "text/x-go",
  ".rs": "text/x-rust",
  ".java": "text/x-java-source",
  ".kt": "text/x-kotlin",
  ".swift": "text/x-swift",
  ".c": "text/x-c",
  ".h": "text/x-c",
  ".cpp": "text/x-c++",
  ".cc": "text/x-c++",
  ".hpp": "text/x-c++",
  ".cs": "text/x-csharp",
  ".php": "text/x-php",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".scss": "text/x-scss",
  ".less": "text/x-less",
  ".xml": "application/xml",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
  ".toml": "text/plain",
  ".ini": "text/plain",
  ".env": "text/plain",
  ".sh": "application/x-sh",
  ".bash": "application/x-bash",
  ".zsh": "application/x-sh",
  ".sql": "application/sql",
  ".graphql": "application/graphql",
  ".vue": "text/plain",
  ".svelte": "text/plain",
  ".pdf": "application/pdf",
  ".log": "text/plain",
  ".diff": "text/plain",
  ".patch": "text/plain",
};

export const SAFE_CHAT_FILE_EXTENSIONS = Object.keys(CHAT_FILE_EXTENSION_MIME);

/** Value for `<input accept>` — images plus allowed file extensions. */
export const CHAT_COMPOSER_FILE_ACCEPT = ["image/*", ...SAFE_CHAT_FILE_EXTENSIONS].join(",");

function extensionOf(fileName: string): string {
  const trimmed = fileName.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) return "";
  return trimmed.slice(dot).toLowerCase();
}

export function resolveChatFileMimeType(input: {
  readonly mimeType: string;
  readonly fileName: string;
}): string | null {
  const fromName = CHAT_FILE_EXTENSION_MIME[extensionOf(input.fileName)];
  const raw = input.mimeType.trim().toLowerCase();
  if (raw.startsWith("image/")) return null;
  if (!raw || raw === "application/octet-stream") {
    return fromName ?? null;
  }
  if (
    raw.startsWith("text/") ||
    TEXT_LIKE_MIME_EXACT.has(raw) ||
    BINARY_ALLOWED_MIME_EXACT.has(raw)
  ) {
    return raw;
  }
  // Browser sometimes sends text/plain for code; prefer extension when known.
  return fromName ?? null;
}

export function isAllowedChatFileMime(mimeType: string): boolean {
  const mime = mimeType.trim().toLowerCase();
  if (mime.startsWith("image/")) return false;
  return (
    mime.startsWith("text/") ||
    TEXT_LIKE_MIME_EXACT.has(mime) ||
    BINARY_ALLOWED_MIME_EXACT.has(mime)
  );
}

export function isTextLikeChatFileMime(mimeType: string): boolean {
  const mime = mimeType.trim().toLowerCase();
  return mime.startsWith("text/") || TEXT_LIKE_MIME_EXACT.has(mime);
}

export function inferChatFileExtension(input: {
  readonly mimeType: string;
  readonly fileName?: string;
}): string {
  const fromName = input.fileName ? extensionOf(input.fileName) : "";
  if (fromName && CHAT_FILE_EXTENSION_MIME[fromName]) {
    return fromName;
  }
  const mime = input.mimeType.trim().toLowerCase();
  for (const [ext, mapped] of Object.entries(CHAT_FILE_EXTENSION_MIME)) {
    if (mapped === mime) return ext;
  }
  if (mime === "application/pdf") return ".pdf";
  if (mime.startsWith("text/")) return ".txt";
  return ".bin";
}
