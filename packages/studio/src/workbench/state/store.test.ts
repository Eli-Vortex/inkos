import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchDataset } from "../data/mock";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  loadChapterContext: vi.fn(),
}));

vi.mock("../data/adapter", () => ({
  getWorkbenchSource: () => ({
    load: mocks.load,
    loadChapterContext: mocks.loadChapterContext,
  }),
  isUnavailable: () => false,
}));

import { datasetFor } from "../data/mock";
import { useWorkbench } from "./store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

const context = (chapterId: string, candidateId: string) => ({
  bookId: "b-changye",
  chapterId,
  candidates: [{
    id: candidateId,
    label: "当前候选稿",
    revision: 3,
    source: "hand" as const,
    updatedAt: "2026-01-01T00:00:00.000Z",
    baseline: "初始稿",
    wordCount: 10,
    body: `正文 ${chapterId}`,
    isFormal: false,
    bookId: "b-changye",
    chapterId,
    archived: false,
  }],
  outline: {
    chapterId,
    goal: "",
    beats: [],
    characters: [],
    constraints: [],
    approvedRevision: null,
    currentRevision: 1,
    approvedAt: null,
    approvedBy: null,
  },
  reviewItems: [],
  commitPreview: {
    candidateId,
    baseline: "初始稿",
    wordDelta: 0,
    statusChange: "待审 → 正式稿",
    gates: [],
    pendingIndexTasks: [],
    removable: false,
  },
});

describe("workbench store loading", () => {
  beforeEach(() => {
    mocks.load.mockReset();
    mocks.loadChapterContext.mockReset();
    useWorkbench.setState({
      demoMode: true,
      scenario: "normal",
      loadState: "idle",
      loadError: null,
      dataset: null,
      activeBookId: null,
      activeChapterId: null,
      activeCandidateId: null,
      compareBaseId: null,
      compareTargetId: null,
      chapterContextState: "idle",
      chapterContextError: null,
      chapterContextKey: null,
      transitionGuard: null,
      pendingTransition: null,
    });
  });

  it("lets only the latest request replace the workbench dataset", async () => {
    const first = deferred<WorkbenchDataset>();
    const second = deferred<WorkbenchDataset>();
    mocks.load
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const firstLoad = useWorkbench.getState().load();
    useWorkbench.setState({ scenario: "empty" });
    const secondLoad = useWorkbench.getState().load();

    second.resolve(datasetFor("empty"));
    await secondLoad;
    first.resolve(datasetFor("normal"));
    await firstLoad;

    expect(useWorkbench.getState().dataset?.books).toHaveLength(0);
    expect(useWorkbench.getState().loadState).toBe("ready");
  });

  it("falls back to a real book when a source switch leaves a stale selection", async () => {
    const dataset = datasetFor("normal");
    mocks.load.mockResolvedValue(dataset);
    useWorkbench.setState({ activeBookId: "book-from-another-source" });

    await useWorkbench.getState().load();

    expect(useWorkbench.getState().activeBookId).toBe(dataset.books[0]?.id);
    expect(useWorkbench.getState().activeChapterId).toBeTruthy();
  });
});

