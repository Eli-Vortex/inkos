/**
 * Novel Creation workbench — domain types.
 *
 * These are UI-facing view models. They describe what the authoring surfaces
 * render; they are not the backend wire contract (that lives in
 * packages/studio/src/api and in docs/06-api-contracts.md and is untouched).
 * Every value that reaches these types comes through the typed adapter in
 * data/adapter.ts, so swapping the demo source for the real API never touches
 * page code.
 */

import type { EmotionalDebtRecord } from "@actalk/inkos-core";
import type { Finding } from "@actalk/inkos-core/findings";

export type WorkbenchArea =
  | "books"
  | "writing"
  | "outline"
  | "review"
  | "compare"
  | "commit"
  | "tasks"
  | "research"
  | "analytics"
  | "export"
  | "settings";

/** Which dataset the demo adapter serves. Drives every non-happy-path state. */
export type DemoState =
  | "normal"
  | "empty"
  | "loading"
  | "error"
  | "conflict"
  | "stale"
  | "recovering";

export type LoadState = "idle" | "loading" | "ready" | "error";

/**
 * A book's real writing governance — the same two knobs core resolves in
 * `resolveChapterReviewMode` / `resolveRevisionGate`. `null` means the book has
 * no explicit value and inherits the project-level setting, which is a real and
 * meaningful state, so it is not collapsed into a default here.
 */
export interface BookGovernance {
  /** `auto` lets the pipeline continue on its own; `manual` stops for the author. */
  readonly reviewMode: "auto" | "manual" | null;
  /** `strict` needs improvement, `lenient` needs no worsening, `always` always revises. */
  readonly revisionGate: "strict" | "lenient" | "always" | null;
}

export type MigrationState = "complete" | "pending";

export interface Book {
  readonly id: string;
  readonly title: string;
  readonly genre: string;
  readonly status: BookStatus;
  readonly governance: BookGovernance;
  readonly chaptersCommitted: number;
  readonly chaptersPlanned: number;
  /**
   * Sum of the real per-chapter word counts when they could be read. `null`
   * means the value is genuinely unknown — the list must show that rather than a
   * chapter-count-times-target estimate presented as a measurement.
   */
  readonly wordCount: number | null;
  readonly lastEditedAt: string;
  /** Unknown when the project exposes no task store; `null` is not zero. */
  readonly pendingTaskCount: number | null;
  /** Unknown unless a real migration record exists. */
  readonly migration: MigrationState | null;
}

export type BookStatus = "draft" | "writing" | "review" | "complete";

/** Chapter lifecycle. `staleReview` is the "审核已过期" signal. */
export type ChapterStage =
  | "planned"
  | "drafting"
  | "in_review"
  | "approved"
  | "committed";

export interface Chapter {
  readonly id: string;
  /** Owning book. The chapter tree is scoped by it, so a route's book context means something. */
  readonly bookId: string;
  readonly number: number;
  readonly volume: string;
  readonly title: string;
  readonly stage: ChapterStage;
  readonly wordCount: number;
  readonly updatedAt: string;
  readonly outlineApproved: boolean;
  readonly outlineDirty: boolean;
  readonly staleReview: boolean;
  readonly openBlockers: number;
  readonly openWarnings: number;
  /** Raw audit issues as recorded in the real chapter index (legacy `[severity] text`). */
  readonly auditIssues?: readonly string[];
  /**
   * Structured projection of `auditIssues`, produced by core's finding model.
   * New review surfaces must read this rather than re-parsing the raw strings.
   */
  readonly findings?: readonly Finding[];
}

export type CandidateSource = "hand" | "generated" | "revised" | "imported";

export interface Candidate {
  readonly id: string;
  readonly label: string;
  readonly revision: number;
  readonly source: CandidateSource;
  readonly updatedAt: string;
  readonly baseline: string;
  readonly wordCount: number;
  readonly body: string;
  readonly isFormal: boolean;
  /** Which book and chapter this candidate belongs to, so a candidate can never
   *  be applied to whichever chapter happens to be selected. */
  readonly bookId?: string;
  readonly chapterId?: string;
  /** An archived version: readable and diffable, never directly editable. */
  readonly archived?: boolean;
}

