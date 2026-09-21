/**
 * Novel Creation workbench — typed data adapter.
 *
 * This is the single seam between the workbench UI and its data. Page and
 * component code only ever talks to `WorkbenchSource`; swapping the demo
 * implementation for a real client touches this file alone.
 *
 * Hard rules encoded below (docs/03, docs/05, docs/09 M2):
 *  - Demo mode mutates an in-memory copy only. No fetch, no write endpoint.
 *  - Live mode reads the real project and never fabricates content; surfaces
 *    whose backend contract is not wired yet report 不可用 instead of pretending.
 */

import type {
  Book,
  BookStatus,
  Candidate,
  Chapter,
  ChapterStage,
  CommitGate,
  DemoState,
  OutlineBeat,
  ReviewItem,
  RuleSetting,
  SaveResult,
  Severity,
  UnavailableCapability,
  WorkTask,
} from "../types";
import { datasetFor, type WorkbenchDataset } from "./mock";
import { emptyWorkbenchDataset } from "./empty";
import { fetchJson } from "../../hooks/use-api";
import {
  blockingFindings,
  countBlockingFindings,
  isWaivable,
  projectChapterFindings,
  type Finding,
} from "@actalk/inkos-core/findings";

/** Shape returned by GET /api/v1/books (BookConfig + chaptersWritten). */
interface ApiBookSummary {
  readonly id: string;
  readonly title: string;
  readonly genre: string;
  readonly status: string;
  readonly targetChapters?: number;
  readonly chapterWordCount?: number;
  readonly updatedAt?: string;
  readonly createdAt?: string;
  readonly chaptersWritten?: number;
  /** Real migration state derived from the structured runtime state manifest. */
  readonly migration?: "complete" | "pending" | null;
  /** Unfinished tasks for this book, counted from its sessions. */
  readonly pendingTaskCount?: number;
  /** Real book-level writing overrides; unset means "inherit project". */
  readonly writing?: {
    readonly reviewMode?: "auto" | "manual";
    readonly revisionGate?: "strict" | "lenient" | "always";
  };
}

/** Shape returned by GET /api/v1/books/:id (chapter index entries). */
interface ApiChapter {
  readonly number: number;
  readonly title: string;
  readonly status: string;
  readonly wordCount?: number;
  readonly updatedAt?: string;
  readonly auditIssues?: readonly string[];
  /** Derived by the server: the prose changed after its last audit. */
  readonly staleAudit?: boolean;
}

function mapBookStatus(status: string): BookStatus {
  switch (status) {
    case "completed": return "complete";
    case "active": return "writing";
    case "paused":
    case "dropped": return "review";
    default: return "draft";
  }
}

function mapBook(api: ApiBookSummary, chapterWordTotal: number | null): Book {
  const committed = api.chaptersWritten ?? 0;
  const planned = api.targetChapters ?? Math.max(committed, 1);
  return {
    id: api.id,
    title: api.title,
    genre: api.genre,
    status: mapBookStatus(api.status),
    governance: {
      reviewMode: api.writing?.reviewMode ?? null,
      revisionGate: api.writing?.revisionGate ?? null,
    },
    chaptersCommitted: committed,
    chaptersPlanned: planned,
    // The real sum when the chapters were readable; unknown otherwise. The old
    // value was committed × target words, which is a plan, not a measurement,
    // and was displayed as if it had been counted.
    wordCount: chapterWordTotal,
    lastEditedAt: api.updatedAt ?? api.createdAt ?? "",
    // Real values when the server could determine them; `null` still means
    // unknown, so an absent field never reads as "nothing to do".
    pendingTaskCount: typeof api.pendingTaskCount === "number" ? api.pendingTaskCount : null,
    migration: api.migration ?? null,
  };
}

function mapChapterStage(status: string): ChapterStage {
  switch (status) {
    case "card-generated": return "planned";
    case "drafting":
    case "rejected": return "drafting";
    case "approved": return "approved";
    case "published":
    case "imported": return "committed";
    default: return "in_review";
  }
}

function mapChapter(bookId: string, api: ApiChapter): Chapter {
  const auditIssues = api.auditIssues ?? [];
  // The structured shape is projected by core, which owns the finding model, so
  // the workbench never re-implements the legacy `[severity] text` parsing.
  const findings = projectChapterFindings({ number: api.number, auditIssues });
  return {
    id: `${bookId}-ch-${api.number}`,
    bookId,
    number: api.number,
    volume: "正文",
    title: api.title,
    stage: mapChapterStage(api.status),
    wordCount: api.wordCount ?? 0,
    updatedAt: api.updatedAt ?? "",
    outlineApproved: false,
    outlineDirty: false,
    // Computed from the real status now. It used to be hardcoded false, which
    // meant the "审核过期" badge never appeared and the commit gate could not
    // tell that an audit predated the current prose.
    staleReview: api.staleAudit === true,
    openBlockers: countBlockingFindings(findings),
    openWarnings: findings.filter((finding) => finding.severity === "warning").length,
    auditIssues,
    findings,
  };
}

export class WorkbenchUnavailableError extends Error {
  readonly code = "WORKBENCH_UNAVAILABLE";
  constructor(message: string) {
    super(message);
    this.name = "WorkbenchUnavailableError";
  }
}

export interface SaveDraftInput {
  readonly bookId: string;
  readonly chapterId: string;
  readonly candidateId: string;
  readonly body: string;
  readonly revision: number;
  /** Server revision the client last observed; drives the conflict path. */
  readonly baseRevision: number;
}

export interface CommitInput {
  readonly bookId: string;
  readonly chapterId: string;
  readonly candidateId: string;
  readonly revision: number;
  readonly idempotencyKey: string;
}

export interface CommitOutcome {
  readonly accepted: boolean;
  /** Mirrors docs/03 §6 mapping so the UI copies the real result semantics. */
  readonly code: "201" | "202" | "409" | "412" | "422" | "503";
  readonly message: string;
  readonly commitId?: string;
}

/**
 * The per-chapter working set: everything that belongs to one chapter and must
 * never be shown under another one.
 *
 * Loading is keyed on `{bookId, chapterId}` because the previous shape — one
 * focus chapter loaded at startup, reused by whichever chapter was selected —
 * meant switching chapters showed another chapter's candidates and another
 * chapter's critique.
 */
