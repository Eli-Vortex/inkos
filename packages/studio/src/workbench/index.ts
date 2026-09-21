/**
 * Novel Creation workbench — public entry.
 *
 * Import `WorkbenchApp` (and `WorkbenchArea`) from here. Nothing outside the
 * workbench module may reach into data/ or state/ directly.
 */

export { WorkbenchApp } from "./WorkbenchApp";
export type { WorkbenchAppProps } from "./WorkbenchApp";
export type { WorkbenchArea } from "./types";
export { WORKBENCH_AREAS, isWorkbenchArea } from "./areas";
