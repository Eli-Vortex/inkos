/**
 * Novel Creation workbench — typed state container.
 *
 * One zustand store (the same state library the host Studio uses) holding the
 * active area, the loaded dataset and the author-facing selections. The editor
 * text itself deliberately does NOT live here: it is owned by the chapter
 * buffer hook so that a keystroke never re-renders the whole workbench.
 */

import { create } from "zustand";
import type { WorkbenchDataset } from "../data/mock";
import { buildCommitPreview, getWorkbenchSource, isUnavailable, reviewCounters } from "../data/adapter";
import { fetchJson } from "../../hooks/use-api";
import { emptyWorkbenchDataset } from "../data/empty";
import type {
  DemoState,
  LoadState,
  RuleSetting,
  Severity,
  ReviewStatus,
  WorkbenchArea,
} from "../types";

export type WorkspaceView = "outline" | "prose" | "review" | "history";

export interface Toast {
  readonly id: string;
  readonly tone: "info" | "ok" | "warn" | "block";
  readonly title: string;
  readonly detail?: string;
}

export interface ReviewFilter {
  readonly severity: Severity | "all";
  readonly status: ReviewStatus | "all";
  readonly query: string;
}

/**
 * A page registers this while it holds work that navigation would destroy.
 *
 * `save` must return true only when the work is safely persisted; returning
 * false keeps the author on the current page rather than letting the transition
 * continue on top of lost text.
 */
export interface WorkbenchTransitionGuard {
  readonly hasUnsavedWork: () => boolean;
  readonly save: () => Promise<boolean>;
}

export interface PendingTransition {
  readonly description: string;
  readonly run: () => void | Promise<void>;
}

interface WorkbenchStore {
  area: WorkbenchArea;
  demoMode: boolean;
  scenario: DemoState;
  loadState: LoadState;
  loadError: string | null;
  dataset: WorkbenchDataset | null;

  activeBookId: string | null;
  activeChapterId: string | null;
  view: WorkspaceView;
  activeCandidateId: string | null;
  compareBaseId: string | null;
  compareTargetId: string | null;

  /**
   * State of the per-chapter working set. While this is `loading` the workspace
   * must not show the previous chapter's candidates or critique, so pages hide
   * that content rather than rendering something that belongs to another chapter.
   */
  chapterContextState: LoadState;
  chapterContextError: string | null;
  /** The `{bookId, chapterId}` the loaded context describes. */
  chapterContextKey: { readonly bookId: string; readonly chapterId: string } | null;

  reviewFilter: ReviewFilter;
  toasts: readonly Toast[];
  /** Evidence the author asked to jump to; consumed by the writing workspace. */
  pendingLocate: { readonly offset: number; readonly token: number } | null;
  /** True while an AI revise/fix request for the active chapter is in flight. */
  revising: boolean;
  /** Host navigation, injected by the shell so pages can change area. */
  navigator: ((area: WorkbenchArea) => void) | null;

  /**
   * Navigation guard.
   *
   * `beforeunload` only covers closing the tab, so an in-app navigation used to
   * discard unsaved prose silently. Every transition — area, book, chapter,
   * candidate — now routes through `requestTransition`, which parks the move and
   * asks when there is unsaved work.
   */
  transitionGuard: WorkbenchTransitionGuard | null;
  pendingTransition: PendingTransition | null;
  /** A server change that could not be applied yet because text was unsaved. */
  deferredServerEvent: { readonly action: "chapter" | "shelf"; readonly reason: string } | null;
  setTransitionGuard: (guard: WorkbenchTransitionGuard | null) => void;
  /** Run `run` immediately, or park it for confirmation when work is at risk. */
  requestTransition: (description: string, run: () => void | Promise<void>) => Promise<void>;
  /** Resolve a parked transition. `save` persists first and aborts on failure. */
  resolveTransition: (choice: "save" | "discard" | "cancel") => Promise<void>;
  /**
   * React to a server event.
   *
   * Another tab, the CLI or a background generation can change the chapter this
   * page is showing. Without this the page kept pre-change data until a manual
   * reload. The reload is deferred while there is unsaved work, because replacing
   * the working set would reset the editor and discard the author's text.
   */
  handleServerEvent: (event: string, data: unknown) => void;
  /** Apply a server change that arrived while the page held unsaved work. */
  flushDeferredServerEvent: () => Promise<void>;

