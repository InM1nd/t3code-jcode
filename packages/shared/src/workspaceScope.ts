const CWD_KEYS = new Set([
  "cwd",
  "workdir",
  "working_directory",
  "workingDirectory",
  "workingDir",
  "directory",
]);

const FILE_PATH_KEYS = new Set(["path", "filePath", "newPath", "oldPath"]);

const NESTED_KEYS = ["rawInput", "input", "data", "item", "locations", "changes", "payload"];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeWorkspaceScopePath(path: string): string {
  const unified = path.trim().replaceAll("\\", "/");
  if (unified.length > 1 && unified.endsWith("/")) {
    return unified.slice(0, -1);
  }
  return unified;
}

export function isAbsoluteWorkspaceScopePath(path: string): boolean {
  const normalized = normalizeWorkspaceScopePath(path);
  return normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized);
}

export function isPathInsideWorkspaceScope(path: string, workspaceRoot: string): boolean {
  if (!isAbsoluteWorkspaceScopePath(path)) {
    return true;
  }
  const root = normalizeWorkspaceScopePath(workspaceRoot);
  if (root.length === 0) {
    return true;
  }
  const caseInsensitive = /^[A-Za-z]:\//u.test(root);
  const candidate = caseInsensitive
    ? normalizeWorkspaceScopePath(path).toLowerCase()
    : normalizeWorkspaceScopePath(path);
  const normalizedRoot = caseInsensitive ? root.toLowerCase() : root;
  return candidate === normalizedRoot || candidate.startsWith(`${normalizedRoot}/`);
}

function collectCandidates(
  value: unknown,
  paths: string[],
  seen: Set<string>,
  depth: number,
  includeFilePaths: boolean,
): void {
  if (depth > 5 || paths.length >= 8) {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectCandidates(entry, paths, seen, depth + 1, includeFilePaths);
      if (paths.length >= 8) {
        return;
      }
    }
    return;
  }
  const record = asRecord(value);
  if (!record) {
    return;
  }
  for (const [key, raw] of Object.entries(record)) {
    if (!CWD_KEYS.has(key) && !(includeFilePaths && FILE_PATH_KEYS.has(key))) {
      continue;
    }
    const candidate = asTrimmedString(raw);
    if (!candidate || seen.has(candidate) || !isAbsoluteWorkspaceScopePath(candidate)) {
      continue;
    }
    seen.add(candidate);
    paths.push(candidate);
    if (paths.length >= 8) {
      return;
    }
  }
  for (const nestedKey of NESTED_KEYS) {
    if (!(nestedKey in record)) {
      continue;
    }
    collectCandidates(record[nestedKey], paths, seen, depth + 1, includeFilePaths);
    if (paths.length >= 8) {
      return;
    }
  }
}

export function findOutOfWorkspaceScopePath(input: {
  readonly workspaceRoot: string | null | undefined;
  readonly data: unknown;
  readonly includeFilePaths?: boolean;
}): string | undefined {
  const workspaceRoot = input.workspaceRoot?.trim();
  if (!workspaceRoot) {
    return undefined;
  }
  const candidates: string[] = [];
  collectCandidates(input.data, candidates, new Set<string>(), 0, input.includeFilePaths === true);
  return candidates.find((candidate) => !isPathInsideWorkspaceScope(candidate, workspaceRoot));
}
