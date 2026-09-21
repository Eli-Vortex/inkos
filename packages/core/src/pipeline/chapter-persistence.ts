import type { AuditIssue, AuditResult } from "../agents/continuity.js";
import { saveChapterFindings } from "../state/chapter-findings-store.js";
import {
  auditIssuesToFindings,
  findingsToLegacySummary,
} from "../findings/producers/continuity.js";
import type { ChapterMeta } from "../models/chapter.js";
import type { LengthTelemetry } from "../models/length-governance.js";
import { buildStateDegradedReviewNote } from "./chapter-state-recovery.js";

export interface ChapterPersistenceUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export type ChapterPersistenceStatus = "ready-for-review" | "audit-failed" | "state-degraded";

export async function persistChapterArtifacts(params: {
  readonly bookDir: string;
  readonly chapterNumber: number;
  readonly chapterTitle: string;
  readonly status: ChapterPersistenceStatus;
  readonly auditResult: AuditResult;
  readonly finalWordCount: number;
  readonly lengthWarnings: ReadonlyArray<string>;
  readonly lengthTelemetry?: LengthTelemetry;
  readonly degradedIssues: ReadonlyArray<AuditIssue>;
  readonly tokenUsage?: ChapterPersistenceUsage;
  readonly loadChapterIndex: () => Promise<ReadonlyArray<ChapterMeta>>;
  readonly saveChapter: () => Promise<void>;
  readonly saveTruthFiles: () => Promise<void>;
  readonly saveChapterIndex: (index: ReadonlyArray<ChapterMeta>) => Promise<void>;
  readonly markBookActiveIfNeeded: () => Promise<void>;
  readonly persistAuditDriftGuidance: (issues: ReadonlyArray<AuditIssue>) => Promise<void>;
  readonly snapshotState: () => Promise<void>;
  readonly syncCurrentStateFactHistory: () => Promise<void>;
  readonly logSnapshotStage: () => void;
  readonly now?: () => string;
}): Promise<{ readonly entry: ChapterMeta }> {
  await params.saveChapter();
  if (params.status !== "state-degraded") {
    await params.saveTruthFiles();
  }

  // Structured findings are the source; the index summary is derived from them so
  // the two readers cannot disagree about the same chapter. Written directly here
  // rather than through a callback, so the array type cannot drift at the boundary.
  const findings = auditIssuesToFindings(
    params.status === "state-degraded"
      ? [...params.auditResult.issues, ...params.degradedIssues]
      : params.auditResult.issues,
    { chapterNumber: params.chapterNumber },
  );
  // Best-effort: the prose and index are the primary record, and a failure to
  // write the structured copy must not fail the chapter that was just written.
  await saveChapterFindings({
    bookDir: params.bookDir,
    chapterNumber: params.chapterNumber,
    findings,
  }).catch(() => undefined);

  const existingIndex = await params.loadChapterIndex();
  const now = params.now?.() ?? new Date().toISOString();
  const entry: ChapterMeta = {
    number: params.chapterNumber,
    title: params.chapterTitle,
    status: params.status,
    wordCount: params.finalWordCount,
    createdAt: now,
    updatedAt: now,
    auditIssues: [...findingsToLegacySummary(findings)],
    lengthWarnings: [...params.lengthWarnings],
    reviewNote: params.status === "state-degraded"
      ? buildStateDegradedReviewNote(
          params.auditResult.passed ? "ready-for-review" : "audit-failed",
          params.degradedIssues,
        )
      : undefined,
    lengthTelemetry: params.lengthTelemetry,
    tokenUsage: params.tokenUsage,
  };
  const existingIdx = existingIndex.findIndex((e) => e.number === params.chapterNumber);
  const updatedIndex = existingIdx >= 0
    ? existingIndex.map((e, i) => i === existingIdx ? { ...entry, createdAt: e.createdAt } : e)
    : [...existingIndex, entry];
  await params.saveChapterIndex(updatedIndex);
  await params.markBookActiveIfNeeded();

  const driftIssues = params.auditResult.issues.filter(
    (issue) => issue.severity === "critical" || issue.severity === "warning",
  );
  await params.persistAuditDriftGuidance(params.status === "state-degraded" ? [] : driftIssues);

  if (params.status !== "state-degraded") {
    params.logSnapshotStage();
    await params.snapshotState();
    await params.syncCurrentStateFactHistory();
  }

  return { entry };
}

