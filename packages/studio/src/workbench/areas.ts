/**
 * Workbench area identifiers — the shared, React-free list used by the hash
 * router (host Studio and the standalone preview) and by the shell navigation.
 */

import type { WorkbenchArea } from "./types";

export const WORKBENCH_AREAS = [
  "books",
  "writing",
  "outline",
  "review",
  "compare",
  "commit",
  "tasks",
  "research",
  "analytics",
  "export",
  "settings",
] as const satisfies readonly WorkbenchArea[];

export const DEFAULT_WORKBENCH_AREA: WorkbenchArea = "writing";

export function isWorkbenchArea(value: string | undefined | null): value is WorkbenchArea {
  return typeof value === "string" && (WORKBENCH_AREAS as readonly string[]).includes(value);
}