export interface ChapterContextResult {
  readonly bookId: string;
  readonly chapterId: string;
  readonly candidates: readonly Candidate[];
  readonly outline: WorkbenchDataset["outline"];
  readonly reviewItems: readonly ReviewItem[];
  readonly commitPreview: WorkbenchDataset["commitPreview"];
  /**
   * Real outline approval state for this chapter.
   *
   * Carried here because the chapter list is built before any chapter's working
   * set is loaded, so it cannot know the approval state per chapter. Without
   * this the store had no way to stamp the chapter it just loaded, and
   * `outlineDirty` stayed at its hardcoded false.
   */
  readonly outlineApproved: boolean;
  readonly outlineDirty: boolean;
  /**
   * The chapter as the server currently reports it.
   *
   * Carried so the store can replace its list entry after a write. Without this
   * the chapter list kept the status it had at load time, so committing a chapter
   * left it looking "审核中" until a full reload.
   */
  readonly chapter: Chapter;
}

export interface WorkbenchSource {
  readonly mode: "demo" | "live";
  load(scenario: DemoState): Promise<WorkbenchDataset>;
  /** Load the working set for one chapter. Null when the chapter is unknown. */
  loadChapterContext(bookId: string, chapterId: string): Promise<ChapterContextResult | null>;
  /**
   * Turn an archived version into the live candidate for a chapter.
   *
   * This is the supported way to edit an old version: the archive itself stays
   * immutable, and the chapter becomes a new draft marked for review.
   */
  restoreVersion(bookId: string, chapterId: string, versionId: string): Promise<SaveResult>;
  /**
   * Plan the next chapter of a book.
   *
   * This is the real "new chapter" action: a chapter exists once it has a plan,
   * so planning is what creates it. Generating prose for it is a separate step.
   */
  planNextChapter(bookId: string): Promise<{ readonly ok: boolean; readonly error?: string }>;
  /**
   * Re-run the chapter audit.
   *
   * A manual edit marks the audit stale, which correctly blocks the commit — so
   * there has to be a way to earn a fresh verdict, or the author is stuck.
   */
  auditChapter(bookId: string, chapterId: string): Promise<{ readonly ok: boolean; readonly error?: string }>;
  /**
   * Request the backend pipeline to generate prose for the next chapter.
   *
   * Available directly inside the writing workspace so an author does not have
   * to leave their chapter workspace and jump back to the dashboard just to
   * trigger generation.
   */
  generateNextChapter(bookId: string): Promise<{ readonly ok: boolean; readonly error?: string }>;
  saveDraft(input: SaveDraftInput): Promise<SaveResult>;
  resolveReview(bookId: string, itemId: string): Promise<readonly ReviewItem[]>;
  /** Waive one finding. The chapter is explicit: findings belong to a chapter. */
  waiveReview(
    bookId: string,
    chapterId: string,
    itemId: string,
    reason: string,
  ): Promise<readonly ReviewItem[]>;
  adoptCandidate(bookId: string, candidateId: string): Promise<readonly Candidate[]>;
  cancelTask(taskId: string): Promise<readonly WorkTask[]>;
  setRuleEnabled(ruleId: string, enabled: boolean): Promise<readonly RuleSetting[]>;
  approveOutline(
    bookId: string,
    chapterId: string,
    revision: number,
    outline?: { readonly goal?: string },
  ): Promise<number>;
  commit(input: CommitInput): Promise<CommitOutcome>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Demo implementation. Bounded, deterministic latency; every write is a
 * simulated state change over the in-memory dataset.
 */
class DemoSource implements WorkbenchSource {
  readonly mode = "demo" as const;
  private dataset: WorkbenchDataset = datasetFor("normal");
  private scenario: DemoState = "normal";
  private saveCount = 0;

  async load(scenario: DemoState): Promise<WorkbenchDataset> {
    this.scenario = scenario;
    if (scenario === "error") {
      await wait(280);
      throw new Error("演示数据：读取项目失败（模拟 500）。");
    }
    await wait(scenario === "loading" ? 220 : 160);
    this.dataset = datasetFor(scenario);
    this.saveCount = 0;
    return this.dataset;
  }

  async loadChapterContext(bookId: string, chapterId: string): Promise<ChapterContextResult | null> {
    await wait(120);
    const chapter = this.dataset.chapters.find(
      (item) => item.id === chapterId && item.bookId === bookId,
    );
    if (!chapter) return null;
    // The demo shelf keeps one scripted working set. Re-stamp it onto the chapter
    // actually requested, so the demo does not teach the wrong behaviour by
    // showing another chapter's candidates under this chapter's name.
    const candidates = this.dataset.candidates.map((candidate) => ({
      ...candidate,
      bookId,
      chapterId,
    }));
    return {
      bookId,
      chapterId,
      candidates,
      outline: { ...this.dataset.outline, chapterId },
      reviewItems: this.dataset.reviewItems,
      commitPreview: this.dataset.commitPreview,
      outlineApproved: chapter.outlineApproved,
      outlineDirty: chapter.outlineDirty,
      chapter,
    };
  }


