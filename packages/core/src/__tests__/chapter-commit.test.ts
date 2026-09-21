import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChapterMeta, ChapterStatus } from "../models/chapter.js";
import { waiverBasisHash, type Finding } from "../findings/types.js";
import {
  commitChapter,
  findCommitReceipt,
  type CommitDeps,
} from "../pipeline/chapter-commit.js";

const BOOK = "b1";
const CHAPTER = 3;

function meta(status: ChapterStatus, updatedAt = "2026-01-01T00:00:00.000Z"): ChapterMeta {
  return {
    number: CHAPTER,
    title: "第三章",
    status,
    wordCount: 1200,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    auditIssues: [],
    lengthWarnings: [],
  } as ChapterMeta;
}

const blockingFinding = (): Finding => ({
  id: "f1",
  source: "continuity",
  rule: "continuity.x",
  severity: "critical",
  blocking: true,
  scope: "chapter",
  status: "open",
  message: "动机断裂",
  suggestion: "补动机",
  evidence: { chapterNumber: CHAPTER },
  policyVersion: "v",
  createdAt: new Date(0).toISOString(),
});

async function makeDeps(initialStatus: ChapterStatus = "ready-for-review") {
  const bookDir = await mkdtemp(join(tmpdir(), "nc-commit-"));
  await mkdir(join(bookDir, "chapters"), { recursive: true });
  await writeFile(
    join(bookDir, "chapters", `000${CHAPTER}_chapter.md`),
    "正文内容\n",
    "utf-8",
  );
  // One archived version → current revision is 2.
  const versionsDir = join(bookDir, "chapters", ".versions", `000${CHAPTER}`);
  await mkdir(versionsDir, { recursive: true });
  await writeFile(
    join(versionsDir, "1700000000000_manual_00000000-0000-0000-0000-000000000000.md"),
    "旧正文\n",
    "utf-8",
  );

  let index: ChapterMeta[] = [meta(initialStatus)];
  const deps: CommitDeps = {
    bookDir: () => bookDir,
    loadChapterIndex: async () => index,
    saveChapterIndex: async (_bookId, next) => { index = [...next]; },
  };
  return { bookDir, deps, currentIndex: () => index, setIndex: (next: ChapterMeta[]) => { index = next; } };
}

