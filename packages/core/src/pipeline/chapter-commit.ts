import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { commitAtomicFileSet } from "../utils/atomic-file-set.js";
import type { ChapterMeta, ChapterStatus } from "../models/chapter.js";
import { blockingFindings, isExpiredWaiver, type Finding } from "../findings/types.js";
import { stableHash } from "../utils/stable-hash.js";
import { readChapterContent, readChapterRevision } from "../state/chapter-workspace.js";

/**
 * Committing a chapter to its formal state.
 *
 * Approving used to be a one-line status write with no validation, no lock and
 * no record: it would succeed for a chapter that does not exist, could be
 * repeated freely, and left nothing behind that said what was approved or when.
 * This is the only path that writes canonical chapter state, so it is
 * transactional here instead — existence, base revision, gate findings and audit
 * freshness are all checked before anything is written, and a repeated
 * idempotency key returns the original receipt rather than committing twice.
 */

export const COMMIT_POLICY_VERSION = "chapter-commit-v1";

/**
 * Statuses that mean the prose changed after the last audit, so the audit no
 * longer applies.
 *
 * This is deliberately the complement of "has a current audit": a chapter that
 * has never been audited (`drafted`, `imported`, `card-generated`, ...) must be
 * as uncommittable as one whose audit went stale, otherwise an author can
 * approve raw model output without ever passing review.
 */
const STALE_AUDIT_STATUSES: ReadonlySet<ChapterStatus> = new Set([
  "card-generated",
  "drafting",
  "drafted",
  "auditing",
  "audit-failed",
  "state-degraded",
  "revising",
  "imported",
  "rejected",
] as const);

/**
 * Whether a chapter's stored status means its audit no longer applies.
 *
 * Exported so readers outside the commit path (the workbench showing "审核过期")
 * ask the same question, instead of each keeping its own copy of the rule and
 * drifting apart.
 */
export function isStaleAuditStatus(status: string): boolean {
  return STALE_AUDIT_STATUSES.has(status as ChapterStatus);
}

export const CommitReceiptSchema = z.object({
  commitId: z.string().min(1),
  bookId: z.string().min(1),
  chapterNumber: z.number().int().min(1),
  status: z.literal("approved"),
  /** Chapter revision produced by this commit. */
  revision: z.number().int().min(1),
  /** Digest of the prose that was approved. */
  contentHash: z.string().min(1),
  committedAt: z.string().datetime(),
  committedBy: z.string().min(1),
  /** Findings the author explicitly waived before committing. */
  waivedRules: z.array(z.string()).default([]),
  policyVersion: z.string().min(1),
});
export type CommitReceipt = z.infer<typeof CommitReceiptSchema>;

const CommitLogSchema = z.object({
  schemaVersion: z.literal(1),
  receipts: z.record(z.string(), CommitReceiptSchema).default({}),
});

export interface CommitDeps {
  readonly bookDir: (bookId: string) => string;
  readonly loadChapterIndex: (bookId: string) => Promise<ReadonlyArray<ChapterMeta>>;
  readonly saveChapterIndex: (bookId: string, index: ReadonlyArray<ChapterMeta>) => Promise<void>;
}

export interface CommitRequest {
  readonly bookId: string;
  readonly chapterNumber: number;
  /** Revision the client believes it is committing. Omitted means "do not check". */
  readonly baseRevision?: number;
  readonly idempotencyKey?: string;
  readonly committedBy?: string;
  /**
   * Findings as the caller evaluated them (gate + review). The service does not
   * re-derive them so that the verdict it enforces is the one the author saw.
   */
  readonly findings?: readonly Finding[];
  readonly now?: Date;
}

export type CommitFailureCode =
  | "CHAPTER_NOT_FOUND"
  | "STALE_BASE"
  | "REVISION_MISMATCH"
  | "BLOCKED_BY_FINDINGS"
  | "AUDIT_STALE"
  | "WAIVER_STALE"
  | "WRITE_FAILED";

export interface CommitFailure {
  readonly ok: false;
  readonly status: 404 | 409 | 412 | 422 | 500;
  readonly code: CommitFailureCode;
  readonly message: string;
  readonly currentRevision?: number;
  readonly findings?: readonly Finding[];
}

export type CommitResult =
  | { readonly ok: true; readonly receipt: CommitReceipt; readonly idempotent: boolean }
  | CommitFailure;

function commitLogPath(bookDir: string): string {
  return join(bookDir, "chapters", "commits.json");
}

async function loadCommitLog(bookDir: string): Promise<z.infer<typeof CommitLogSchema>> {
  try {
    const raw = await readFile(commitLogPath(bookDir), "utf-8");
    return CommitLogSchema.parse(JSON.parse(raw));
  } catch {
    return { schemaVersion: 1, receipts: {} };
  }
}

async function storeReceipt(bookDir: string, key: string, receipt: CommitReceipt): Promise<void> {
  const log = await loadCommitLog(bookDir);
  log.receipts[key] = receipt;
  // Atomic write: a truncated commits.json drops every idempotency receipt, so a
  // retried approval would commit a second time instead of replaying.
  await commitAtomicFileSet({
    rootDir: bookDir,
    writes: [{ relativePath: join("chapters", "commits.json"), content: JSON.stringify(log, null, 2) }],
  });
}

/** Read a previous receipt for an idempotency key, if one exists. */
export async function findCommitReceipt(
  bookDir: string,
  idempotencyKey: string,
): Promise<CommitReceipt | null> {
  const log = await loadCommitLog(bookDir);
  return log.receipts[idempotencyKey] ?? null;
}