  async restoreVersion(bookId: string, chapterId: string, versionId: string): Promise<SaveResult> {
    await wait(200);
    const chapter = this.dataset.chapters.find(      (item) => item.id === chapterId && item.bookId === bookId,
    );
    const version = this.dataset.candidates.find((item) => item.id === versionId);
    if (!chapter || !version) {
      return { ok: false, error: "演示数据：找不到该版本。" };
    }
    // The archive is kept; the chapter text is replaced and marked for review,
    // mirroring the real restore transaction.
    this.dataset = {
      ...this.dataset,
      chapters: this.dataset.chapters.map((item) => (
        item.id === chapterId ? { ...item, staleReview: true } : item
      )),
      candidates: this.dataset.candidates.map((item) => (
        item.id === `${chapterId}-current`
          ? { ...item, body: version.body, isFormal: false }
          : item
      )),
    };
    return { ok: true, revision: version.revision + 1, savedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }) };
  }

  async planNextChapter(): Promise<{ ok: boolean; error?: string }> {
    await wait(300);
    // The demo scenario has no LLM, so it reports the boundary instead of
    // pretending a chapter was planned.
    return { ok: false, error: "演示模式不会调用模型规划新章节。" };
  }

  async auditChapter(): Promise<{ ok: boolean; error?: string }> {
    await wait(320);
    // The demo dataset has no real auditor behind it; say so rather than
    // clearing the stale flag and implying the prose was reviewed.
    return { ok: false, error: "演示模式不会调用模型重新审核。" };
  }

  async generateNextChapter(): Promise<{ ok: boolean; error?: string }> {
    await wait(400);
    return { ok: false, error: "演示模式不会调用模型生成正文。" };
  }

  async saveDraft(input: SaveDraftInput): Promise<SaveResult> {
    await wait(240);
    this.saveCount += 1;

    if (this.scenario === "error") {
      return { ok: false, error: "演示数据：候选保存失败（模拟 503），本地文本未丢失。" };
    }
    // Second save in a conflict rehearsal returns 412 once, then recovers —
    // the same shape as a real revision mismatch the author has to resolve.
    if (this.scenario === "conflict" && this.saveCount === 2) {
      return {
        ok: false,
        conflict: true,
        conflictRevision: input.baseRevision + 2,
        error: "演示数据：服务端版本已更新（模拟 412 REVISION_MISMATCH）。",
      };
    }

    this.dataset = {
      ...this.dataset,
      candidates: this.dataset.candidates.map((c) =>
        c.id === input.candidateId
          ? { ...c, body: input.body, wordCount: input.body.replace(/\s+/g, "").length }
          : c,
      ),
    };

    return {
      ok: true,
      revision: input.baseRevision + 1,
      savedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    };
  }

  async resolveReview(_bookId: string, itemId: string): Promise<readonly ReviewItem[]> {
    await wait(180);
    this.dataset = {
      ...this.dataset,
      reviewItems: this.dataset.reviewItems.map((item) =>
        item.id === itemId ? { ...item, status: "resolved" as const } : item,
      ),
    };
    return this.dataset.reviewItems;
  }

  async waiveReview(_bookId: string, _chapterId: string, itemId: string, reason: string): Promise<readonly ReviewItem[]> {
    await wait(180);
    const target = this.dataset.reviewItems.find((item) => item.id === itemId);
    // Hard integrity findings can never be waived from the UI (docs/03 §3.4).
    if (!target || !target.waivable) {
      throw new WorkbenchUnavailableError("该完整性错误不可在界面中豁免。");
    }
    this.dataset = {
      ...this.dataset,
      reviewItems: this.dataset.reviewItems.map((item) =>
        item.id === itemId ? { ...item, status: "waived" as const, waiverReason: reason } : item,
      ),
    };
    return this.dataset.reviewItems;
  }

  async adoptCandidate(_bookId: string, candidateId: string): Promise<readonly Candidate[]> {
    await wait(200);
    const target = this.dataset.candidates.find((c) => c.id === candidateId);
    if (!target) return this.dataset.candidates;

    const nextRevision = Math.max(...this.dataset.candidates.map((c) => c.revision)) + 1;
    const adopted: Candidate = {
      ...target,
      id: `c-adopted-${Date.now().toString(36)}`,
      label: `已采纳 ${target.label}`,
      source: "hand",
      revision: nextRevision,
      updatedAt: "刚刚",
      isFormal: false,
    };
    // Adopting appends a new candidate; it never overwrites the others.
    this.dataset = {
      ...this.dataset,
      candidates: [...this.dataset.candidates, adopted],
    };
    return this.dataset.candidates;
  }

  async cancelTask(taskId: string): Promise<readonly WorkTask[]> {
    await wait(180);
    this.dataset = {
      ...this.dataset,
      tasks: this.dataset.tasks.map((task) => {
        if (task.id !== taskId) return task;
        // Running work enters a two-phase cancel; queued work cancels outright.
        return task.state === "running"
          ? { ...task, state: "canceling" as const }
          : { ...task, state: "canceled" as const };
      }),
    };
    return this.dataset.tasks;
  }

  async setRuleEnabled(ruleId: string, enabled: boolean): Promise<readonly RuleSetting[]> {
    await wait(160);
    this.dataset = {
      ...this.dataset,
      rules: this.dataset.rules.map((rule) => (rule.id === ruleId ? { ...rule, enabled } : rule)),
    };
    return this.dataset.rules;
  }

  async approveOutline(
    _bookId: string,
    _chapterId: string,
    revision: number,
    outline?: { readonly goal?: string },
  ): Promise<number> {
    await wait(200);
    // Mirror the live behaviour: the edited goal is saved, and only then is the
    // (unchanged) revision approved, so the approved text is what the author sees.
    if (outline?.goal !== undefined) {
      this.dataset = {
        ...this.dataset,
        outline: { ...this.dataset.outline, goal: outline.goal },
      };
    }
    return revision;
  }

  async commit(input: CommitInput): Promise<CommitOutcome> {
    await wait(260);
    if (this.scenario === "conflict") {
      return { accepted: false, code: "409", message: "演示数据：基线已更新（模拟 409 STALE_BASE），候选已保留。" };
    }
    if (this.scenario === "error") {
      return { accepted: false, code: "503", message: "演示数据：需要先完成恢复流程（模拟 503 RECOVERY_REQUIRED）。" };
    }
    const blocking = this.dataset.reviewItems.filter((item) => item.severity === "block" && item.status === "open");
    if (blocking.length > 0) {
      return {
        accepted: false,
        code: "422",
        message: `演示数据：仍有 ${blocking.length} 条阻断项未处理（模拟 422 REVIEW_BLOCKED）。`,
      };
    }
    const selected = this.dataset.candidates.find((c) => c.id === input.candidateId);
    if (selected?.archived) {
      return {
        accepted: false,
        code: "422",
        message: "演示数据：历史版本不能直接提交，请先基于它创建候选。",
      };
    }
    this.dataset = {
      ...this.dataset,
      candidates: this.dataset.candidates.map((c) =>
        c.id === input.candidateId ? { ...c, isFormal: true, label: `正式稿 r${c.revision}` } : c,
      ),
    };
    return { accepted: true, code: "201", commitId: `commit-demo-${input.idempotencyKey.slice(-6)}`, message: "演示数据：已记录一次模拟提交回执。" };
  }
}

/** Shape of GET /books/:id/chapters/:num/plan-approval. */
interface ApiPlanApproval {
  readonly revision: number;
  readonly approvedRevision: number | null;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
  readonly approved: boolean;
  readonly dirty: boolean;
}

/** Shape of GET /books/:id/chapters/:num/workspace. */
interface ApiWorkspace {
  readonly chapterNumber: number;
  readonly brief: string;
  readonly plan: string | null;
  readonly versions: readonly {
    readonly id: string;
    readonly source: string;
    readonly createdAt: string;
    readonly characterCount: number;
  }[];
  readonly canDelete: boolean;
  /**
   * Authoritative monotonic revision for the chapter. Optional so an older
   * server that does not send it still works (fallback: version count + 1).
   */
  readonly revision?: number | null;
  /** The chapter's own index entry, so a single-chapter refresh need not fetch the whole index. */
  readonly chapter?: ApiChapter | null;
}

