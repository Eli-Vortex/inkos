import { rm } from "node:fs/promises";
import { join } from "node:path";

/**
 * Per-chapter state that is derived from a chapter's existence.
 *
 * Chapter numbers are reusable: deleting chapter 3 makes the next chapter 3
 * again. Anything keyed only by the chapter number therefore survives the delete
 * and is silently reattributed to the new chapter — the new chapter would show
 * the removed chapter's review findings, its version history, and an approval
 * record for a plan it never had.
 *
 * So deletion has to remove all three, not just the prose and the index.
 */
const DERIVED_CHAPTER_PATHS = {
  findings: (padded: string) => join("chapters", "findings", `${padded}.json`),
  approval: (padded: string) => join("story", "runtime", `chapter-${padded}.approval.json`),
  versions: (padded: string) => join("chapters", ".versions", padded),
} as const;

export interface PurgedChapterArtifacts {
  /** Book-relative POSIX-ish paths that were removed. */
  readonly removed: ReadonlyArray<string>;
}

/**
 * Remove the derived state belonging to one chapter number.
 *
 * Best-effort by design: a cleanup failure must not abort a delete that has
 * already moved the chapter prose out of the way, or the book is left in a
 * stranger state than before.
 */
export async function purgeChapterDerivedState(
  bookDir: string,
  chapterNumber: number,
): Promise<PurgedChapterArtifacts> {
  const padded = String(chapterNumber).padStart(4, "0");
  const targets = Object.entries(DERIVED_CHAPTER_PATHS).map(([, build]) => build(padded));

  const removed: string[] = [];
  for (const relativePath of targets) {
    try {
      await rm(join(bookDir, relativePath), { recursive: true, force: true });
      removed.push(relativePath);
    } catch {
      // Leave it: a stale derived artifact is less bad than a failed delete.
    }
  }
  return { removed };
}
