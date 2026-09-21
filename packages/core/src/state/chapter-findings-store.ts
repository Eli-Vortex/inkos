import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { commitAtomicFileSet } from "../utils/atomic-file-set.js";
import { FindingSchema, type Finding } from "../findings/types.js";
import { projectChapterFindings } from "../findings/projection.js";
import { FindingWaiverSchema } from "../findings/types.js";
import { findingsToLegacySummary } from "../findings/producers/continuity.js";
import type { ChapterMeta } from "../models/chapter.js";

/**
 * The chapter finding store: one small file per chapter.
 *
 * Findings deliberately do not live in `chapters/index.json`. The index is
 * rewritten in full under the book lock on every chapter save, so putting
 * findings there would mean (a) the index grows with every finding's rule,
 * evidence and suggestion text, and (b) waiving a single finding would contend
 * for the same lock as saving prose. A per-chapter file keeps a waiver a small,
 * independent write.
 *
 * `ChapterMeta.auditIssues` remains the compat summary: it is still written and
 * still readable, so nothing that depends on it changes. It is a projection of
 * this store, not a second source of truth.
 */

export const ChapterFindingsFileSchema = z.object({
  schemaVersion: z.literal(1),
  chapterNumber: z.number().int().min(1),
  updatedAt: z.string().datetime(),
  findings: z.array(FindingSchema).default([]),
});
export type ChapterFindingsFile = z.infer<typeof ChapterFindingsFileSchema>;

function findingsPath(bookDir: string, chapterNumber: number): string {
  const padded = String(chapterNumber).padStart(4, "0");
  return join(bookDir, "chapters", "findings", `${padded}.json`);
}

export async function loadChapterFindings(
  bookDir: string,
  chapterNumber: number,
): Promise<ChapterFindingsFile | null> {
  try {
    const raw = await readFile(findingsPath(bookDir, chapterNumber), "utf-8");
    return ChapterFindingsFileSchema.parse(JSON.parse(raw));
  } catch {
    // Absent, unreadable or corrupt: callers fall back to projecting the legacy
    // summary rather than treating the chapter as having no findings.
    return null;
  }
}

export async function saveChapterFindings(params: {
  readonly bookDir: string;
  readonly chapterNumber: number;
  readonly findings: readonly Finding[];
  readonly now?: Date;
}): Promise<ChapterFindingsFile> {
  const file: ChapterFindingsFile = {
    schemaVersion: 1,
    chapterNumber: params.chapterNumber,
    updatedAt: (params.now ?? new Date()).toISOString(),
    findings: [...params.findings],
  };
  // Atomic write: a truncated findings file silently degrades to the legacy
  // projection on read, which loses every stored waiver.
  await commitAtomicFileSet({
    rootDir: params.bookDir,
    writes: [{
      relativePath: join("chapters", "findings", `${String(params.chapterNumber).padStart(4, "0")}.json`),
      content: JSON.stringify(file, null, 2),
    }],
  });
  return file;
}

/** Index writers needed to keep `ChapterMeta.auditIssues` in step with the store. */
export interface FindingsSummaryDeps {
  readonly loadChapterIndex: () => Promise<readonly ChapterMeta[]>;
  readonly saveChapterIndex: (index: readonly ChapterMeta[]) => Promise<void>;
  /**
   * Apply extra index changes (status, updatedAt) in the same write as the
   * summary. Omit to only replace `auditIssues`.
   */
  readonly updateChapter?: (chapter: ChapterMeta, summary: readonly string[]) => ChapterMeta;
}

/**
 * Re-derive `index.json`'s `auditIssues` for one chapter from its findings.
 *
 * The findings store is authoritative; the index summary is a projection. Any
 * writer of findings must call this too, or the two disagree: the workbench and
 * CLI read the index, so a waiver that only touched the store stayed invisible
 * there (the chapter still looked blocked).
 *
 * Callers must hold the book lock.
 */
export async function syncChapterAuditSummary(params: {
  readonly bookDir: string;
  readonly chapterNumber: number;
  readonly findings: readonly Finding[];
  readonly loadChapterIndex: () => Promise<readonly ChapterMeta[]>;
  readonly saveChapterIndex: (index: readonly ChapterMeta[]) => Promise<void>;
  readonly updateChapter?: (chapter: ChapterMeta, summary: readonly string[]) => ChapterMeta;
}): Promise<void> {
  const summary = [...findingsToLegacySummary(params.findings)];
  const index = await params.loadChapterIndex();
  const updated = index.map((chapter) => {
    if (chapter.number !== params.chapterNumber) return chapter;
    return params.updateChapter
      ? params.updateChapter(chapter, summary)
      : { ...chapter, auditIssues: summary };
  });
  await params.saveChapterIndex(updated);
}