const VERSION_SOURCE_TO_CANDIDATE: Record<string, Candidate["source"]> = {
  manual: "hand",
  agent: "generated",
  revision: "revised",
  regeneration: "generated",
  restore: "imported",
};

function chapterPath(bookId: string, chapterNumber: number): string {
  return `/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}`;
}

/**
 * Live implementation, wired to the real chapter transaction system.
 *
 * The backend already owns the candidate → review → commit chain:
 *   - candidate text   = the chapter file, replaced through a transactional edit
 *                        that archives the previous text as a version
 *   - review state     = chapter index status (`ready-for-review`, `audit-failed`,
 *                        `state-degraded`, `approved`, …) plus recorded audit issues
 *   - commit           = `POST …/approve`, which promotes the pending text
 *   - rollback         = `POST …/reject`
 *
 * So this adapter maps the workbench onto those endpoints instead of inventing a
 * parallel store. Capabilities with no real backend contract yet (per-finding
 * waive, task cancellation, analytics, research) keep reporting 不可用 rather
 * than pretending to work.
 */
class LiveSource implements WorkbenchSource {
  readonly mode = "live" as const;

  /** Last dataset built by load(), so writes can return coherent follow-up state. */
  private dataset: WorkbenchDataset | null = null;

  private refuse(message = "该能力尚未接入后端，正式模式下不可用。"): never {
    throw new WorkbenchUnavailableError(message);
  }

  async load(): Promise<WorkbenchDataset> {
    const base = emptyWorkbenchDataset();
    let apiBooks: readonly ApiBookSummary[] = [];
    try {
      const list = await fetchJson<{ books?: readonly ApiBookSummary[] }>("/books");
      apiBooks = list.books ?? [];
    } catch (error) {
      this.dataset = base;
      throw error;
    }
    if (apiBooks.length === 0) {
      this.dataset = base;
      return base;
    }

    // The chapter index lives behind per-book detail. Fetch the bounded set in
    // parallel instead of one await per book; `Promise.all` preserves order, so
    // the aggregated chapter list is identical.
    const detailedBooks = await Promise.all(apiBooks.slice(0, 20).map(async (apiBook) => {
      try {
        const detail = await fetchJson<{ chapters?: readonly ApiChapter[] }>(
          `/books/${encodeURIComponent(apiBook.id)}`,
        );
        return { id: apiBook.id, chapters: detail.chapters ?? [] };
      } catch {
        // A book whose detail cannot be read simply contributes no chapters,
        // and its word count stays unknown rather than being estimated.
        return null;
      }
    }));
    const chapters: Chapter[] = [];
    const loadedBookIds = new Set<string>();
    for (const entry of detailedBooks) {
      if (!entry) continue;
      loadedBookIds.add(entry.id);
      for (const raw of entry.chapters) {
        chapters.push(mapChapter(entry.id, raw));
      }
    }

    // Aggregate the real per-chapter counts that were just loaded. A book whose
    // chapters could not be read reports `null`, so the list can say "未知"
    // instead of showing a plan as if it were a measurement.
    const wordsByBook = new Map<string, number>();
    for (const chapter of chapters) {
      wordsByBook.set(chapter.bookId, (wordsByBook.get(chapter.bookId) ?? 0) + chapter.wordCount);
    }
    const books = apiBooks.map((apiBook) => mapBook(
      apiBook,
      loadedBookIds.has(apiBook.id) ? (wordsByBook.get(apiBook.id) ?? 0) : null,
    ));


    // Bind the workspace to the chapter the author most likely needs next: a
    // chapter awaiting review, else the latest chapter.
    const focus = pickFocusChapter(chapters);
    let candidates: readonly Candidate[] = [];
    let outline = base.outline;
    let reviewItems: readonly ReviewItem[] = [];
    if (focus) {
      const loaded = await this.loadChapterWorkingSet(focus);
      candidates = loaded.candidates;
      outline = loaded.outline;
      reviewItems = loaded.reviewItems;
      // Reflect the real approval state on the focused chapter, so the
      // "细纲有未批准变更" badge is driven by data rather than hardcoded false.
      const index = chapters.indexOf(focus);
      if (index >= 0) {
        chapters[index] = {
          ...focus,
          outlineApproved: loaded.approval?.approved ?? false,
          outlineDirty: loaded.approval?.dirty ?? false,
        };
      }
    }

    const counters = reviewCounters(reviewItems);
    const dataset: WorkbenchDataset = {
      ...base,
      books,
      chapters,
      candidates,
      outline,
      reviewItems,
      unavailable: [
        { id: "research", label: "研究与分析", reason: "研究资料接口尚未接入。" },
        { id: "analytics", label: "连载分析", reason: "连续性/承诺/节奏数据尚未接入。" },
        { id: "export", label: "导出发布", reason: "导出历史接口尚未接入。" },
      ],
      commitPreview: focus
        ? buildCommitPreview(focus, candidates, counters)
        : base.commitPreview,
      export: {
        ...base.export,
        submittedChapters: chapters.filter((c) => c.stage === "committed").length,
        candidateChapters: chapters.filter((c) => c.stage === "in_review").length,
        head: focus ? `第 ${focus.number} 章` : "",
        headCommitId: focus ? `${focus.bookId}#${focus.number}` : "",
      },
    };
    this.dataset = dataset;
    return dataset;
  }