  setArea: (area: WorkbenchArea) => void;
  setNavigator: (navigator: ((area: WorkbenchArea) => void) | null) => void;
  goArea: (area: WorkbenchArea) => void;
  setDemoMode: (enabled: boolean) => void;
  setScenario: (scenario: DemoState) => void;
  setView: (view: WorkspaceView) => void;
  setReviewFilter: (patch: Partial<ReviewFilter>) => void;
  load: () => Promise<void>;
  selectBook: (bookId: string) => Promise<void>;
  selectChapter: (chapterId: string) => Promise<void>;
  /** Reload the active chapter's working set (after a save or a commit). */
  refreshChapterContext: () => Promise<void>;
  selectCandidate: (candidateId: string) => void;
  setCompare: (baseId: string, targetId: string) => void;
  resolveReviewItem: (itemId: string) => Promise<void>;
  waiveReviewItem: (itemId: string, reason: string) => Promise<void>;
  adoptCandidate: (candidateId: string) => Promise<void>;
  /** Replace the live candidate with an archived version, via the server's restore transaction. */
  createCandidateFromVersion: (versionId: string) => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
  toggleRule: (ruleId: string, enabled: boolean) => Promise<void>;
  approveOutline: (outline?: { readonly goal?: string }) => Promise<void>;
  /** Plan the next chapter (the real "new chapter" action) and reload. */
  planNextChapter: () => Promise<void>;
  /** Trigger AI to write prose for the next planned chapter. */
  generateNextChapter: () => Promise<void>;
  /** Re-run the chapter audit, which is what clears a stale review. */
  auditChapter: () => Promise<void>;
  /** Ask the AI to revise the active chapter. `force` overwrites regardless of audit. */
  reviseChapter: (mode: string, force: boolean, brief?: string) => Promise<void>;
  /** Ask the AI to fix one specific review finding (local, scoped by its brief). */
  fixReviewItem: (itemId: string) => Promise<void>;
  pushToast: (toast: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
  requestLocate: (offset: number) => void;
}

let toastSeq = 0;
let loadRequestSeq = 0;

/**
 * Blank the per-chapter working set while a new chapter's data is loading.
 *
 * Rendering the previous chapter's candidates, outline or critique under the
 * newly selected chapter is worse than rendering nothing: it is confidently
 * wrong, and the author can act on it.
 */
function clearedWorkingSet(dataset: WorkbenchDataset): WorkbenchDataset {
  const blank = emptyWorkbenchDataset();
  return {
    ...dataset,
    candidates: [],
    outline: blank.outline,
    reviewItems: [],
    commitPreview: blank.commitPreview,
  };
}

const DEMO_STORAGE_KEY = "inkos.workbench.demo";

/**
 * Demo mode is opt-in. Production reads the author's real project; the mock
 * dataset is only served when the author (or a test) explicitly asks for it,
 * via the settings toggle, `?demo=1`, or a persisted preference.
 */
function initialDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("demo") === "1") return true;
    return window.localStorage.getItem(DEMO_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export const useWorkbench = create<WorkbenchStore>((set, get) => ({
  area: "writing",
  demoMode: initialDemoMode(),
  scenario: "normal",
  loadState: "idle",
  loadError: null,
  dataset: null,

  activeBookId: null,
  activeChapterId: null,
  view: "prose",
  activeCandidateId: null,
  compareBaseId: null,
  compareTargetId: null,
  chapterContextState: "idle",
  chapterContextError: null,
  chapterContextKey: null,

  reviewFilter: { severity: "all", status: "open", query: "" },
  toasts: [],
  pendingLocate: null,
  revising: false,
  navigator: null,
  transitionGuard: null,
  pendingTransition: null,
  deferredServerEvent: null,

  setTransitionGuard: (transitionGuard) => set({ transitionGuard }),

  handleServerEvent: (event, data) => {
    const { activeBookId, deferredServerEvent } = get();
    const bookId = (data as { bookId?: unknown } | null)?.bookId;
    if (typeof bookId === "string" && activeBookId && bookId !== activeBookId) return;

    // Refresh the visible chapter for a change to it; reload the shelf for
    // changes that add or remove chapters or books.
    const chapterOnly = new Set([
      "chapter:committed",
      "chapter:restored",
      "chapter:findings",
      "chapter:plan-approved",
      "audit:complete",
    ]);
    const shelfLevel = new Set([
      "chapter:deleted",
      "write:complete",
      "book:created",
      "book:deleted",
    ]);
    const action: "chapter" | "shelf" | null = chapterOnly.has(event)
      ? "chapter"
      : shelfLevel.has(event)
        ? "shelf"
        : null;
    if (!action) return;

    if (get().transitionGuard?.hasUnsavedWork()) {
      // Reloading now would replace the working set and reset the editor, losing
      // the author's text. Record it and apply after the next successful save.
      set({
        deferredServerEvent: { action, reason: event },
      });
      if (deferredServerEvent === null) {
        get().pushToast({
          tone: "info",
          title: "服务端数据已更新",
          detail: "你有未保存的改动；保存后会自动同步最新数据。",
        });
      }
      return;
    }

    void (action === "chapter" ? get().refreshChapterContext() : get().load());
  },

  /** Apply a change that arrived while the page held unsaved work. */
  flushDeferredServerEvent: async () => {
    const pending = get().deferredServerEvent;
    if (!pending) return;
    set({ deferredServerEvent: null });
    await (pending.action === "chapter" ? get().refreshChapterContext() : get().load());
  },

  requestTransition: async (description, run) => {
    const { transitionGuard } = get();
    if (!transitionGuard || !transitionGuard.hasUnsavedWork()) {
      await run();
      return;
    }
    // Park the move: nothing is discarded until the author chooses.
    set({ pendingTransition: { description, run } });
  },

  resolveTransition: async (choice) => {
    const pending = get().pendingTransition;
    if (!pending) return;
    if (choice === "cancel") {
      set({ pendingTransition: null });
      return;
    }
    if (choice === "save") {
      const guard = get().transitionGuard;
      const saved = guard ? await guard.save() : false;
      if (!saved) {
        // Keep the author on the page with the text intact rather than moving on
        // and losing it.
        set({ pendingTransition: null });
        get().pushToast({
          tone: "block",
          title: "未能保存，已留在当前页",
          detail: "请先解决保存问题，再切换页面。",
        });
        return;
      }
    }
    set({ pendingTransition: null });
    await pending.run();
  },

  setArea: (area) => set({ area }),
  setNavigator: (navigator) => set({ navigator }),
  goArea: (area) => {
    // Leaving the workspace unmounts the editor; unsaved prose must not vanish
    // silently, so the area change is guarded like any other navigation.
    void get().requestTransition(`切换到「${area}」`, () => {
      set({ area });
      get().navigator?.(area);
    });
  },
  setDemoMode: (demoMode) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(DEMO_STORAGE_KEY, demoMode ? "1" : "0");
      } catch {
        // Storage may be unavailable (private mode); the session still switches.
      }
    }
    set({ demoMode, dataset: null, loadState: "idle", loadError: null });
    void get().load();
  },
  setScenario: (scenario) => {
    set({ scenario });
    void get().load();
  },
  setView: (view) => set({ view }),
  setReviewFilter: (patch) => set({ reviewFilter: { ...get().reviewFilter, ...patch } }),

  load: async () => {
    const { demoMode, scenario } = get();
    const requestSeq = ++loadRequestSeq;
    set({ loadState: "loading", loadError: null });
    try {
      const dataset = await getWorkbenchSource(demoMode).load(scenario);
      // Switching demo/live mode or the preview scenario can start a second
      // request before the first finishes. Only the newest source may replace
      // the current workbench state.
      if (requestSeq !== loadRequestSeq) return;
      const previousBookId = get().activeBookId;
      const activeBookId = dataset.books.some((book) => book.id === previousBookId)
        ? previousBookId
        : dataset.books[0]?.id ?? null;
      // Chapters belong to a book; the workspace must never show another
      // book's chapters, so the preferred chapter is looked up inside the
      // active book only.
      const chapters = dataset.chapters.filter((chapter) => chapter.bookId === activeBookId);
      const preferredChapter = chapters.find((c) => c.id === get().activeChapterId) ?? chapters.find((c) => c.stage === "in_review") ?? chapters[0];
      const activeChapterId = preferredChapter?.id ?? null;
      const candidates = dataset.candidates;
      const activeCandidateId = candidates.find((c) => c.id === get().activeCandidateId)?.id
        ?? candidates.find((c) => c.id === dataset.commitPreview.candidateId)?.id
        ?? candidates[0]?.id
        ?? null;
      const compareBaseId = candidates.find((c) => c.isFormal)?.id ?? candidates[0]?.id ?? null;
      const compareTargetId = candidates.find((c) => !c.isFormal)?.id ?? candidates[0]?.id ?? null;
      set({
        dataset,
        loadState: "ready",
        activeBookId,
        activeChapterId,
        activeCandidateId,
        compareBaseId,
        compareTargetId,
        // `load()` already fetched the focus chapter's working set into the
        // dataset, so this context is valid as long as it names the chapter.
        chapterContextState: "ready",
        chapterContextError: null,
        chapterContextKey: activeChapterId && activeBookId
          ? { bookId: activeBookId, chapterId: activeChapterId }
          : null,
      });
      // `load()` fetched the working set for the focus chapter. Only fetch again
      // when the selected chapter is a different one — an empty chapter is a
      // perfectly valid state, and re-fetching it would turn "no text yet" into
      // a spurious load or error.
      const workingSetChapterId = dataset.outline.chapterId;
      if (activeBookId && activeChapterId && workingSetChapterId !== activeChapterId) {
        void get().refreshChapterContext();
      }
    } catch (error) {
      if (requestSeq !== loadRequestSeq) return;
      set({
        loadState: "error",
        loadError: error instanceof Error ? error.message : "读取失败。",
        dataset: null,
      });
    }
  },

  selectBook: async (bookId) => {
    // Switching books must not leave the previous book's chapter selected, and
    // the working set must be cleared before the new chapter's arrives — showing
    // the old book's candidates under the new book's name is how text ends up
    // saved into the wrong place.
    await get().requestTransition(
      "切换作品",
      async () => {
        const next = (get().dataset?.chapters ?? []).find((chapter) => chapter.bookId === bookId);
        set({
          activeBookId: bookId,
          activeChapterId: next?.id ?? null,
          activeCandidateId: null,
          ...(get().dataset ? { dataset: clearedWorkingSet(get().dataset!) } : {}),
          chapterContextState: next ? "loading" : "idle",
          chapterContextError: null,
          chapterContextKey: null,
        });
        if (next) await get().refreshChapterContext();
      },
    );
  },
  selectChapter: async (chapterId) => {
    await get().requestTransition(
      "切换章节",
      async () => {
        const { activeBookId } = get();
        const chapter = (get().dataset?.chapters ?? []).find((item) => item.id === chapterId);
        set({
          activeChapterId: chapterId,
          activeBookId: chapter?.bookId ?? activeBookId,
          activeCandidateId: null,
          ...(get().dataset ? { dataset: clearedWorkingSet(get().dataset!) } : {}),
          chapterContextState: "loading",
          chapterContextError: null,
          chapterContextKey: null,
        });
        await get().refreshChapterContext();
      },
    );
  },

  /**
   * Load the working set for the selected chapter.
   *
   * Every path that changes the selected chapter — switching books, switching
   * chapters, or saving — goes through here, so the editor, the candidate list
   * and the review panel are always describing the chapter on screen.
   */
  refreshChapterContext: async () => {
    const { activeBookId, activeChapterId, demoMode, dataset } = get();
    if (!activeBookId || !activeChapterId || !dataset) {
      set({ chapterContextState: "idle", chapterContextKey: null });
      return;
    }
    const requestKey = { bookId: activeBookId, chapterId: activeChapterId };
    set({ chapterContextState: "loading", chapterContextError: null });
    try {
      const context = await getWorkbenchSource(demoMode)
        .loadChapterContext(activeBookId, activeChapterId);
      const current = get();
      // A slower earlier request must not overwrite a newer chapter's context.
      if (
        current.activeBookId !== requestKey.bookId
        || current.activeChapterId !== requestKey.chapterId
        || !current.dataset
      ) {
        return;
      }
      if (!context) {
        // The chapter is in the list but its working set could not be resolved.
        // Reporting "ready" with nothing would look like an empty chapter; say
        // what actually happened instead.
        set({
          chapterContextState: "error",
          chapterContextError: "找不到该章节的数据，它可能已被删除。",
          chapterContextKey: requestKey,
        });
        return;
      }
      const candidateId = context.candidates.find((c) => c.id === current.activeCandidateId)?.id
        ?? context.candidates.find((c) => c.id === context.commitPreview.candidateId)?.id
        ?? context.candidates[0]?.id
        ?? null;
      set({
        dataset: {
          ...current.dataset,
          // Replace the chapter entry with the server's current version: its
          // status, word count and audit state all change when prose is saved or
          // committed, so the list must not keep the values it loaded with.
          chapters: current.dataset.chapters.map((chapter) => (
            chapter.id === context.chapterId ? context.chapter : chapter
          )),
          candidates: context.candidates,
          outline: context.outline,
          reviewItems: context.reviewItems,
          // Rebuild for the candidate that will actually be active, so the commit
          // dialog describes the same candidate the editor is showing.
          commitPreview: context.chapter
            ? buildCommitPreview(
                context.chapter,
                context.candidates,
                reviewCounters(context.reviewItems),
                candidateId ?? undefined,
              )
            : context.commitPreview,
        },
        activeCandidateId: candidateId,
        compareBaseId: context.candidates.find((c) => c.isFormal)?.id ?? context.candidates[0]?.id ?? null,
        compareTargetId: context.candidates.find((c) => !c.isFormal)?.id ?? context.candidates[0]?.id ?? null,
        chapterContextState: "ready",
        chapterContextError: null,
        chapterContextKey: requestKey,
      });
    } catch (error) {
      // A slower earlier request must not paint an error over the chapter the
      // author already switched to (same guard as the success path above).
      const current = get();
      if (
        current.activeBookId !== requestKey.bookId
        || current.activeChapterId !== requestKey.chapterId
      ) {
        return;
      }
      set({
        chapterContextState: "error",
        chapterContextError: error instanceof Error ? error.message : "章节数据读取失败。",
      });
    }
  },

  selectCandidate: (candidateId) => {
    // Selecting another candidate replaces the text in the editor, so it is a
    // navigation like any other and must not silently drop unsaved edits.
    void get().requestTransition("切换候选版本", () => {
      const current = get();
      const dataset = current.dataset;
      const next = dataset?.candidates.find((candidate) => candidate.id === candidateId);
      if (!dataset || !next) {
        set({ activeCandidateId: candidateId });
        return;
      }
      const chapter = dataset.chapters.find((c) => c.id === current.activeChapterId);
      set({
        activeCandidateId: candidateId,
        dataset: {
          ...dataset,
          // Rebuild the whole preview for the newly selected candidate, not just
          // its id: baseline, word delta and the candidate gate all describe which
          // candidate is being committed.
          commitPreview: chapter
            ? buildCommitPreview(chapter, dataset.candidates, reviewCounters(dataset.reviewItems), candidateId)
            : { ...dataset.commitPreview, candidateId },
        },
      });
    });
  },
  setCompare: (compareBaseId, compareTargetId) => set({ compareBaseId, compareTargetId }),

  resolveReviewItem: async (itemId) => {
    const { dataset, activeBookId, demoMode } = get();
    if (!dataset || !activeBookId) return;
    try {
      const reviewItems = await getWorkbenchSource(demoMode).resolveReview(activeBookId, itemId);
      set({ dataset: { ...dataset, reviewItems } });
      get().pushToast({ tone: "ok", title: "已标记处理", detail: "该审核项不会再次出现在待处理列表中。" });
    } catch (error) {
      get().pushToast({
        tone: "warn",
        title: isUnavailable(error) ? "能力不可用" : "操作未完成",
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  },

  waiveReviewItem: async (itemId, reason) => {
    const { dataset, activeBookId, activeChapterId, demoMode } = get();
    if (!dataset || !activeBookId || !activeChapterId) return;
    try {
      const reviewItems = await getWorkbenchSource(demoMode)
        .waiveReview(activeBookId, activeChapterId, itemId, reason);
      set({ dataset: { ...dataset, reviewItems } });
      get().pushToast({ tone: "warn", title: "已按误报豁免", detail: `原因已记录：${reason}` });
    } catch (error) {
      get().pushToast({
        tone: "block",
        title: "无法豁免",
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  },

  adoptCandidate: async (candidateId) => {
    const { dataset, activeBookId, demoMode } = get();
    if (!dataset || !activeBookId) return;
    try {
      const candidates = await getWorkbenchSource(demoMode).adoptCandidate(activeBookId, candidateId);
      set({ dataset: { ...dataset, candidates } });
      get().pushToast({ tone: "ok", title: "已采纳为新候选", detail: "正在编辑的正文没有被覆盖。" });
    } catch (error) {
      get().pushToast({
        tone: "warn",
        title: isUnavailable(error) ? "能力不可用" : "操作未完成",
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * Make an archived version the live candidate.
   *
   * The archive is immutable, so this goes through the server's restore
   * transaction: the current text is archived first and the chapter returns
   * marked for review, which is what "create a candidate from this version"
   * actually means.
   */
  createCandidateFromVersion: async (versionId) => {
    const { activeBookId, activeChapterId, demoMode } = get();
    if (!activeBookId || !activeChapterId) return;
    try {
      const result = await getWorkbenchSource(demoMode).restoreVersion(
        activeBookId,
        activeChapterId,
        versionId,
      );
      if (!result.ok) {
        get().pushToast({
          tone: "warn",
          title: "未能基于该版本创建候选",
          detail: result.error,
        });
        return;
      }
      await get().refreshChapterContext();
      get().pushToast({
        tone: "ok",
        title: "已基于该版本创建候选",
        detail: "历史版本仍保留在历史中，当前正文可在编辑器里继续修改。",
      });
    } catch (error) {
      get().pushToast({
        tone: "warn",
        title: isUnavailable(error) ? "能力不可用" : "操作未完成",
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  },

  cancelTask: async (taskId) => {    const { dataset, demoMode } = get();
    if (!dataset) return;
    try {
      const tasks = await getWorkbenchSource(demoMode).cancelTask(taskId);
      set({ dataset: { ...dataset, tasks } });
      get().pushToast({ tone: "info", title: "取消请求已发出", detail: "服务端确认前不会显示为已取消。" });
    } catch (error) {
      get().pushToast({
        tone: "warn",
        title: isUnavailable(error) ? "能力不可用" : "操作未完成",
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  },

  toggleRule: async (ruleId, enabled) => {
    const { dataset, demoMode } = get();
    if (!dataset) return;
    try {
      const rules: readonly RuleSetting[] = await getWorkbenchSource(demoMode).setRuleEnabled(ruleId, enabled);
      set({ dataset: { ...dataset, rules } });
    } catch (error) {
      get().pushToast({
        tone: "warn",
        title: isUnavailable(error) ? "能力不可用" : "规则未更新",
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  },

  /**
   * Plan the next chapter.
   *
   * A chapter exists once it has a plan, so this is what "新建章节" really does.
   * It invokes the model, so it is not instant and it can fail on the upstream;
   * both are reported rather than papered over.
   */
  planNextChapter: async () => {
    const { activeBookId, demoMode } = get();
    if (!activeBookId) return;
    get().pushToast({
      tone: "info",
      title: "正在规划新章节",
      detail: "需要调用模型生成细纲，请稍候。",
    });
    const result = await getWorkbenchSource(demoMode).planNextChapter(activeBookId);
    if (!result.ok) {
      get().pushToast({
        tone: "warn",
        title: "未能规划新章节",
        detail: result.error,
      });
      return;
    }
    await get().load();
    get().pushToast({ tone: "ok", title: "新章节已规划", detail: "章节树中已出现新的细纲。" });
  },

  /**
   * Trigger AI writing for the next chapter directly from the workbench.
   *
   * Solves the disconnect where an author had to jump back to the dashboard
   * just to click "write next".
   */
  generateNextChapter: async () => {
    const { activeBookId, demoMode } = get();
    if (!activeBookId) return;
    get().pushToast({
      tone: "info",
      title: "正在开始 AI 生成正文",
      detail: "已发起创作流水线，生成进度将在顶部与列表中实时刷新。",
    });
    const result = await getWorkbenchSource(demoMode).generateNextChapter(activeBookId);
    if (!result.ok) {
      get().pushToast({
        tone: "warn",
        title: "正文生成未启动",
        detail: result.error,
      });
    }
  },

  /**
   * Re-run the audit for the current chapter.
   *
   * Manual edits mark the audit stale, which blocks the commit on purpose. This
   * is the way back: run the audit again and let the verdict decide.
   */
  auditChapter: async () => {
    const { activeBookId, activeChapterId, demoMode } = get();
    if (!activeBookId || !activeChapterId) return;
    get().pushToast({
      tone: "info",
      title: "正在重新审核",
      detail: "需要调用模型，请稍候。",
    });
    const result = await getWorkbenchSource(demoMode).auditChapter(activeBookId, activeChapterId);
    if (!result.ok) {
      get().pushToast({ tone: "warn", title: "重新审核未完成", detail: result.error });
      return;
    }
    await get().load();
    get().pushToast({ tone: "ok", title: "审核已完成", detail: "请查看审核结果后再决定是否提交。" });
  },

  /**
   * Ask the AI to revise the active chapter's prose.
   *
   * The workbench had no revise control at all — the only entry point lived on
   * the book page. This calls the same `/books/:id/revise/:n` transaction with a
   * mode and an optional force-overwrite.
   */
  reviseChapter: async (mode, force, brief) => {
    const { activeBookId, activeChapterId, dataset, demoMode } = get();
    if (!activeBookId || !activeChapterId) return;
    if (demoMode) {
      get().pushToast({ tone: "warn", title: "演示模式不执行修订", detail: "切换到正式模式后再试。" });
      return;
    }
    const chapter = (dataset?.chapters ?? []).find((item) => item.id === activeChapterId);
    if (!chapter) return;
    if (get().revising) {
      get().pushToast({ tone: "warn", title: "正在修订中", detail: "请等待当前修订完成后再试。" });
      return;
    }
    get().pushToast({
      tone: "info",
      title: "正在 AI 修订本章",
      detail: force ? "强制覆盖：复核问题未减少也会写入。" : "修订需要调用模型，期间请勿重复触发。",
    });
    set({ revising: true });
    try {
      await fetchJson(`/books/${encodeURIComponent(activeBookId)}/revise/${chapter.number}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, force: force || undefined, brief: brief?.trim() || undefined }),
      });
      await get().load();
      get().pushToast({ tone: "ok", title: "AI 修订完成", detail: "已刷新本章候选与审核结果。" });
    } catch (error) {
      get().pushToast({
        tone: "block",
        title: "AI 修订失败",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      set({ revising: false });
    }
  },
  /**
   * Fix a single review finding with the AI, without touching the rest.
   *
   * The findings list is display-only; per-item "handled" is not a backend
   * concept. This scopes a `spot-fix` revision to one finding's evidence via the
   * brief, so the author can clear a warning in place instead of re-running a
   * whole-chapter rewrite.
   */
  fixReviewItem: async (itemId) => {
    const { activeBookId, activeChapterId, dataset, demoMode } = get();
    if (!activeBookId || !activeChapterId) return;
    if (demoMode) {
      get().pushToast({ tone: "warn", title: "演示模式不执行修改", detail: "切换到正式模式后再试。" });
      return;
    }
    const chapter = (dataset?.chapters ?? []).find((item) => item.id === activeChapterId);
    const finding = (dataset?.reviewItems ?? []).find((item) => item.id === itemId);
    if (!chapter || !finding) return;
    if (get().revising) {
      get().pushToast({ tone: "warn", title: "正在修订中", detail: "请等待当前修订完成后再试。" });
      return;
    }
    const brief = [
      "只针对下列这一条审稿问题做局部修改，其余内容一律不要动：",
      `规则：${finding.rule}`,
      `问题：${finding.summary}`,
      `原文证据：「${finding.evidence.quote}」`,
      `修改建议：${finding.suggestion}`,
      "要求：只改这处问题，不扩写、不改动无关段落、不改变剧情走向。",
    ].join("\n");
    get().pushToast({ tone: "info", title: "正在按该条建议修改", detail: finding.summary });
    set({ revising: true });
    try {
      await fetchJson(`/books/${encodeURIComponent(activeBookId)}/revise/${chapter.number}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "spot-fix", brief }),
      });
      await get().load();
      get().pushToast({ tone: "ok", title: "已按该条建议修改", detail: "修改后需重新审核才会更新结论。" });
    } catch (error) {
      get().pushToast({
        tone: "block",
        title: "局部修改失败",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      set({ revising: false });
    }
  },

  approveOutline: async (outline) => {
    const { dataset, activeBookId, demoMode } = get();
    if (!dataset || !activeBookId) return;
    try {
      const revision = await getWorkbenchSource(demoMode).approveOutline(
        activeBookId,
        dataset.outline.chapterId,
        dataset.outline.currentRevision,
        outline,
      );
      // Re-read rather than writing approvedAt/approvedBy locally: the server owns
      // the approval record, and inventing the approver in the client would put a
      // value in the UI that the stored record does not contain.
      await get().refreshChapterContext();
      get().pushToast({
        tone: "ok",
        title: `细纲 r${revision} 已批准`,
        detail: "批准记录只针对该版本，继续编辑会产生未批准变更。",
      });
    } catch (error) {
      get().pushToast({
        tone: "warn",
        title: isUnavailable(error) ? "能力不可用" : "批准未完成",
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  },

  pushToast: (toast) => {
    toastSeq += 1;
    const id = `toast-${toastSeq}`;
    set({ toasts: [...get().toasts, { ...toast, id }] });
    setTimeout(() => get().dismissToast(id), 5200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
  requestLocate: (offset) => {
    get().goArea("writing");
    set({ view: "prose", pendingLocate: { offset, token: Date.now() } });
  },
}));