export type Severity = "block" | "warn" | "suggest";
/** `unverified` is a distinct state: the check did not run, which is not the
 *  same claim as "ran and found nothing". */
export type ReviewStatus = "open" | "resolved" | "waived" | "unverified";
export type Confidence = "high" | "medium" | "unknown" | "not_applicable";

export interface ReviewEvidence {
  readonly chapterId: string;
  readonly chapterLabel: string;
  readonly quote: string;
  readonly offset: number;
}

export interface ReviewItem {
  readonly id: string;
  readonly severity: Severity;
  readonly rule: string;
  readonly ruleGroup: string;
  readonly summary: string;
  readonly suggestion: string;
  readonly confidence: Confidence;
  readonly status: ReviewStatus;
  readonly evidence: ReviewEvidence;
  readonly waiverReason: string | null;
  /** Blocking integrity errors can never be waived from the UI. */
  readonly waivable: boolean;
}

export interface OutlineBeat {
  readonly id: string;
  readonly text: string;
  readonly mandatory: boolean;
  readonly addressed: boolean;
}

export interface OutlineCharacter {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly intent: string;
}

export interface OutlineConstraint {
  readonly id: string;
  readonly text: string;
  readonly kind: "world" | "timeline" | "pov" | "style";
}

export interface OutlineContract {
  readonly chapterId: string;
  readonly goal: string;
  readonly beats: readonly OutlineBeat[];
  readonly characters: readonly OutlineCharacter[];
  readonly constraints: readonly OutlineConstraint[];
  readonly approvedRevision: number | null;
  readonly currentRevision: number;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
}

export type TaskState =
  | "queued"
  | "running"
  | "awaiting"
  | "done"
  | "failed"
  | "canceled"
  | "canceling";

export interface TaskStep {
  readonly id: string;
  readonly label: string;
  readonly state: "pending" | "active" | "done" | "failed";
}

export interface WorkTask {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly target: string;
  readonly state: TaskState;
  readonly progress: number;
  readonly startedAt: string;
  readonly elapsed: string;
  readonly note: string;
  readonly steps: readonly TaskStep[];
  readonly cancellable: boolean;
}

export type MaterialKind = "note" | "reference" | "breakdown" | "interview";

export interface ResearchMaterial {
  readonly id: string;
  readonly title: string;
  readonly kind: MaterialKind;
  readonly source: string;
  readonly collectedAt: string;
  readonly scope: string;
  readonly license: string;
  readonly analysisVersion: string;
  readonly paragraphs: readonly MaterialParagraph[];
}

export interface MaterialParagraph {
  readonly id: string;
  readonly text: string;
  readonly annotation: string;
}

export interface TimelineEntry {
  readonly id: string;
  readonly chapterLabel: string;
  readonly title: string;
  readonly detail: string;
  readonly kind: "hook" | "promise" | "payoff";
  readonly status: "open" | "paid" | "at_risk";
  readonly owner: string;
}

export interface PromiseEntry {
  readonly id: string;
  readonly text: string;
  readonly plantedAt: string;
  readonly dueBy: string;
  readonly status: "open" | "paid" | "at_risk";
  readonly evidence: string;
}

export type M3Verdict = "ok" | "warn" | "block" | "insufficient_data" | "unverifiable" | "not_applicable";

export interface M3Point {
  readonly chapterLabel: string;
  readonly net: number;
  readonly verdict: M3Verdict;
  readonly note: string;
}

export interface ResearchData {
  readonly materials: readonly ResearchMaterial[];
  readonly timeline: readonly TimelineEntry[];
  readonly promises: readonly PromiseEntry[];
  readonly m3: readonly M3Point[];
}

/* ── 连载分析 (F-20 / F-21 / F-22) ─────────────────────────────────────────
 *
 * The analytics surfaces read the same typed dataset as every other page. The
 * emotional-debt records reuse the core engine's own shape, so the values the
 * author sees are the ones PacingDebtEngine evaluates — nothing here invents a
 * chart number. Missing evidence is carried as its own verdict, never as 0.
 */

/** Which continuity axis a change was detected on (F-20). */
export type ContinuityConflict = "persona" | "power" | "timeline";

/** `insufficient_data` is a first-class verdict, not a zero score. */
export type ContinuityVerdict = "ok" | "warn" | "block" | "insufficient_data";