  /** Read the real plan, version history, brief and audit issues for one chapter. */
  private async loadChapterWorkingSet(chapter: Chapter): Promise<{
    candidates: readonly Candidate[];
    outline: WorkbenchDataset["outline"];
    approval: ApiPlanApproval | null;
    chapterRecord: ApiChapter | null;
    reviewItems: readonly ReviewItem[];
  }> {
    const path = chapterPath(chapter.bookId, chapter.number);

    // Issue the independent reads together: this used to be four sequential
    // round-trips per chapter selection (body, workspace, findings, approval).
    const [bodyResult, workspaceResult, findingsResult, approvalResult] = await Promise.all([
      fetchJson<{ content?: string }>(path).catch(() => null),
      fetchJson<ApiWorkspace>(`${path}/workspace`).catch(() => null),
      fetchJson<{ findings?: readonly Finding[]; source?: string }>(`${path}/findings`).catch(() => null),
      // Real approval state. `null` means it could not be read, which is
      // different from "not approved" and is kept distinguishable to the UI.
      fetchJson<ApiPlanApproval>(`${path}/plan-approval`).catch(() => null),
    ]);

    const workingText = bodyResult?.content ?? "";
    const brief = workspaceResult?.brief ?? "";
    const plan = workspaceResult?.plan ?? null;
    const versions = workspaceResult?.versions ?? [];
    // Prefer the server's authoritative revision over the archived-version count:
    // the count is capped by retention and plateaus, which would desync the
    // optimistic-lock base from the server after ~20 saves.
    const liveRevision = typeof workspaceResult?.revision === "number" ? workspaceResult.revision : null;
    const chapterRecord = workspaceResult?.chapter ?? null;
    const currentRevision = liveRevision ?? versions.length + 1;

    // Prefer the structured findings store over the index projection. The index
    // summary cannot express a waiver's status, so index-derived rows keep
    // showing a waived blocker as blocking while the commit gate (which reads
    // the store) disagrees. `source: "store"` distinguishes "store says none"
    // from "no store yet, fall back to the projection".
    const storeFindings: readonly Finding[] | null =
      findingsResult?.source === "store" && Array.isArray(findingsResult.findings)
        ? findingsResult.findings
        : null;
    const approval = approvalResult;

    const candidates: Candidate[] = [];
    if (workingText.trim()) {
      candidates.push({
        id: `${chapter.id}-current`,
        label: chapter.stage === "approved" || chapter.stage === "committed" ? "正式稿" : "当前候选稿",
        revision: currentRevision,
        source: "hand",
        updatedAt: chapter.updatedAt,
        baseline: versions.length > 0 ? `基于 ${versions.length} 个历史版本` : "初始稿",
        wordCount: workingText.replace(/\s+/g, "").length,
        body: workingText,
        isFormal: chapter.stage === "approved" || chapter.stage === "committed",
        bookId: chapter.bookId,
        chapterId: chapter.id,
        archived: false,
      });
    }

    // Recent history is enough for a usable diff view; bodies are fetched only
    // for a bounded window, in parallel, so loading stays predictable.
    const recentVersions = versions.slice(-4);
    const versionBodies = await Promise.all(recentVersions.map((version) => (
      fetchJson<{ content?: string }>(`${path}/versions/${encodeURIComponent(version.id)}`)
        .then((response) => response.content ?? "")
        .catch(() => "")
    )));
    recentVersions.forEach((version, index) => {
      candidates.push({
        id: version.id,
        label: `${VERSION_LABEL[version.source] ?? "历史版本"} · ${formatStamp(version.createdAt)}`,
        revision: Math.max(1, versions.indexOf(version) + 1),
        source: VERSION_SOURCE_TO_CANDIDATE[version.source] ?? "hand",
        updatedAt: version.createdAt,
        baseline: "历史版本",
        wordCount: version.characterCount,
        body: versionBodies[index] ?? "",
        isFormal: false,
        bookId: chapter.bookId,
        chapterId: chapter.id,
        // An archived version is a record, not a draft: it can be read and
        // diffed, and can seed a new candidate, but editing it in place would
        // let one keystroke replace the live chapter with old text.
        archived: true,
      });
    });

    const outline: WorkbenchDataset["outline"] = {
      chapterId: chapter.id,
      goal: (brief || firstLine(plan) || "").trim(),
      beats: buildBeats(plan),
      characters: [],
      constraints: [],
      approvedRevision: approval?.approvedRevision ?? null,
      currentRevision: approval?.revision ?? (plan ? 1 : 0),
      approvedAt: approval?.approvedAt ?? null,
      approvedBy: approval?.approvedBy ?? null,
    };

    return {
      candidates,
      outline,
      approval,
      chapterRecord,
      reviewItems: buildReviewItems(
        chapter,
        storeFindings ?? chapter.findings ?? projectChapterFindings({
          number: chapter.number,
          auditIssues: chapter.auditIssues ?? [],
        }),
      ),
    };
  }

  /**
   * Load one chapter's working set on demand.
   *
   * The store calls this whenever the selected chapter changes, so the editor,
   * the candidate list and the review panel always describe the chapter on
   * screen. Resolution is strict — an unknown chapter returns null instead of
   * falling back to a neighbouring one.
   */
  async loadChapterContext(bookId: string, chapterId: string): Promise<ChapterContextResult | null> {
    const resolved = this.resolveTarget(bookId, chapterId);
    if (!resolved) return null;
    const loaded = await this.loadChapterWorkingSet(resolved);
    const counters = reviewCounters(loaded.reviewItems);
    // Prefer the entry that came with the workspace; fall back to the index only
    // if the workspace did not carry one.
    const record = loaded.chapterRecord
      ?? await this.readChapterRecord(resolved.bookId, resolved.number);
    const fresh = record ? mapChapter(resolved.bookId, record) : resolved;
    const stamped: Chapter = {
      ...fresh,
      outlineApproved: loaded.approval?.approved ?? false,
      outlineDirty: loaded.approval?.dirty ?? false,
    };
    return {
      bookId: stamped.bookId,
      chapterId: stamped.id,
      candidates: loaded.candidates,
      outline: loaded.outline,
      reviewItems: loaded.reviewItems,
      commitPreview: buildCommitPreview(stamped, loaded.candidates, counters),
      outlineApproved: stamped.outlineApproved,
      outlineDirty: stamped.outlineDirty,
      chapter: stamped,
    };
  }