describe("workbench chapter context", () => {
  beforeEach(async () => {
    mocks.load.mockReset();
    mocks.loadChapterContext.mockReset();
    mocks.load.mockResolvedValue(datasetFor("normal"));
    await useWorkbench.getState().load();
  });

  it("loads the working set for the newly selected chapter", async () => {
    const dataset = useWorkbench.getState().dataset!;
    const chapters = dataset.chapters.filter((item) => item.bookId === useWorkbench.getState().activeBookId);
    const target = chapters[1];
    expect(target).toBeTruthy();
    mocks.loadChapterContext.mockResolvedValue(context(target!.id, `${target!.id}-current`));

    await useWorkbench.getState().selectChapter(target!.id);

    expect(mocks.loadChapterContext).toHaveBeenCalledWith(
      target!.bookId,
      target!.id,
    );
    const state = useWorkbench.getState();
    expect(state.chapterContextKey).toEqual({ bookId: target!.bookId, chapterId: target!.id });
    expect(state.dataset?.candidates[0]?.chapterId).toBe(target!.id);
    expect(state.activeCandidateId).toBe(`${target!.id}-current`);
  });

  it("clears the previous chapter's working set while the new one loads", async () => {
    const dataset = useWorkbench.getState().dataset!;
    const chapters = dataset.chapters.filter((item) => item.bookId === useWorkbench.getState().activeBookId);
    const target = chapters[1]!;
    const gate = deferred<ReturnType<typeof context>>();
    mocks.loadChapterContext.mockReturnValue(gate.promise);

    const switching = useWorkbench.getState().selectChapter(target.id);
    // Mid-flight: nothing from the old chapter may still be on screen.
    const mid = useWorkbench.getState();
    expect(mid.chapterContextState).toBe("loading");
    expect(mid.dataset?.candidates).toEqual([]);
    expect(mid.dataset?.reviewItems).toEqual([]);

    gate.resolve(context(target.id, `${target.id}-current`));
    await switching;
    expect(useWorkbench.getState().chapterContextState).toBe("ready");
  });

  it("ignores a slow context response for a chapter that is no longer selected", async () => {
    const dataset = useWorkbench.getState().dataset!;
    const chapters = dataset.chapters.filter((item) => item.bookId === useWorkbench.getState().activeBookId);
    const first = chapters[1]!;
    const second = chapters[2]!;
    const slow = deferred<ReturnType<typeof context>>();
    mocks.loadChapterContext
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(context(second.id, `${second.id}-current`));

    const switchingToFirst = useWorkbench.getState().selectChapter(first.id);
    await useWorkbench.getState().selectChapter(second.id);
    slow.resolve(context(first.id, `${first.id}-current`));
    await switchingToFirst;

    // The stale response must not overwrite the chapter the author is on.
    expect(useWorkbench.getState().activeChapterId).toBe(second.id);
    expect(useWorkbench.getState().dataset?.candidates[0]?.chapterId).toBe(second.id);
  });

  it("records a failed context load instead of showing an empty chapter", async () => {
    const dataset = useWorkbench.getState().dataset!;
    const chapters = dataset.chapters.filter((item) => item.bookId === useWorkbench.getState().activeBookId);
    mocks.loadChapterContext.mockRejectedValue(new Error("网络失败"));

    await useWorkbench.getState().selectChapter(chapters[1]!.id);

    expect(useWorkbench.getState().chapterContextState).toBe("error");
    expect(useWorkbench.getState().chapterContextError).toBe("网络失败");
  });
});

describe("server event handling", () => {
  const activeChapter = () => useWorkbench.getState().activeChapterId!;

  beforeEach(async () => {
    mocks.load.mockReset();
    mocks.loadChapterContext.mockReset();
    mocks.load.mockResolvedValue(datasetFor("normal"));
    useWorkbench.setState({ transitionGuard: null, deferredServerEvent: null, toasts: [] });
    await useWorkbench.getState().load();
    // `load()` may itself fetch a chapter context; start from a clean count.
    mocks.loadChapterContext.mockReset();
    mocks.loadChapterContext.mockResolvedValue(
      context(activeChapter(), `${activeChapter()}-current`),
    );
  });

  it("ignores events for another book", async () => {
    const before = mocks.loadChapterContext.mock.calls.length;
    useWorkbench.getState().handleServerEvent("chapter:committed", { bookId: "some-other-book", chapterNumber: 1 });
    expect(mocks.loadChapterContext.mock.calls.length).toBe(before);
    expect(mocks.load.mock.calls.length).toBe(1);
  });

  it("refreshes the chapter when its own commit lands", async () => {
    const bookId = useWorkbench.getState().activeBookId!;
    useWorkbench.getState().handleServerEvent("chapter:committed", { bookId, chapterNumber: 1 });
    await vi.waitFor(() => expect(mocks.loadChapterContext).toHaveBeenCalled());
  });

  it("reloads the shelf when a chapter is deleted", async () => {
    const bookId = useWorkbench.getState().activeBookId!;
    useWorkbench.getState().handleServerEvent("chapter:deleted", { bookId, chapterNumber: 1 });
    await vi.waitFor(() => expect(mocks.load.mock.calls.length).toBe(2));
  });

  it("defers the refresh while there is unsaved work, and applies it after a save", async () => {
    const bookId = useWorkbench.getState().activeBookId!;
    useWorkbench.setState({
      transitionGuard: { hasUnsavedWork: () => true, save: async () => true },
    });

    useWorkbench.getState().handleServerEvent("chapter:committed", { bookId, chapterNumber: 1 });
    // Reloading now would replace the working set and reset the editor.
    expect(useWorkbench.getState().deferredServerEvent).toMatchObject({ action: "chapter" });
    expect(mocks.loadChapterContext).not.toHaveBeenCalled();

    await useWorkbench.getState().flushDeferredServerEvent();
    expect(useWorkbench.getState().deferredServerEvent).toBeNull();
    expect(mocks.loadChapterContext).toHaveBeenCalled();
  });

  it("does not replay the same event twice", async () => {
    const bookId = useWorkbench.getState().activeBookId!;
    useWorkbench.getState().handleServerEvent("audit:complete", { bookId, chapterNumber: 1 });
    useWorkbench.getState().handleServerEvent("chapter:findings", { bookId, chapterNumber: 1 });
    await vi.waitFor(() => expect(mocks.loadChapterContext).toHaveBeenCalledTimes(2));
  });
});

