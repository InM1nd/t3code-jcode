import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { isThreadWorking } from "@t3tools/client-runtime/state/thread-inbox";

import type { SidebarProjectSnapshot } from "../sidebarProjectGrouping";
import {
  legacyProjectCwdPreferenceKey,
  resolveProjectExpanded,
  useUiStateStore,
} from "../uiStateStore";

/**
 * Fork: groups only the sidebar's Active rows under project headers; pinned
 * rows and the Working, Snoozed, and Settled shelves stay flat. A collapsed
 * header shows a working dot for the running threads it hides.
 */

export interface SidebarProjectBlockProject {
  readonly projectKey: string;
  /** `${environmentId}:${projectId}` of every project in the group. */
  readonly memberKeys: readonly string[];
  readonly expanded: boolean;
}

export interface SidebarProjectBlock<T> {
  readonly projectKey: string;
  readonly expanded: boolean;
  /** The project's Active threads, in Active order. */
  readonly threads: readonly T[];
  readonly working: boolean;
}

/**
 * Splits Active threads into one block per project with Active threads, in
 * project order. A thread whose project is not in `projects` gets an expanded
 * block of its own at the end so it is never hidden.
 */
export function buildSidebarProjectBlocks<T>(input: {
  readonly threads: readonly T[];
  readonly projects: readonly SidebarProjectBlockProject[];
  readonly memberKeyOf: (thread: T) => string;
  /** Member keys with a running thread anywhere in the sidebar. */
  readonly workingMemberKeys: ReadonlySet<string>;
}): SidebarProjectBlock<T>[] {
  const projectByMember = new Map<string, SidebarProjectBlockProject>();
  for (const project of input.projects) {
    for (const memberKey of project.memberKeys) projectByMember.set(memberKey, project);
  }
  const threadsByProject = new Map<string, T[]>();
  for (const thread of input.threads) {
    const memberKey = input.memberKeyOf(thread);
    const projectKey = projectByMember.get(memberKey)?.projectKey ?? memberKey;
    const list = threadsByProject.get(projectKey);
    if (list) list.push(thread);
    else threadsByProject.set(projectKey, [thread]);
  }
  const blocks: SidebarProjectBlock<T>[] = [];
  for (const project of input.projects) {
    const threads = threadsByProject.get(project.projectKey);
    if (!threads) continue;
    threadsByProject.delete(project.projectKey);
    blocks.push({
      projectKey: project.projectKey,
      expanded: project.expanded,
      threads,
      working: project.memberKeys.some((key) => input.workingMemberKeys.has(key)),
    });
  }
  for (const [projectKey, threads] of threadsByProject) {
    blocks.push({
      projectKey,
      expanded: true,
      threads,
      working: input.workingMemberKeys.has(projectKey),
    });
  }
  return blocks;
}

/**
 * Where project headers render around the Active rows: before the first row of
 * each expanded block, with the headers of collapsed blocks just ahead of it.
 * Collapsed blocks after the last expanded row render at the end of Active.
 */
export function layoutSidebarProjectBlocks<T>(
  blocks: readonly SidebarProjectBlock<T>[],
  keyOf: (thread: T) => string,
): {
  readonly rows: readonly T[];
  readonly headersBefore: ReadonlyMap<string, readonly SidebarProjectBlock<T>[]>;
  readonly trailingHeaders: readonly SidebarProjectBlock<T>[];
} {
  const rows: T[] = [];
  const headersBefore = new Map<string, SidebarProjectBlock<T>[]>();
  let pending: SidebarProjectBlock<T>[] = [];
  for (const block of blocks) {
    pending.push(block);
    if (!block.expanded) continue;
    headersBefore.set(keyOf(block.threads[0]!), pending);
    pending = [];
    rows.push(...block.threads);
  }
  return { rows, headersBefore, trailingHeaders: pending };
}

export type SidebarActiveProjectBlock = SidebarProjectBlock<EnvironmentThreadShell>;

const memberKeyOf = (thread: EnvironmentThreadShell) =>
  `${thread.environmentId}:${thread.projectId}`;

function projectExpansionPreferenceKeys(project: SidebarProjectSnapshot): string[] {
  return [
    project.projectKey,
    ...project.memberProjects.map((member) => member.physicalProjectKey),
    ...project.memberProjects.map((member) => legacyProjectCwdPreferenceKey(member.workspaceRoot)),
  ];
}

/** The Sidebar's Active rows and project headers. One project keeps the flat list. */
export function useSidebarActiveProjects(
  projectGroups: readonly SidebarProjectSnapshot[],
  activeThreads: readonly EnvironmentThreadShell[],
  workingThreads: readonly EnvironmentThreadShell[],
) {
  const projectExpandedById = useUiStateStore((store) => store.projectExpandedById);
  const setProjectExpanded = useUiStateStore((store) => store.setProjectExpanded);
  return layoutSidebarActiveProjects({
    projectGroups,
    projectExpandedById,
    activeThreads,
    workingThreads,
    setProjectExpanded,
  });
}

function layoutSidebarActiveProjects(input: {
  readonly projectGroups: readonly SidebarProjectSnapshot[];
  readonly projectExpandedById: Readonly<Record<string, boolean>>;
  readonly activeThreads: readonly EnvironmentThreadShell[];
  readonly workingThreads: readonly EnvironmentThreadShell[];
  readonly setProjectExpanded: (keys: readonly string[], expanded: boolean) => void;
}) {
  const groupByKey = new Map(input.projectGroups.map((group) => [group.projectKey, group]));
  const layout =
    input.projectGroups.length < 2
      ? { rows: input.activeThreads, headersBefore: new Map(), trailingHeaders: [] }
      : layoutSidebarProjectBlocks(
          buildSidebarProjectBlocks({
            threads: input.activeThreads,
            projects: input.projectGroups.map((group) => ({
              projectKey: group.projectKey,
              memberKeys: group.memberProjects.map(
                (member) => `${member.environmentId}:${member.id}`,
              ),
              expanded: resolveProjectExpanded(
                input.projectExpandedById,
                projectExpansionPreferenceKeys(group),
              ),
            })),
            memberKeyOf,
            workingMemberKeys: new Set(
              [...input.activeThreads, ...input.workingThreads]
                .filter(isThreadWorking)
                .map(memberKeyOf),
            ),
          }),
          (thread) => scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        );
  return {
    ...layout,
    /** Props for `SidebarProjectHeader`. */
    header: (block: SidebarActiveProjectBlock) => {
      const group = groupByKey.get(block.projectKey);
      return {
        name: group?.displayName ?? "Project",
        expanded: block.expanded,
        count: block.threads.length,
        working: block.working,
        onToggle: () => {
          if (group) {
            input.setProjectExpanded(projectExpansionPreferenceKeys(group), !block.expanded);
          }
        },
      };
    },
  };
}
