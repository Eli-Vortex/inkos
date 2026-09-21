import { projectLegacyFindings, type LegacyAuditSource } from "./legacy.js";
import { blockingFindings, unverifiedFindings, type Finding } from "./types.js";

/**
 * Read-only projection of the persisted audit summary into findings.
 *
 * This is deliberately a *projection*, not a migration. Nothing is written back:
 * `ChapterMeta.auditIssues` keeps its `string[]` shape for now, so every existing
 * reader — including the revision counting path and the Studio workbench — keeps
 * working unchanged while new consumers can already read a structured shape.
 *
 * Replacing the stored format is a separate, later step that must be accompanied
 * by a visible change to the revision-gate baseline suite.
 */
export function projectChapterFindings(source: LegacyAuditSource): readonly Finding[] {
  return projectLegacyFindings(source);
}

/** Count of findings that would stop a commit (including unverified checks). */
export function countBlockingFindings(findings: readonly Finding[]): number {
  return blockingFindings(findings).length;
}

/** Count of findings that never produced a verdict, so cannot be treated as clean. */
export function countUnverifiedFindings(findings: readonly Finding[]): number {
  return unverifiedFindings(findings).length;
}