  /**
   * Turn an archived version into the live candidate for a chapter.
   *
   * Uses the server's restore transaction, which archives the current text
   * first — so "restore" never destroys the version it replaces, and the chapter
   * comes back marked for review rather than silently approved.
   */
  async restoreVersion(bookId: string, chapterId: string, versionId: string): Promise<SaveResult> {
    const target = this.resolveTarget(bookId, chapterId);
    if (!target) {
      return { ok: false, error: "无法确定要恢复的章节，已放弃本次操作。" };
    }
    try {
      await fetchJson(
        `${chapterPath(target.bookId, target.number)}/versions/${encodeURIComponent(versionId)}/restore`,
        { method: "POST" },
      );
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "恢复历史版本失败。",
      };
    }
    await this.refreshChapter(target);
    return {
      ok: true,
      revision: (await this.readRevision(target)) ?? undefined,
      savedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    };
  }

  async auditChapter(bookId: string, chapterId: string): Promise<{ ok: boolean; error?: string }> {
    const target = this.resolveTarget(bookId, chapterId);
    if (!target) {
      return { ok: false, error: "无法确定要审核的章节。" };
    }
    try {
      await fetchJson(
        `/books/${encodeURIComponent(target.bookId)}/audit/${target.number}`,
        { method: "POST" },
      );
      await this.refreshChapter(target);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "重新审核失败。",
      };
    }
  }

  async generateNextChapter(bookId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await fetchJson(`/books/${encodeURIComponent(bookId)}/write-next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "触发生成正文失败。",
      };
    }
  }

  async planNextChapter(bookId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await fetchJson(`/books/${encodeURIComponent(bookId)}/plan`, { method: "POST" });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "规划新章节失败。",
      };
    }
  }

  async saveDraft(input: SaveDraftInput): Promise<SaveResult> {
    const target = this.resolveTarget(input.bookId, input.chapterId);
    if (!target) {
      return {
        ok: false,
        error: "无法确定要保存到哪一章，已放弃本次保存以保护现有正文。请重新选择章节后再试。",
      };
    }
    // An archived version is a record, not a draft. Saving prose over the live
    // chapter because an old version happened to be selected would destroy the
    // current text.
    const selected = this.dataset?.candidates.find((candidate) => candidate.id === input.candidateId);
    if (selected?.archived) {
      return {
        ok: false,
        error: "历史版本是只读记录，不能直接保存。请基于它创建候选后再编辑。",
      };
    }

    // The server owns the concurrency decision and does it inside the book lock.
    // This client only forwards its base revision and reports the verdict, so
    // two tabs cannot both believe they hold r3.
    let response: {
      revision?: number;
      contentHash?: string;
      error?: string;
      currentRevision?: number;
    };
    try {
      response = await fetchJson<{
        revision?: number;
        contentHash?: string;
        error?: string;
        currentRevision?: number;
      }>(chapterPath(target.bookId, target.number), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: input.body,
          ...(typeof input.baseRevision === "number" ? { baseRevision: input.baseRevision } : {}),
        }),
      });
    } catch (error) {
      // A 412 arrives as a thrown response; surface it as a conflict, not a
      // generic failure, so the editor can offer a rebase.
      const status = (error as { status?: number }).status;
      const payload = (error as { payload?: { currentRevision?: number } }).payload;
      if (status === 412) {
        return {
          ok: false,
          conflict: true,
          conflictRevision: payload?.currentRevision ?? input.baseRevision,
          error: "服务端正文已变化，本地文本未被覆盖。请先比较差异再决定。",
        };
      }
      return {
        ok: false,
        error: error instanceof Error ? error.message : "保存候选失败。",
      };
    }

    const revision = response.revision ?? input.baseRevision + 1;
    await this.refreshChapter(target);
    return {
      ok: true,
      revision,
      savedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    };
  }

  async commit(input: CommitInput): Promise<CommitOutcome> {
    const target = this.resolveTarget(input.bookId, input.chapterId);
    if (!target) {
      return { accepted: false, code: "422", message: "无法确定要提交的章节，已放弃本次提交。" };
    }

    // Approving writes the live chapter. An archived version is a read-only
    // record, so committing it would silently approve whatever text is live
    // instead. Refuse and point at the supported path.
    const selected = this.dataset?.candidates.find((candidate) => candidate.id === input.candidateId);
    if (selected?.archived) {
      return {
        accepted: false,
        code: "422",
        message: "所选的是历史版本，不能直接提交。请先用“基于此版本创建候选”将其设为当前候选，重新审核后再提交。",
      };
    }

    const fresh = await this.readChapterRecord(target.bookId, target.number);
    // Show the gate before spending a request, using the same finding policy the
    // server will enforce.
    const findings = projectChapterFindings({
      number: target.number,
      auditIssues: fresh?.auditIssues ?? [],
    });
    const blockers = blockingFindings(findings);
    if (blockers.length > 0) {
      return {
        accepted: false,
        code: "422",
        message: `仍有 ${blockers.length} 条阻断项未处理，无法提交正式稿。`,
      };
    }

    try {
      const result = await fetchJson<{
        ok?: boolean;
        idempotent?: boolean;
        receipt?: { commitId?: string; committedAt?: string; revision?: number };
        error?: string;
        message?: string;
        currentRevision?: number;
      }>(`${chapterPath(target.bookId, target.number)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The idempotency key is actually sent now. It used to be shown in the
        // dialog and then dropped, so a retry committed a second time.
        body: JSON.stringify({
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
          ...(typeof input.revision === "number" ? { baseRevision: input.revision } : {}),
        }),
      });
      if (!result.ok) {
        return { accepted: false, code: "503", message: "提交未成功，请稍后重试。" };
      }
      await this.refreshChapter(target);
      // The receipt is the server's, not a client-side timestamp.
      return {
        accepted: true,
        code: "201",
        commitId: result.receipt?.commitId ?? "",
        message: `第 ${target.number} 章已批准为正式稿。`,
      };
    } catch (error) {
      const status = (error as { status?: number }).status;
      const payload = (error as {
        payload?: { error?: string; message?: string; currentRevision?: number };
      }).payload;
      if (status === 409 || status === 412) {
        return {
          accepted: false,
          code: status === 409 ? "409" : "412",
          message: payload?.message ?? "章节基线已变化，请刷新后重新确认。",
        };
      }
      if (status === 422) {
        return {
          accepted: false,
          code: "422",
          message: payload?.message ?? "门禁未通过，无法提交。",
        };
      }
      if (status === 404) {
        return { accepted: false, code: "422", message: payload?.message ?? "章节不存在。" };
      }
      return {
        accepted: false,
        code: "503",
        message: error instanceof Error ? error.message : "提交失败。",
      };
    }
  }

  /** Real per-finding handling is not exposed by the backend; editing or
   *  re-auditing is the supported path. Report that instead of faking a resolve. */
  async resolveReview(): Promise<readonly ReviewItem[]> {
    return this.refuse("审计问题需要在正文中处理或重新审核；暂不支持逐条标记。");
  }
  /**
   * Waive one finding, with a recorded reason.
   *
   * The waiver is written to the per-chapter finding store, not to the chapter
   * index, so exempting a single rule stays a small independent write. Findings
   * with no stable rule identity (entries projected from pre-finding chapters)
   * cannot be waived, because there is nothing durable to attach the waiver to.
   */
  async waiveReview(
    bookId: string,
    chapterId: string,
    itemId: string,
    reason: string,
  ): Promise<readonly ReviewItem[]> {
    const target = this.resolveTarget(bookId, chapterId);
    if (!target) {
      throw new WorkbenchUnavailableError("无法确定要豁免的章节，本次操作已取消。");
    }
    await fetchJson(
      `${chapterPath(target.bookId, target.number)}/findings/${encodeURIComponent(itemId)}/waive`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      },
    );
    // Re-read so the returned rows reflect what the server actually stored.
    const fresh = await this.readChapterRecord(target.bookId, target.number);
    if (fresh) {
      const next = mapChapter(target.bookId, fresh);
      const context = await this.loadChapterWorkingSet(next);
      return context.reviewItems;
    }
    return [];
  }
  async adoptCandidate(): Promise<readonly Candidate[]> {
    return this.refuse("采纳候选请直接在正文编辑器中保存候选稿。");
  }
  async cancelTask(): Promise<readonly WorkTask[]> {
    return this.refuse("任务取消接口尚未接入。");
  }
  async setRuleEnabled(): Promise<readonly RuleSetting[]> {
    return this.refuse("规则开关接口尚未接入。");
  }
  /**
   * Approve the current outline revision.
   *
   * The server compares the revision the client approved against the plan on
   * disk, so approving a revision the author never saw is refused rather than
   * recorded. `null` is returned when the server refused, so the caller can
   * report the reason instead of pretending it worked.
   */
  async approveOutline(
    bookId: string,
    chapterId: string,
    revision: number,
    outline?: { readonly goal?: string },
  ): Promise<number> {
    const target = this.resolveTarget(bookId, chapterId);
    if (!target) {
      throw new WorkbenchUnavailableError("无法确定要批准的章节。");
    }
    // Persist the edited goal *before* approving. Approving only records a
    // revision; without this the author approved the previous goal and their edit
    // was discarded on the next refresh.
    if (outline?.goal !== undefined) {
      await fetchJson(`${chapterPath(target.bookId, target.number)}/workspace/brief`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: outline.goal }),
      });
    }
    const result = await fetchJson<{ approval?: { revision?: number }; state?: ApiPlanApproval }>(
      `${chapterPath(target.bookId, target.number)}/plan-approval`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: revision }),
      },
    );
    await this.refreshChapter(target);
    return result.approval?.revision ?? result.state?.revision ?? revision;
  }

  /**
   * Resolve the real chapter a write targets.
   *
   * Resolution is exact or nothing. The previous version of this method fell
   * back to "the last chapter of the book" and then to "the focused chapter"
   * when it could not tell — which meant that editing an archived version, or
   * saving after a chapter switch, could write the text into a different
   * chapter than the one on screen. Guessing is never acceptable for a write, so
   * an unresolved target now fails the write instead.
   *
   * Accepted inputs:
   *   - a real chapter id;
   *   - a candidate id derived from a chapter id (`<chapterId>-current`);
   *   - a placeholder book id (`"current"`) together with a chapter-scoped id.
   */
  private resolveTarget(bookId: string, chapterId: string): Chapter | null {
    const chapters = this.dataset?.chapters ?? [];
    if (chapters.length === 0) return null;

    const exact = chapters.find((chapter) => chapter.id === chapterId);
    if (exact) return exact;

    // Candidate ids are `<chapterId>-<suffix>` (e.g. `book-ch-10-current`). A
    // bare `startsWith(chapter.id)` matched `book-ch-1` for `book-ch-10-...`,
    // sending the commit to chapter 1. Require a segment boundary and prefer
    // the longest (most specific) match.
    const prefixed = chapters
      .filter((chapter) => (
        chapterId.startsWith(`${chapter.id}-`)
        || chapterId.startsWith(`${chapter.id}:`)
      ))
      .sort((left, right) => right.id.length - left.id.length)[0];
    if (prefixed) return prefixed;

    // A placeholder book id may only be resolved through the candidate's own
    // chapter scoping, never by picking a chapter on the caller's behalf.
    return null;
  }

  private async readChapterRecord(bookId: string, chapterNumber: number): Promise<ApiChapter | null> {
    try {
      const detail = await fetchJson<{ chapters?: readonly ApiChapter[] }>(
        `/books/${encodeURIComponent(bookId)}`,
      );
      return (detail.chapters ?? []).find((c) => c.number === chapterNumber) ?? null;
    } catch {
      return null;
    }
  }

  private async readRevision(chapter: Chapter): Promise<number | null> {
    try {
      const ws = await fetchJson<ApiWorkspace>(`${chapterPath(chapter.bookId, chapter.number)}/workspace`);
      return typeof ws.revision === "number" ? ws.revision : (ws.versions ?? []).length + 1;
    } catch {
      return null;
    }
  }

  /** Re-read one chapter's real state and fold it back into the cached dataset. */
  private async refreshChapter(chapter: Chapter): Promise<void> {
    if (!this.dataset) return;
    const record = await this.readChapterRecord(chapter.bookId, chapter.number);
    if (!record) return;
    const next = mapChapter(chapter.bookId, record);
    const context = await this.loadChapterWorkingSet(next);
    const counters = reviewCounters(context.reviewItems);
    const stamped: Chapter = {
      ...next,
      outlineApproved: context.approval?.approved ?? false,
      outlineDirty: context.approval?.dirty ?? false,
    };
    this.dataset = {
      ...this.dataset,
      chapters: this.dataset.chapters.map((c) => (c.id === chapter.id ? stamped : c)),
      candidates: context.candidates,
      outline: context.outline,
      reviewItems: context.reviewItems,
      commitPreview: buildCommitPreview(stamped, context.candidates, counters),
    };
  }
}

