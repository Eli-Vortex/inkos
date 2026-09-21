// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProseEditor } from "./ProseEditor";
import type { ChapterBuffer } from "../state/editor-buffer";
import type { Candidate } from "../types";

afterEach(cleanup);

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  id: "b1-ch-3-current",
  label: "当前候选稿",
  revision: 2,
  source: "hand",
  updatedAt: "2026-01-01T00:00:00.000Z",
  baseline: "初始稿",
  wordCount: 8,
  body: "正文内容",
  isFormal: false,
  bookId: "b1",
  chapterId: "b1-ch-3",
  archived: false,
  ...overrides,
});

function buffer(overrides: Partial<ChapterBuffer> = {}): ChapterBuffer {
  return {
    text: "正文内容",
    status: {
      state: "clean",
      revision: 2,
      savedAt: null,
      message: "候选已就绪",
      isComposing: false,
      pendingSince: null,
    },
    hasUnsavedChanges: false,
    onChange: vi.fn(),
    onCompositionStart: vi.fn(),
    onCompositionEnd: vi.fn(),
    saveNow: vi.fn(async () => true),
    rebase: vi.fn(),
    recoverableDraft: null,
    recoverDraft: vi.fn(),
    discardDraft: vi.fn(),
    ...overrides,
  };
}

const counts = { block: 0, warn: 0, suggest: 0 };

function renderEditor(props: Partial<Parameters<typeof ProseEditor>[0]> = {}) {
  return render(
    <ProseEditor
      candidate={candidate()}
      buffer={buffer()}
      reviewCounts={counts}
      staleReview={false}
      onOpenCompare={vi.fn()}
      onOpenReview={vi.fn()}
      {...props}
    />,
  );
}

describe("ProseEditor editing rules", () => {
  it("lets the author edit the live candidate", () => {
    renderEditor();
    const area = screen.getByRole("textbox", { name: /正文/ });
    expect(area).toHaveProperty("readOnly", false);
    expect(screen.queryByText("只读")).toBeNull();
  });

  it("makes an approved formal draft read-only, and offers a revision candidate", () => {
    const onCreateCandidateFrom = vi.fn();
    renderEditor({
      candidate: candidate({ isFormal: true, label: "正式稿" }),
      onCreateCandidateFrom,
    });

    const area = screen.getByRole("textbox", { name: /正式稿 正文/ });
    expect(area).toHaveProperty("readOnly", true);
    expect(area.getAttribute("aria-readonly")).toBe("true");
    expect(screen.getByText("只读")).toBeTruthy();

    // The way forward must be explicit rather than a dead end.
    fireEvent.click(screen.getByRole("button", { name: /基于此版本创建候选/ }));
    expect(onCreateCandidateFrom).toHaveBeenCalledTimes(1);
  });

  it("makes an archived version read-only and refuses in-place editing", () => {
    renderEditor({
      candidate: candidate({ id: "v1", label: "手写 · 1/1 12:00", archived: true }),
      onCreateCandidateFrom: vi.fn(),
    });

    const area = screen.getByRole("textbox", { name: /正文/ });
    expect(area).toHaveProperty("readOnly", true);
    // Typing into a read-only textarea must not reach the buffer.
    fireEvent.change(area, { target: { value: "试图改写历史" } });
    expect(area).toHaveProperty("readOnly", true);
  });

  it("shows the stale-review badge and offers a re-audit", () => {
    const onReaudit = vi.fn();
    renderEditor({ staleReview: true, onReaudit });

    expect(screen.getByText("审核已过期")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /重新审核/ }));
    expect(onReaudit).toHaveBeenCalledTimes(1);
  });

  it("does not offer a re-audit on a chapter whose review still applies", () => {
    renderEditor({ staleReview: false, onReaudit: vi.fn() });
    expect(screen.queryByRole("button", { name: /重新审核/ })).toBeNull();
  });

  it("surfaces a save conflict with a rebase action instead of a retry", () => {
    const rebase = vi.fn();
    renderEditor({
      buffer: buffer({
        hasUnsavedChanges: true,
        status: {
          state: "conflict",
          revision: 2,
          savedAt: null,
          message: "服务端正文已变化，本地文本未被覆盖。",
          isComposing: false,
          pendingSince: null,
        },
        rebase,
      }),
    });

    expect(screen.getByText(/服务端正文已变化/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /对齐基线/ }));
    expect(rebase).toHaveBeenCalledTimes(1);
  });
});
