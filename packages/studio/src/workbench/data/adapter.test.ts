import { beforeEach, describe, expect, it } from "vitest";
import { buildCommitPreview, WorkbenchUnavailableError, getWorkbenchSource, isUnavailable } from "./adapter";
import type { Candidate, Chapter } from "../types";

const demo = getWorkbenchSource(true);

const saveInput = (body: string) => ({
  bookId: "b-changye",
  chapterId: "c-11",
  candidateId: "cand-hand",
  body,
  revision: 9,
  baseRevision: 8,
});

const commitInput = { bookId: "b-changye", chapterId: "c-11", candidateId: "cand-hand", revision: 8, idempotencyKey: "k1" };

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const liveBook = { id: "live-book", title: "实时书", status: "active", genre: "xuanhuan" };

const liveChapter = {
  number: 1,
  title: "第一章",
  status: "ready-for-review",
  wordCount: 12,
  updatedAt: "2026-01-01T00:00:00.000Z",
  auditIssues: [] as string[],
};

describe("demo adapter", () => {
  beforeEach(async () => {
    // Every case starts from the normal scenario; load() also resets the save counter.
    await demo.load("normal");
  });

  it("serves the requested scenario", async () => {
    expect(demo.mode).toBe("demo");
    const dataset = await demo.load("normal");
    expect(dataset.books.length).toBeGreaterThan(0);
    await expect(demo.load("empty")).resolves.toMatchObject({ books: [] });
  });

  it("surfaces a load failure instead of an empty shelf", async () => {
    await expect(demo.load("error")).rejects.toThrow("读取项目失败");
  });

  it("saves a candidate and returns the new revision", async () => {
    const result = await demo.saveDraft(saveInput("渡口的灯是天亮前最后一盏还亮着的。"));
    expect(result.ok).toBe(true);
    expect(result.revision).toBe(9);
    expect(typeof result.savedAt).toBe("string");
  });

  it("reports a revision mismatch once rather than retrying silently", async () => {
    await demo.load("conflict");
    await expect(demo.saveDraft(saveInput("第一次"))).resolves.toMatchObject({ ok: true });
    const second = await demo.saveDraft(saveInput("第二次"));
    expect(second.ok).toBe(false);
    expect(second.conflict).toBe(true);
    expect(second.conflictRevision).toBe(10);
  });

  it("reports a save failure and keeps the local text", async () => {
    await demo.load("error").catch(() => undefined);
    const result = await demo.saveDraft(saveInput("本地文本仍在编辑器中"));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("保存失败");
  });

  it("refuses to waive a hard integrity finding", async () => {
    const blocking = (await demo.load("normal")).reviewItems.find(
      (item) => item.severity === "block" && !item.waivable && item.status === "open",
    );
    expect(blocking).toBeDefined();
    await expect(demo.waiveReview("b-changye", "c-11", blocking!.id, "看起来是误报")).rejects.toBeInstanceOf(
      WorkbenchUnavailableError,
    );
  });

  it("records a reason when a waivable warning is waved off as a false positive", async () => {
    const warn = (await demo.load("normal")).reviewItems.find((item) => item.waivable && item.status === "open");
    expect(warn).toBeDefined();
    const items = await demo.waiveReview("b-changye", "c-11", warn!.id, "该语域变化是刻意的");
    expect(items.find((item) => item.id === warn!.id)).toMatchObject({
      status: "waived",
      waiverReason: "该语域变化是刻意的",
    });
  });

  it("marks a finding handled without touching the other findings", async () => {
    const before = (await demo.load("normal")).reviewItems;
    const target = before.find((item) => item.status === "open")!;
    const after = await demo.resolveReview("b-changye", target.id);
    expect(after.find((item) => item.id === target.id)?.status).toBe("resolved");
    expect(after.filter((item) => item.id !== target.id)).toEqual(before.filter((item) => item.id !== target.id));
  });

  it("adopts generated text as a new candidate without overwriting the others", async () => {
    const before = (await demo.load("normal")).candidates;
    const after = await demo.adoptCandidate("b-changye", "cand-gen");
    expect(after).toHaveLength(before.length + 1);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)).toMatchObject({ isFormal: false });
    expect(after.at(-1)?.label).toContain("已采纳");
  });

  it("blocks a commit while blockers are open, then records it once every finding is handled", async () => {
    await demo.load("normal");
    await expect(demo.commit(commitInput)).resolves.toMatchObject({ accepted: false, code: "422" });

    const blockers = (await demo.load("normal")).reviewItems.filter((item) => item.severity === "block");
    for (const item of blockers) {
      await demo.resolveReview("b-changye", item.id);
    }

    const accepted = await demo.commit(commitInput);
    expect(accepted.accepted).toBe(true);
    expect(accepted.code).toBe("201");
    expect(accepted.commitId).toContain("commit-demo-");
  });

  it("maps a stale baseline and a paused service to their own result codes", async () => {
    await demo.load("conflict");
    await expect(demo.commit(commitInput)).resolves.toMatchObject({ accepted: false, code: "409" });

    await demo.load("error").catch(() => undefined);
    await expect(demo.commit(commitInput)).resolves.toMatchObject({ accepted: false, code: "503" });
  });

  it("cancels a running generation in two phases and cancels queued work outright", async () => {
    await demo.load("normal");
    const canceling = await demo.cancelTask("t-8842");
    expect(canceling.find((task) => task.id === "t-8842")?.state).toBe("canceling");

    const canceled = await demo.cancelTask("t-8815");
    expect(canceled.find((task) => task.id === "t-8815")?.state).toBe("canceled");
  });

  it("toggles a rule without reordering the rule pack", async () => {
    const before = (await demo.load("normal")).rules.map((rule) => rule.id);
    const after = await demo.setRuleEnabled("r-6", true);
    expect(after.map((rule) => rule.id)).toEqual(before);
    expect(after.find((rule) => rule.id === "r-6")?.enabled).toBe(true);
  });

  it("approves the edited outline revision", async () => {
    await demo.load("normal");
    await expect(demo.approveOutline("b-changye", "c-11", 6)).resolves.toBe(6);
  });

  it("refuses the live capabilities that still have no backend contract", async () => {
    const live = getWorkbenchSource(false);
    expect(live.mode).toBe("live");
    await expect(live.resolveReview("b", "rv-1")).rejects.toBeInstanceOf(WorkbenchUnavailableError);
    await expect(live.cancelTask("t-1")).rejects.toBeInstanceOf(WorkbenchUnavailableError);
    await expect(live.setRuleEnabled("r-1", true)).rejects.toBeInstanceOf(WorkbenchUnavailableError);
  });

  it("approves the outline through the real approval endpoint", async () => {
    const live = getWorkbenchSource(false);
    const posted: Array<{ url: string; body?: unknown }> = [];
    const briefPuts: Array<{ url: string; body?: unknown }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PUT" && url.endsWith("/workspace/brief")) {
        briefPuts.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined });
        return json({ ok: true });
      }
      if (init?.method === "POST" && url.endsWith("/plan-approval")) {
        posted.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined });
        return json({
          ok: true,
          chapterNumber: 1,
          approval: { revision: 2 },
          state: { revision: 2, approvedRevision: 2, approvedAt: null, approvedBy: "author", approved: true, dirty: false },
        });
      }
      if (url.endsWith("/plan-approval")) {
        return json({ revision: 2, approvedRevision: null, approvedAt: null, approvedBy: null, approved: false, dirty: true });
      }
      if (url.endsWith("/workspace")) return json({ chapterNumber: 1, brief: "", plan: null, versions: [], canDelete: true });
      if (url.endsWith("/books")) return json({ books: [liveBook] });
      if (url.endsWith("/chapters/1")) return json({ chapterNumber: 1, content: "正文" });
      return json({ chapters: [liveChapter] });
    }) as unknown as typeof fetch;
    try {
      await live.load("normal");
      // The revision the author saw is sent so the server can reject a stale
      // approval rather than recording one for a plan they never read.
      const revision = await live.approveOutline("live-book", "live-book-ch-1", 2, { goal: "本章目标：拿到账本" });
      expect(revision).toBe(2);
      // The edited goal is persisted before approval, so the approved revision
      // describes the text the author actually sees.
      expect(briefPuts[0]?.body).toEqual({ brief: "本章目标：拿到账本" });
      expect(posted[0]?.body).toEqual({ expectedRevision: 2 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("saveDraft writes the candidate through the real chapter transaction API", async () => {
    const live = getWorkbenchSource(false);
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === "PUT") return json({ ok: true, result: { reviewRequired: true } });
      if (url.endsWith("/workspace")) return json({ chapterNumber: 1, brief: "", plan: null, versions: [], canDelete: true });
      if (url.endsWith("/books")) return json({ books: [liveBook] });
      if (url.endsWith("/chapters/1")) return json({ chapterNumber: 1, content: "旧正文" });
      return json({ chapters: [liveChapter] });
    }) as unknown as typeof fetch;
    try {
      await live.load("normal");
      const result = await live.saveDraft({
        bookId: "live-book",
        chapterId: "live-book-ch-1",
        candidateId: "live-book-ch-1-current",
        body: "新的候选正文",
        revision: 1,
        baseRevision: 1,
      });
      expect(result.ok).toBe(true);
      const put = calls.find((c) => c.method === "PUT");
      expect(put?.url).toContain("/books/live-book/chapters/1");
      // The base revision travels with the write so the server can reject a
      // stale writer inside its own lock. A client-only pre-check is not a lock.
      expect(put?.body).toEqual({ content: "新的候选正文", baseRevision: 1 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("refuses to save when the target chapter cannot be resolved, instead of guessing", async () => {
    const live = getWorkbenchSource(false);
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/workspace")) return json({ chapterNumber: 1, brief: "", plan: null, versions: [], canDelete: true });
      if (url.endsWith("/books")) return json({ books: [liveBook] });
      if (url.endsWith("/chapters/1")) return json({ chapterNumber: 1, content: "旧正文" });
      return json({ chapters: [liveChapter] });
    }) as unknown as typeof fetch;
    try {
      await live.load("normal");
      // A candidate id belonging to no loaded chapter — previously this fell
      // back to "the last chapter of the book" and wrote the text there.
      const result = await live.saveDraft({
        bookId: "current",
        chapterId: "some-other-books-chapter-9",
        candidateId: "some-other-books-chapter-9-current",
        body: "不该被写入任何章节",
        revision: 1,
        baseRevision: 1,
      });
      expect(result.ok).toBe(false);
      expect(calls.some((call) => call.startsWith("PUT"))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("refuses to save over an archived version", async () => {
    const live = getWorkbenchSource(false);
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    const versionId = "1700000000000_manual_00000000-0000-0000-0000-000000000000";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/workspace")) {
        return json({
          chapterNumber: 1,
          brief: "",
          plan: null,
          versions: [{ id: versionId, source: "manual", createdAt: "2026-01-01T00:00:00.000Z", characterCount: 4 }],
          canDelete: true,
        });
      }
      if (url.includes("/versions/")) return json({ content: "历史正文" });
      if (url.endsWith("/books")) return json({ books: [liveBook] });
      if (url.endsWith("/chapters/1")) return json({ chapterNumber: 1, content: "当前正文" });
      return json({ chapters: [liveChapter] });
    }) as unknown as typeof fetch;
    try {
      await live.load("normal");
      const result = await live.saveDraft({
        bookId: "live-book",
        chapterId: "live-book-ch-1",
        candidateId: versionId,
        body: "想让历史版本变成当前正文",
        revision: 1,
        baseRevision: 1,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("只读");
      expect(calls.some((call) => call.startsWith("PUT"))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("commit approves through the real API and reports a real commit id", async () => {
    const live = getWorkbenchSource(false);
    const approved: Array<{ url: string; body?: unknown }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/approve")) {
        approved.push({
          url,
          body: init.body ? JSON.parse(String(init.body)) : undefined,
        });
        return json({
          ok: true,
          idempotent: false,
          receipt: {
            commitId: "commit-abc12345",
            bookId: "live-book",
            chapterNumber: 1,
            status: "approved",
            revision: 2,
            contentHash: "deadbeef",
            committedAt: "2026-01-01T00:00:00.000Z",
          },
        });
      }
      if (url.endsWith("/workspace")) return json({ chapterNumber: 1, brief: "", plan: null, versions: [], canDelete: true });
      if (url.endsWith("/books")) return json({ books: [liveBook] });
      if (url.endsWith("/chapters/1")) return json({ chapterNumber: 1, content: "正文" });
      return json({ chapters: [liveChapter] });
    }) as unknown as typeof fetch;
    try {
      await live.load("normal");
      const outcome = await live.commit({
        bookId: "current",
        chapterId: "live-book-ch-1-current",
        candidateId: "live-book-ch-1-current",
        revision: 1,
        idempotencyKey: "k1",
      });
      expect(outcome.accepted).toBe(true);
      expect(outcome.code).toBe("201");
      // The receipt is the server's, not a client timestamp.
      expect(outcome.commitId).toBe("commit-abc12345");
      // The idempotency key and base revision are actually sent now; they used
      // to be displayed in the dialog and then dropped.
      expect(approved[0]?.body).toEqual({ idempotencyKey: "k1", baseRevision: 1 });
      // It targets the real book and chapter, not the UI placeholder "current".
      expect(approved[0]?.url).toContain("/books/live-book/chapters/1/approve");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("commit blocks on a critical audit issue without touching the approve API", async () => {
    const live = getWorkbenchSource(false);
    const approved: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/approve")) {
        approved.push(url);
        return json({ ok: true });
      }
      if (url.endsWith("/workspace")) return json({ chapterNumber: 1, brief: "", plan: null, versions: [], canDelete: true });
      if (url.endsWith("/books")) return json({ books: [liveBook] });
      if (url.endsWith("/chapters/1")) return json({ chapterNumber: 1, content: "正文" });
      return json({ chapters: [{ ...liveChapter, auditIssues: ["[critical] 主角动机断裂"] }] });
    }) as unknown as typeof fetch;
    try {
      await live.load("normal");
      const outcome = await live.commit({
        bookId: "current",
        chapterId: "live-book-ch-1-current",
        candidateId: "live-book-ch-1-current",
        revision: 1,
        idempotencyKey: "k1",
      });
      expect(outcome.accepted).toBe(false);
      expect(outcome.code).toBe("422");
      expect(approved).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("marks archived versions as read-only records and keeps the live draft editable", async () => {
    const live = getWorkbenchSource(false);
    const originalFetch = globalThis.fetch;
    const versionId = "1700000000000_manual_00000000-0000-0000-0000-000000000000";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/workspace")) {
        return json({
          chapterNumber: 1,
          brief: "",
          plan: null,
          versions: [{
            id: versionId, source: "manual",
            createdAt: "2026-01-01T00:00:00.000Z", characterCount: 4,
          }],
          canDelete: true,
        });
      }
      if (url.includes("/versions/")) return json({ content: "历史正文" });
      if (url.endsWith("/books")) return json({ books: [liveBook] });
      if (url.endsWith("/chapters/1")) return json({ chapterNumber: 1, content: "当前正文" });
      return json({ chapters: [liveChapter] });
    }) as unknown as typeof fetch;
    try {
      const dataset = await live.load("normal");
      const working = dataset.candidates.find((item) => item.id.endsWith("-current"));
      const archived = dataset.candidates.find((item) => item.id === versionId);
      expect(working?.archived).toBe(false);
      expect(archived?.archived).toBe(true);
      // Both carry their chapter scoping, so a candidate can never be applied to
      // whichever chapter happens to be selected.
      expect(working?.chapterId).toBe("live-book-ch-1");
      expect(archived?.chapterId).toBe("live-book-ch-1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reports a warning-only chapter as needing author confirmation, not as passed", async () => {
    const live = getWorkbenchSource(false);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/workspace")) return json({ chapterNumber: 1, brief: "", plan: null, versions: [], canDelete: true });
      if (url.endsWith("/books")) return json({ books: [liveBook] });
      if (url.endsWith("/chapters/1")) return json({ chapterNumber: 1, content: "正文" });
      return json({
        chapters: [{
          ...liveChapter,
          auditIssues: ["[warning] Manual chapter replacement requires review before continuation."],
        }],
      });
    }) as unknown as typeof fetch;
    try {
      const dataset = await live.load("normal");
      const gate = dataset.commitPreview.gates.find((item) => item.id === "gate-audit");
      // Previously this read "通过 / 无未处理审计问题" purely because nothing was
      // critical, which hid a decision the author is being asked to make.
      expect(gate?.state).toBe("warn");
      expect(gate?.detail).toContain("需作者确认");
      expect(gate?.state).not.toBe("pass");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("flags a chapter whose prose changed after its audit as stale and blocked", async () => {
    const live = getWorkbenchSource(false);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/workspace")) return json({ chapterNumber: 1, brief: "", plan: null, versions: [], canDelete: true });
      if (url.endsWith("/books")) return json({ books: [liveBook] });
      if (url.endsWith("/chapters/1")) return json({ chapterNumber: 1, content: "正文" });
      // `staleAudit` is derived by the server, where the rule lives; the client
      // only reads it, so it cannot drift from the commit gate's definition.
      return json({ chapters: [{ ...liveChapter, status: "audit-failed", staleAudit: true }] });
    }) as unknown as typeof fetch;
    try {
      const dataset = await live.load("normal");
      const chapter = dataset.chapters[0];
      // `staleReview` used to be hardcoded false, so the badge never appeared.
      expect(chapter?.staleReview).toBe(true);
      const gate = dataset.commitPreview.gates.find((item) => item.id === "gate-audit");
      expect(gate?.state).toBe("block");
      expect(gate?.detail).toContain("重新审核");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("live load reads the project and never fabricates a shelf", async () => {    const live = getWorkbenchSource(false);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ books: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    try {
      const dataset = await live.load("normal");
      // No project books → genuinely empty, not the demo shelf.
      expect(dataset.books).toEqual([]);
      expect(dataset.chapters).toEqual([]);
      expect(dataset.research.materials).toEqual([]);
      expect(dataset.analytics.pacingAlerts).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("live load maps real books instead of inventing them", async () => {
    const live = getWorkbenchSource(false);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/books")) {
        return new Response(JSON.stringify({
          books: [{ id: "b-real", title: "真书", genre: "玄幻", status: "active", targetChapters: 30, chapterWordCount: 3000, chaptersWritten: 2 }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        chapters: [
          { number: 1, title: "第一章", status: "published", wordCount: 3000 },
          { number: 2, title: "第二章", status: "drafting", wordCount: 1200 },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    try {
      const dataset = await live.load("normal");
      expect(dataset.books.map((b) => b.title)).toEqual(["真书"]);
      expect(dataset.chapters).toHaveLength(2);
      expect(dataset.chapters[0]).toMatchObject({ bookId: "b-real", number: 1, stage: "committed" });
      expect(dataset.chapters[1]).toMatchObject({ stage: "drafting" });
      expect(dataset.export.submittedChapters).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("classifies an unavailability error so the UI can say 不可用", () => {
    expect(isUnavailable(new WorkbenchUnavailableError("nope"))).toBe(true);
    const tagged = Object.assign(new Error("nope"), { code: "WORKBENCH_UNAVAILABLE" });
    expect(isUnavailable(tagged)).toBe(true);
    expect(isUnavailable(new Error("plain failure"))).toBe(false);
    expect(isUnavailable("not an error")).toBe(false);
  });
});

describe("commit preview candidate selection", () => {
  const chapter: Chapter = {
    id: "b-ch-3",
    bookId: "b",
    number: 3,
    title: "第三章",
    stage: "in_review",
    wordCount: 120,
    updatedAt: "2026-01-01T00:00:00.000Z",
    staleReview: false,
  } as Chapter;

  const live: Candidate = {
    id: "b-ch-3-current",
    label: "当前候选稿",
    revision: 2,
    source: "hand",
    updatedAt: "2026-01-01T00:00:00.000Z",
    baseline: "初始稿",
    wordCount: 120,
    body: "正文",
    isFormal: true,
    bookId: "b",
    chapterId: "b-ch-3",
    archived: false,
  };

  const archived: Candidate = {
    ...live,
    id: "1700000000000_revision_00000000-0000-0000-0000-000000000000",
    label: "修订 · 2026-01-01",
    isFormal: false,
    wordCount: 80,
    archived: true,
  };

  const counters = { blocking: 0, warnings: 0, unverified: 0 };

  it("describes the selected candidate, not the formal one", () => {
    const preview = buildCommitPreview(chapter, [live, archived], counters, live.id);
    expect(preview.candidateId).toBe(live.id);
  });

  it("blocks commit when the selected candidate is an archived version", () => {
    const preview = buildCommitPreview(chapter, [live, archived], counters, archived.id);
    expect(preview.candidateId).toBe(archived.id);
    const candidateGate = preview.gates.find((gate) => gate.id === "gate-candidate");
    expect(candidateGate?.state).toBe("block");
  });
});