describe("workbench transition guard", () => {
  beforeEach(async () => {
    mocks.load.mockReset();
    mocks.loadChapterContext.mockReset();
    mocks.load.mockResolvedValue(datasetFor("normal"));
    useWorkbench.setState({ transitionGuard: null, pendingTransition: null });
    await useWorkbench.getState().load();
  });

  it("runs the transition immediately when nothing is unsaved", async () => {
    const run = vi.fn();
    useWorkbench.setState({
      transitionGuard: { hasUnsavedWork: () => false, save: async () => true },
    });
    await useWorkbench.getState().requestTransition("切换章节", run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(useWorkbench.getState().pendingTransition).toBeNull();
  });

  it("parks the transition when there is unsaved work, so nothing is discarded", async () => {
    const run = vi.fn();
    useWorkbench.setState({
      transitionGuard: { hasUnsavedWork: () => true, save: async () => true },
    });
    await useWorkbench.getState().requestTransition("切换章节", run);

    expect(run).not.toHaveBeenCalled();
    expect(useWorkbench.getState().pendingTransition?.description).toBe("切换章节");
  });

  it("saves first, then continues", async () => {
    const run = vi.fn();
    const save = vi.fn(async () => true);
    useWorkbench.setState({ transitionGuard: { hasUnsavedWork: () => true, save } });
    await useWorkbench.getState().requestTransition("切换章节", run);
    await useWorkbench.getState().resolveTransition("save");

    expect(save).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("stays on the page when the save fails", async () => {
    const run = vi.fn();
    const save = vi.fn(async () => false);
    useWorkbench.setState({ transitionGuard: { hasUnsavedWork: () => true, save } });
    await useWorkbench.getState().requestTransition("切换章节", run);
    await useWorkbench.getState().resolveTransition("save");

    // The whole point: a failed save must not be followed by a lost chapter.
    expect(run).not.toHaveBeenCalled();
    expect(useWorkbench.getState().pendingTransition).toBeNull();
  });

  it("cancels without running or saving", async () => {
    const run = vi.fn();
    const save = vi.fn(async () => true);
    useWorkbench.setState({ transitionGuard: { hasUnsavedWork: () => true, save } });
    await useWorkbench.getState().requestTransition("切换章节", run);
    await useWorkbench.getState().resolveTransition("cancel");

    expect(save).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(useWorkbench.getState().pendingTransition).toBeNull();
  });

  it("discards and continues only when the author explicitly chooses to", async () => {
    const run = vi.fn();
    useWorkbench.setState({
      transitionGuard: { hasUnsavedWork: () => true, save: async () => true },
    });
    await useWorkbench.getState().requestTransition("切换章节", run);
    await useWorkbench.getState().resolveTransition("discard");

    expect(run).toHaveBeenCalledTimes(1);
  });
});