const VERSION_LABEL: Record<string, string> = {
  manual: "手写",
  agent: "生成",
  revision: "修订",
  regeneration: "重生成",
  restore: "恢复",
};

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function firstLine(text: string | null): string {
  if (!text) return "";
  const line = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  return line.replace(/^#+\s*/, "");
}

/** Extract checklist items from a chapter plan document, when it has any. */
function buildBeats(plan: string | null): readonly OutlineBeat[] {
  if (!plan) return [];
  const lines = plan.split(/\r?\n/).map((l) => l.trim());
  const picked = lines.filter((l) => /^[-*]\s+\[[ xX]\]/.test(l) || /^[-*]\s+/.test(l));
  return picked.slice(0, 12).map((line, index) => ({
    id: `beat-${index + 1}`,
    text: line.replace(/^[-*]\s+(\[[ xX]\]\s*)?/, "").trim(),
    mandatory: /\[[ xX]\]/.test(line),
    addressed: /\[[xX]\]/.test(line),
  }));
}

/** The workbench UI speaks block/warn/suggest; core's finding model speaks
 *  critical/warning/info. One mapping, in one place. */
const SEVERITY_TO_UI: Record<Finding["severity"], Severity> = {
  critical: "block",
  warning: "warn",
  info: "suggest",
};

/**
 * Adapt core findings onto the workbench's review rows.
 *
 * Everything shown here — severity, message, suggestion, evidence — comes from
 * the finding model. Entries projected from pre-finding chapters carry no
 * suggestion, so the UI says so explicitly instead of rendering a blank.
 */
function buildReviewItems(chapter: Chapter, findings: readonly Finding[]): readonly ReviewItem[] {
  return findings.map((finding) => {
    const legacy = finding.source === "legacy";
    return {
      id: finding.id,
      severity: SEVERITY_TO_UI[finding.severity],
      rule: finding.rule,
      ruleGroup: legacy ? "审计（早期记录）" : "审计",
      summary: finding.message,
      suggestion: finding.suggestion
        || (legacy
          ? "该问题由早期版本记录，缺少修改建议；建议修改正文后重新触发审核。"
          : "修改正文后重新触发审核；审计通过后即可提交。"),
      confidence: "high",
      // Preserved verbatim: an unverified check is shown as 未验证 rather than
      // flattened into 待处理, which would discard the one distinction that
      // matters. See core's finding model for why.
      status: finding.status,
      evidence: {
        chapterId: chapter.id,
        chapterLabel: `第 ${chapter.number} 章`,
        quote: finding.evidence.quote ?? chapter.title,
        offset: finding.evidence.offset ?? 0,
      },
      waiverReason: finding.waiver?.reason ?? null,
      waivable: isWaivable(finding),
    };
  });
}

/**
 * Split review items into the three things the commit gate reasons about.
 *
 * `unverified` is counted separately from `block` and from `warn`: it is not a
 * problem the author can fix, it is a check that did not produce a verdict, and
 * the gate treats it as blocking for that reason.
 */
export function reviewCounters(reviewItems: readonly ReviewItem[]): {
  readonly blocking: number;
  readonly warnings: number;
  readonly unverified: number;
} {
  let blocking = 0;
  let warnings = 0;
  let unverified = 0;
  for (const item of reviewItems) {
    if (item.status === "unverified") {
      unverified += 1;
      continue;
    }
    if (item.status !== "open") continue;
    if (item.severity === "block") blocking += 1;
    else if (item.severity === "warn") warnings += 1;
  }
  return { blocking, warnings, unverified };
}

export function buildCommitPreview(
  chapter: Chapter,
  candidates: readonly Candidate[],
  counters: { readonly blocking: number; readonly warnings: number; readonly unverified: number },
  selectedCandidateId?: string,
): WorkbenchDataset["commitPreview"] {
  // Prefer the candidate the author actually selected: the dialog claims to
  // describe that one, and committing a different candidate would be a silent
  // bait-and-switch. Fall back to the formal draft, then the first candidate.
  const working = (selectedCandidateId
    ? candidates.find((c) => c.id === selectedCandidateId)
    : undefined)
    ?? candidates.find((c) => c.isFormal)
    ?? candidates[0]
    ?? null;
  // The delta is measured against the formal draft the candidate would replace.
  // It used to be a hardcoded 0, which the commit dialog displayed as
  // "字数变化 0 字" for every candidate regardless of length.
  const formalBaseline = candidates.find((c) => c.isFormal && c.id !== working?.id) ?? null;
  const wordDelta = working && formalBaseline
    ? working.wordCount - formalBaseline.wordCount
    : 0;

  // The audit gate must not claim "passed" just because nothing is critical.
  // Warnings are the author's call, but they are a call — reporting them as
  // 审计通过 hides a decision the product is asking the author to make, and a
  // chapter whose prose changed after its audit has no valid verdict at all.
  const auditPassed = counters.blocking === 0 && counters.warnings === 0
    && counters.unverified === 0 && !chapter.staleReview;
  const auditDetail = counters.blocking > 0
    ? `仍有 ${counters.blocking} 条阻断项`
    : chapter.staleReview
      ? "正文在最后一次审核后已改动，需重新审核"
      : counters.unverified > 0
        ? `${counters.unverified} 项检查未完成，不能视为通过`
        : counters.warnings > 0
          ? `${counters.warnings} 条警告需作者确认`
          : "无未处理审计问题";

  const gates: CommitGate[] = [
    {
      id: "gate-audit",
      label: "审计通过",
      state: counters.blocking > 0 || chapter.staleReview || counters.unverified > 0
        ? "block"
        : counters.warnings > 0 ? "warn" : "pass",
      detail: auditDetail,
    },
    {
      id: "gate-status",
      label: "章节状态",
      state: chapter.stage === "approved" || chapter.stage === "committed" ? "pass" : "warn",
      detail: chapter.stage === "approved" || chapter.stage === "committed"
        ? "已是正式稿"
        : "提交后将批准为正式稿",
    },
    {
      id: "gate-candidate",
      label: "候选稿",
      state: !working ? "block" : working.archived ? "block" : "pass",
      detail: !working
        ? "没有可提交的正文"
        : working.archived
          ? `${working.label} 是历史版本，需先“基于此版本创建候选”并重新审核`
          : `来自 ${working.label}`,
    },
  ];
  return {
    candidateId: working?.id ?? "",
    baseline: working?.baseline ?? "无",
    wordDelta,
    statusChange: chapter.stage === "approved" || chapter.stage === "committed"
      ? "保持正式稿"
      : "待审 → 正式稿",
    gates,
    pendingIndexTasks: [],
    removable: false,
  };
}

function pickFocusChapter(chapters: readonly Chapter[]): Chapter | null {
  const needsReview = chapters.filter((c) => c.stage === "in_review");
  if (needsReview.length > 0) return needsReview[needsReview.length - 1];
  const drafts = chapters.filter((c) => c.stage === "drafting");
  if (drafts.length > 0) return drafts[drafts.length - 1];
  return chapters[chapters.length - 1] ?? null;
}

const demo = new DemoSource();
const live = new LiveSource();

export function getWorkbenchSource(demoMode: boolean): WorkbenchSource {
  return demoMode ? demo : live;
}

export function isUnavailable(error: unknown): boolean {
  return error instanceof WorkbenchUnavailableError
    || (error instanceof Error && (error as { code?: string }).code === "WORKBENCH_UNAVAILABLE");
}