function makeCommitId(params: {
  readonly bookId: string;
  readonly chapterNumber: number;
  readonly contentHash: string;
  readonly at: Date;
}): string {
  const key = [
    params.bookId,
    params.chapterNumber,
    params.contentHash,
    params.at.toISOString(),
  ].join("|");
  return `commit-${stableHash(key)}`;
}

/**
 * Commit one chapter.
 *
 * Call this inside the book lock. Every check that depends on current state
 * happens here, after the lock was taken, so a concurrent editor cannot slip a
 * write between the check and the write.
 */
export async function commitChapter(
  deps: CommitDeps,
  request: CommitRequest,
): Promise<CommitResult> {
  const bookDir = deps.bookDir(request.bookId);
  const now = request.now ?? new Date();

  // Idempotency first: a retried request must return the original receipt and
  // must not re-run the checks, because later state changes would otherwise make
  // a replay fail with a confusing error after the first attempt already won.
  if (request.idempotencyKey) {
    const previous = await findCommitReceipt(bookDir, request.idempotencyKey);
    if (previous) {
      return { ok: true, receipt: previous, idempotent: true };
    }
  }

  const index = await deps.loadChapterIndex(request.bookId);
  const meta = index.find((chapter) => chapter.number === request.chapterNumber);
  if (!meta) {
    return {
      ok: false,
      status: 404,
      code: "CHAPTER_NOT_FOUND",
      message: `第 ${request.chapterNumber} 章不存在，无法提交。`,
    };
  }

  const current = await readChapterRevision(bookDir, request.chapterNumber);
  if (!current) {
    return {
      ok: false,
      status: 404,
      code: "CHAPTER_NOT_FOUND",
      message: `第 ${request.chapterNumber} 章的正文文件不存在，无法提交。`,
    };
  }

  if (typeof request.baseRevision === "number" && request.baseRevision !== current.revision) {
    // Distinguish "you are behind" (409, re-read and rebase) from "you have a
    // revision we do not know" (412). Both refuse; the remedy differs.
    const behind = request.baseRevision < current.revision;
    return {
      ok: false,
      status: behind ? 409 : 412,
      code: behind ? "STALE_BASE" : "REVISION_MISMATCH",
      message: behind
        ? `服务端已是 r${current.revision}，提交基线 r${request.baseRevision} 已过期。`
        : `提交基线 r${request.baseRevision} 与服务端 r${current.revision} 不一致。`,
      currentRevision: current.revision,
    };
  }

  // An audit that predates the current prose cannot be used to approve it. This
  // is what stops "edit, ignore the warning, approve" from bypassing review.
  if (STALE_AUDIT_STATUSES.has(meta.status)) {
    return {
      ok: false,
      status: 422,
      code: "AUDIT_STALE",
      message: meta.status === "state-degraded"
        ? "本章的运行时状态校验未通过，需先恢复状态再提交。"
        : "本章正文在最后一次审核后已改动，需重新审核后才能提交。",
    };
  }

  const findings = request.findings ?? [];
  const blockers = blockingFindings(findings);

  // A waiver is only valid while the passage it was granted against still
  // exists. If the prose changed after the waiver, the author's earlier
  // judgement no longer applies and the finding must block again.
  const content = await readChapterContent(bookDir, request.chapterNumber);
  const expiredWaivers = content
    ? findings.filter((finding) => finding.blocking && isExpiredWaiver(finding, content))
    : [];
  if (expiredWaivers.length > 0) {
    return {
      ok: false,
      status: 422,
      code: "WAIVER_STALE",
      message: `有 ${expiredWaivers.length} 条豁免因正文改动而失效，需重新确认或重新审核后才能提交。`,
      findings: [...blockers, ...expiredWaivers],
    };
  }

  if (blockers.length > 0) {
    return {
      ok: false,
      status: 422,
      code: "BLOCKED_BY_FINDINGS",
      message: `仍有 ${blockers.length} 条阻断项未处理，无法提交正式稿。`,
      findings: blockers,
    };
  }

  const receipt: CommitReceipt = CommitReceiptSchema.parse({
    commitId: makeCommitId({
      bookId: request.bookId,
      chapterNumber: request.chapterNumber,
      contentHash: current.contentHash,
      at: now,
    }),
    bookId: request.bookId,
    chapterNumber: request.chapterNumber,
    status: "approved",
    revision: current.revision,
    contentHash: current.contentHash,
    committedAt: now.toISOString(),
    committedBy: request.committedBy ?? "author",
    waivedRules: findings
      .filter((finding) => finding.status === "waived")
      .map((finding) => finding.rule),
    policyVersion: COMMIT_POLICY_VERSION,
  });

  try {
    // Status and timestamp move together; leaving updatedAt behind made a
    // freshly approved chapter still look untouched in listings and sorting.
    const updated = index.map((chapter) => (
      chapter.number === request.chapterNumber
        ? { ...chapter, status: "approved" as const, updatedAt: now.toISOString() }
        : chapter
    ));
    await deps.saveChapterIndex(request.bookId, updated);
  } catch (error) {
    return {
      ok: false,
      status: 500,
      code: "WRITE_FAILED",
      message: error instanceof Error ? error.message : "提交写入失败。",
    };
  }

  if (request.idempotencyKey) {
    await storeReceipt(bookDir, request.idempotencyKey, receipt);
  }

  return { ok: true, receipt, idempotent: false };
}