export interface ContinuityChange {
  readonly id: string;
  readonly chapterId: string;
  readonly chapterLabel: string;
  /** The entity whose state moved (a person, a rank, a timeline anchor). */
  readonly subject: string;
  readonly conflict: ContinuityConflict;
  readonly verdict: ContinuityVerdict;
  readonly before: string;
  readonly after: string;
  readonly note: string;
  readonly quote: string;
  /** Caret offset into the chapter body, for the 定位原文 jump. */
  readonly offset: number;
}

/** Lifecycle of a narrative promise (F-21). */
export type PromiseStage = "introduced" | "advanced" | "fulfilled" | "deferred" | "abandoned";

export interface NarrativePromise {
  readonly id: string;
  readonly text: string;
  readonly stage: PromiseStage;
  readonly plantedAt: string;
  readonly dueBy: string;
  readonly chapterLabel: string;
  readonly evidence: string;
  readonly offset: number;
}

/** Exactly the core engine's record shape, re-exported for the view layer. */
export type EmotionalDebt = EmotionalDebtRecord;

export interface AnalyticsData {
  /** Chapter the pacing evaluation is run against. */
  readonly currentChapter: number;
  readonly continuity: readonly ContinuityChange[];
  readonly promises: readonly NarrativePromise[];
  /** Mirrors PacingDebtEngine's input; unresolved/payoff counts are derived from it. */
  readonly debts: readonly EmotionalDebt[];
  /** Mirrors PacingState.pacingAlerts. */
  readonly pacingAlerts: readonly string[];
}

/* ── 导出 (F-25) ─────────────────────────────────────────────────────────── */

export type ExportFormat = "txt" | "md" | "epub";

export type ExportArtifactState = "ready" | "running" | "failed";

export interface ExportPreviewBlock {
  readonly id: string;
  readonly chapterLabel: string;
  readonly heading: string;
  readonly body: string;
  /** False for candidate-only text, which must never ride along unmarked. */
  readonly submitted: boolean;
}

export interface ExportHistoryEntry {
  readonly id: string;
  readonly format: ExportFormat;
  readonly scopeLabel: string;
  /** The HEAD revision the artifact was bound to. */
  readonly head: string;
  readonly createdAt: string;
  readonly includesCandidates: boolean;
  readonly artifact: string;
  readonly state: ExportArtifactState;
}

export interface ExportData {
  /** Committed revision the next export binds to. */
  readonly head: string;
  readonly headCommitId: string;
  readonly submittedChapters: number;
  readonly candidateChapters: number;
  readonly preview: readonly ExportPreviewBlock[];
  readonly history: readonly ExportHistoryEntry[];
}

export interface RuleSetting {
  readonly id: string;
  readonly name: string;
  readonly group: string;
  readonly severity: Severity;
  readonly enabled: boolean;
  readonly source: string;
}

export interface DiagnosticsEntry {
  readonly id: string;
  readonly label: string;
  readonly state: "ok" | "warn" | "block" | "unavailable";
  readonly detail: string;
}

export interface UnavailableCapability {
  readonly id: string;
  readonly label: string;
  readonly reason: string;
}

/** Commit gate checklist. Mirrors docs/03 §6 result mapping. */
export interface CommitGate {
  readonly id: string;
  readonly label: string;
  readonly state: "pass" | "warn" | "block";
  readonly detail: string;
}

export interface CommitPreview {
  readonly candidateId: string;
  readonly baseline: string;
  readonly wordDelta: number;
  readonly statusChange: string;
  readonly gates: readonly CommitGate[];
  readonly pendingIndexTasks: readonly string[];
  readonly removable: boolean;
}

/** Editor buffer lifecycle, per docs/03 §4. */
export type SaveState =
  | "loading"
  | "clean"
  | "dirty"
  | "saving"
  | "save_error"
  | "conflict";

export interface SaveStatus {
  readonly state: SaveState;
  readonly revision: number;
  readonly savedAt: string | null;
  readonly message: string;
  readonly isComposing: boolean;
  readonly pendingSince: number | null;
}

export interface SaveResult {
  readonly ok: boolean;
  readonly revision?: number;
  readonly savedAt?: string;
  readonly conflict?: boolean;
  readonly conflictRevision?: number;
  readonly error?: string;
}