/**
 * Persist findings and project their summary into the chapter index in one call.
 *
 * This is the safe default for every findings writer: a caller cannot update the
 * store without also refreshing the index the UI reads.
 */
export async function writeChapterFindingsAndSummary(params: {
  readonly bookDir: string;
  readonly chapterNumber: number;
  readonly findings: readonly Finding[];
  readonly now?: Date;
} & FindingsSummaryDeps): Promise<ChapterFindingsFile> {
  const file = await saveChapterFindings({
    bookDir: params.bookDir,
    chapterNumber: params.chapterNumber,
    findings: params.findings,
    ...(params.now ? { now: params.now } : {}),
  });
  await syncChapterAuditSummary({
    bookDir: params.bookDir,
    chapterNumber: params.chapterNumber,
    findings: params.findings,
    loadChapterIndex: params.loadChapterIndex,
    saveChapterIndex: params.saveChapterIndex,
    ...(params.updateChapter ? { updateChapter: params.updateChapter } : {}),
  });
  return file;
}

/**
 * Read a chapter's findings, preferring the store and falling back to the
 * legacy summary in the chapter index.
 *
 * `source` says which path was taken so a caller can tell "the store has no
 * record yet" from "the store recorded nothing".
 */
export async function readChapterFindings(params: {
  readonly bookDir: string;
  readonly chapterNumber: number;
  readonly legacyAuditIssues?: readonly string[];
}): Promise<{ readonly findings: readonly Finding[]; readonly source: "store" | "legacy" }> {
  const stored = await loadChapterFindings(params.bookDir, params.chapterNumber);
  if (stored) return { findings: stored.findings, source: "store" };
  return {
    findings: projectChapterFindings({
      number: params.chapterNumber,
      auditIssues: params.legacyAuditIssues ?? [],
    }),
    source: "legacy",
  };
}

export interface WaiveResult {
  readonly ok: boolean;
  readonly reason?: "not-found" | "not-waivable" | "already-waived";
  readonly findings: readonly Finding[];
}

/**
 * Grant an explicit waiver for one finding.
 *
 * The waiver records who, why and when, plus a hash of the evidence it was
 * granted against, so a later edit that invalidates the basis is detectable
 * rather than silently covered.
 */
export async function waiveChapterFinding(params: {
  readonly bookDir: string;
  readonly chapterNumber: number;
  readonly findingId: string;
  readonly by: string;
  readonly reason: string;
  readonly basisHash: string;
  readonly legacyAuditIssues?: readonly string[];
  readonly now?: Date;
  /**
   * When provided, the chapter index summary is refreshed from the store in the
   * same operation, so a waiver is immediately visible to index readers (the
   * workbench, CLI) instead of only to the commit gate.
   */
  readonly syncIndex?: FindingsSummaryDeps;
}): Promise<WaiveResult> {
  const { findings } = await readChapterFindings({
    bookDir: params.bookDir,
    chapterNumber: params.chapterNumber,
    legacyAuditIssues: params.legacyAuditIssues,
  });

  const index = findings.findIndex((item) => item.id === params.findingId);
  if (index < 0) {
    return { ok: false, reason: "not-found", findings };
  }

  const target = findings[index]!;
  if (target.source === "legacy") {
    // No stable rule identity to attach a durable waiver to.
    return { ok: false, reason: "not-waivable", findings };
  }
  if (target.status === "waived") {
    return { ok: false, reason: "already-waived", findings };
  }

  const waiver = FindingWaiverSchema.parse({
    by: params.by,
    reason: params.reason,
    at: (params.now ?? new Date()).toISOString(),
    basisHash: params.basisHash,
  });

  const next = findings.map((item, position) => (
    position === index ? { ...item, status: "waived" as const, waiver } : item
  ));

  if (params.syncIndex) {
    await writeChapterFindingsAndSummary({
      bookDir: params.bookDir,
      chapterNumber: params.chapterNumber,
      findings: next,
      ...(params.now ? { now: params.now } : {}),
      loadChapterIndex: params.syncIndex.loadChapterIndex,
      saveChapterIndex: params.syncIndex.saveChapterIndex,
      ...(params.syncIndex.updateChapter ? { updateChapter: params.syncIndex.updateChapter } : {}),
    });
  } else {
    await saveChapterFindings({
      bookDir: params.bookDir,
      chapterNumber: params.chapterNumber,
      findings: next,
      now: params.now,
    });
  }

  return { ok: true, findings: next };
}

/**
 * Whether a stored waiver still matches the evidence it was granted against.
 *
 * A mismatch is not an error: it means the passage changed and the author's
 * earlier judgement should be reconfirmed.
 */
export function isWaiverStale(finding: Finding, currentBasisHash: string): boolean {
  if (finding.status !== "waived" || !finding.waiver) return false;
  return finding.waiver.basisHash !== currentBasisHash;
}