describe("commitChapter", () => {
  let ctx: Awaited<ReturnType<typeof makeDeps>>;

  beforeEach(async () => { ctx = await makeDeps(); });
  afterEach(async () => { await rm(ctx.bookDir, { recursive: true, force: true }); });

  it("approves a ready chapter and returns a real receipt", async () => {
    const result = await commitChapter(ctx.deps, { bookId: BOOK, chapterNumber: CHAPTER });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt.commitId).toMatch(/^commit-[0-9a-f]{8}$/);
    expect(result.receipt.revision).toBe(2);
    expect(result.receipt.contentHash).toHaveLength(8);
    expect(result.receipt.status).toBe("approved");
    expect(ctx.currentIndex()[0]?.status).toBe("approved");
  });

  it("updates updatedAt so a fresh commit does not look untouched", async () => {
    const before = ctx.currentIndex()[0]!.updatedAt;
    await commitChapter(ctx.deps, {
      bookId: BOOK,
      chapterNumber: CHAPTER,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });
    const after = ctx.currentIndex()[0]!.updatedAt;
    expect(after).not.toBe(before);
    expect(after).toBe("2026-06-01T12:00:00.000Z");
  });

  it("refuses a chapter that does not exist, instead of reporting success", async () => {
    const result = await commitChapter(ctx.deps, { bookId: BOOK, chapterNumber: 99 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
    expect(result.code).toBe("CHAPTER_NOT_FOUND");
  });

  it("refuses when the prose file is missing even if the index has the chapter", async () => {
    const { rm: rmFile } = await import("node:fs/promises");
    await rmFile(join(ctx.bookDir, "chapters", `000${CHAPTER}_chapter.md`));
    const result = await commitChapter(ctx.deps, { bookId: BOOK, chapterNumber: CHAPTER });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });

  it("reports a stale base as 409 and a mismatched base as 412", async () => {
    const behind = await commitChapter(ctx.deps, {
      bookId: BOOK, chapterNumber: CHAPTER, baseRevision: 1,
    });
    expect(behind.ok).toBe(false);
    if (!behind.ok) {
      expect(behind.status).toBe(409);
      expect(behind.code).toBe("STALE_BASE");
      expect(behind.currentRevision).toBe(2);
    }

    const ahead = await commitChapter(ctx.deps, {
      bookId: BOOK, chapterNumber: CHAPTER, baseRevision: 9,
    });
    expect(ahead.ok).toBe(false);
    if (!ahead.ok) {
      expect(ahead.status).toBe(412);
      expect(ahead.code).toBe("REVISION_MISMATCH");
    }
  });

  it("accepts a matching base revision", async () => {
    const result = await commitChapter(ctx.deps, {
      bookId: BOOK, chapterNumber: CHAPTER, baseRevision: 2,
    });
    expect(result.ok).toBe(true);
  });

  it("refuses to commit prose whose audit is stale", async () => {
    // This is the "edit, ignore the warning, approve" path.
    const stale = await makeDeps("audit-failed");
    try {
      const result = await commitChapter(stale.deps, {
        bookId: BOOK, chapterNumber: CHAPTER,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(422);
        expect(result.code).toBe("AUDIT_STALE");
      }
    } finally {
      await rm(stale.bookDir, { recursive: true, force: true });
    }
  });

  it("refuses a chapter that has never passed an audit (drafted / imported)", async () => {
    for (const status of ["drafted", "imported", "card-generated", "rejected"] as const) {
      const unverified = await makeDeps(status);
      try {
        const result = await commitChapter(unverified.deps, {
          bookId: BOOK, chapterNumber: CHAPTER,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe("AUDIT_STALE");
      } finally {
        await rm(unverified.bookDir, { recursive: true, force: true });
      }
    }
  });

  it("re-blocks a waiver whose evidence passage is gone, and clears it while the passage remains", async () => {
    const body = "这里是一段足够长的正文内容，用于引用匹配。\n";
    await writeFile(join(ctx.bookDir, "chapters", `000${CHAPTER}_chapter.md`), body, "utf-8");
    const quote = "这里是一段足够长的正文内容";
    const waived: Finding = {
      ...blockingFinding(),
      status: "waived",
      evidence: { chapterNumber: CHAPTER, quote },
      waiver: {
        by: "作者",
        reason: "有意保留",
        at: new Date(0).toISOString(),
        basisHash: waiverBasisHash({ evidence: { quote } }),
      },
    };

    const intact = await commitChapter(ctx.deps, {
      bookId: BOOK, chapterNumber: CHAPTER, baseRevision: 2, findings: [waived],
    });
    expect(intact.ok).toBe(true);

    // The passage the waiver referred to is rewritten away.
    await writeFile(join(ctx.bookDir, "chapters", `000${CHAPTER}_chapter.md`), "完全不同的新正文。\n", "utf-8");
    const stale = await commitChapter(ctx.deps, {
      bookId: BOOK, chapterNumber: CHAPTER, findings: [waived],
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("WAIVER_STALE");
  });

  it("refuses when blocking findings remain, and returns them", async () => {
    const result = await commitChapter(ctx.deps, {
      bookId: BOOK, chapterNumber: CHAPTER, findings: [blockingFinding()],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BLOCKED_BY_FINDINGS");
      expect(result.findings).toHaveLength(1);
    }
    // Nothing was written.
    expect(ctx.currentIndex()[0]?.status).toBe("ready-for-review");
  });

  it("does not treat unverified findings as clean", async () => {
    const unverified: Finding = {
      ...blockingFinding(),
      id: "u1",
      rule: "deslop.probe.timeout",
      source: "deslop",
      status: "unverified",
    };
    const result = await commitChapter(ctx.deps, {
      bookId: BOOK, chapterNumber: CHAPTER, findings: [unverified],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("BLOCKED_BY_FINDINGS");
  });

  it("records waived rules on the receipt without blocking", async () => {
    const waived: Finding = {
      ...blockingFinding(),
      id: "w1",
      rule: "deslop.style",
      severity: "warning",
      blocking: false,
      status: "waived",
      waiver: { by: "作者", reason: "有意保留", at: new Date().toISOString(), basisHash: "h" },
    };
    const result = await commitChapter(ctx.deps, {
      bookId: BOOK, chapterNumber: CHAPTER, findings: [waived],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.receipt.waivedRules).toEqual(["deslop.style"]);
  });

  it("returns the same receipt for a repeated idempotency key", async () => {
    const first = await commitChapter(ctx.deps, {
      bookId: BOOK, chapterNumber: CHAPTER, idempotencyKey: "k-1",
    });
    expect(first.ok).toBe(true);

    // Simulate a second request after the world moved on: the replay must not
    // re-validate, or a legitimate retry would fail with a confusing error.
    ctx.setIndex([{ ...meta("approved"), updatedAt: "2026-07-01T00:00:00.000Z" }]);
    const second = await commitChapter(ctx.deps, {
      bookId: BOOK, chapterNumber: CHAPTER, idempotencyKey: "k-1", baseRevision: 99,
    });

    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.idempotent).toBe(true);
      expect(second.receipt.commitId).toBe(first.receipt.commitId);
    }
    const stored = await findCommitReceipt(ctx.bookDir, "k-1");
    expect(stored?.commitId).toBe(first.ok ? first.receipt.commitId : "");
  });

  it("keeps distinct idempotency keys as distinct commits", async () => {
    const a = await commitChapter(ctx.deps, {
      bookId: BOOK, chapterNumber: CHAPTER, idempotencyKey: "k-a",
      now: new Date("2026-02-01T00:00:00.000Z"),
    });
    const b = await commitChapter(ctx.deps, {
      bookId: BOOK, chapterNumber: CHAPTER, idempotencyKey: "k-b",
      now: new Date("2026-02-02T00:00:00.000Z"),
    });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.receipt.commitId).not.toBe(b.receipt.commitId);
  });
});
