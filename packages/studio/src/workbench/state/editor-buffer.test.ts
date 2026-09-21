// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const saveDraft = vi.fn();
vi.mock("../data/adapter", () => ({
  getWorkbenchSource: () => ({ saveDraft }),
}));

import { useChapterBuffer, type ChapterBufferOptions } from "./editor-buffer";

afterEach(() => {
  cleanup();
  saveDraft.mockReset();
});

const baseProps: ChapterBufferOptions = {
  bookId: "b1",
  chapterId: "b1-ch-3",
  candidateId: "b1-ch-3-current",
  initialBody: "A",
  initialRevision: 2,
  demoMode: true,
};

describe("useChapterBuffer refresh safety", () => {
  it("does not clobber text typed while a save is in flight when the server echo arrives", async () => {
    let resolveSave!: (value: { ok: true; revision: number; savedAt: string }) => void;
    saveDraft.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));

    const { result, rerender } = renderHook(
      (props: ChapterBufferOptions) => useChapterBuffer(props),
      { initialProps: baseProps },
    );

    act(() => result.current.onChange("AB"));

    let pending!: Promise<boolean>;
    act(() => { pending = result.current.saveNow(); });

    // The author keeps typing before the server confirms.
    act(() => result.current.onChange("ABC"));

    // The server echoes back the body it actually received ("AB").
    act(() => { resolveSave({ ok: true, revision: 3, savedAt: "2026-01-01T00:00:00.000Z" }); });
    await act(async () => { await pending; });

    // Parent refresh pushes the older saved body with the same candidate identity.
    rerender({ ...baseProps, initialBody: "AB", initialRevision: 3 });

    expect(result.current.text).toBe("ABC");
  });

  it("adopts the server body for the same candidate when the buffer is idle", () => {
    const { result, rerender } = renderHook(
      (props: ChapterBufferOptions) => useChapterBuffer(props),
      { initialProps: baseProps },
    );

    rerender({ ...baseProps, initialBody: "server body", initialRevision: 5 });

    expect(result.current.text).toBe("server body");
  });

  it("resets to the new body when the candidate identity changes", () => {
    const { result, rerender } = renderHook(
      (props: ChapterBufferOptions) => useChapterBuffer(props),
      { initialProps: baseProps },
    );

    act(() => result.current.onChange("dirty local text"));
    rerender({ ...baseProps, candidateId: "b1-ch-3-v2", initialBody: "other candidate", initialRevision: 1 });

    expect(result.current.text).toBe("other candidate");
  });
});
