import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  archiveChapterVersion,
  pruneChapterVersions,
  type ChapterVersionSource,
  listChapterVersions,
  parseChapterFileNumber,
  readChapterPlanDocument,
  readChapterRevision,
  readChapterUserBrief,
  readChapterVersion,
  saveChapterUserBrief,
  selectChapterFile,
} from "../state/chapter-workspace.js";

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false);
}

describe("chapter workspace", () => {
  it("persists, reads, and clears a per-chapter user brief", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-chapter-workspace-"));

    await expect(readChapterUserBrief(bookDir, 3)).resolves.toBe("");
    await saveChapterUserBrief(bookDir, 3, "  保留雨夜证词，重写结尾。  ");
    await expect(readChapterUserBrief(bookDir, 3)).resolves.toBe("保留雨夜证词，重写结尾。");

    await saveChapterUserBrief(bookDir, 3, " \n ");
    await expect(readChapterUserBrief(bookDir, 3)).resolves.toBe("");
    await expect(exists(join(bookDir, "story", "runtime", "chapter-0003.user-brief.md")))
      .resolves.toBe(false);
  });

  it("reads the persisted system plan without requiring one to exist", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-chapter-workspace-"));
    await expect(readChapterPlanDocument(bookDir, 2)).resolves.toBeNull();

    const runtimeDir = join(bookDir, "story", "runtime");
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(join(runtimeDir, "chapter-0002.plan.md"), "# Chapter 2 Plan\n\nKeep the witness alive.", "utf-8");

    await expect(readChapterPlanDocument(bookDir, 2))
      .resolves.toBe("# Chapter 2 Plan\n\nKeep the witness alive.");
  });

  it("archives immutable chapter versions and lists newest first", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-chapter-workspace-"));
    const first = await archiveChapterVersion(
      bookDir,
      4,
      "# 第4章 初稿\n\n旧正文。",
      "manual",
      new Date("2026-07-01T00:00:00.000Z"),
    );
    const second = await archiveChapterVersion(
      bookDir,
      4,
      "# 第4章 二稿\n\n新正文。",
      "revision",
      new Date("2026-07-02T00:00:00.000Z"),
    );

    expect(first.id).not.toBe(second.id);
    await expect(readChapterVersion(bookDir, 4, first.id))
      .resolves.toBe("# 第4章 初稿\n\n旧正文。");
    await expect(readChapterVersion(bookDir, 4, second.id))
      .resolves.toBe("# 第4章 二稿\n\n新正文。");

    const versions = await listChapterVersions(bookDir, 4);
    expect(versions.map((version) => version.id)).toEqual([second.id, first.id]);
    expect(versions.map((version) => version.source)).toEqual(["revision", "manual"]);
    expect(versions.map((version) => version.createdAt)).toEqual([
      "2026-07-02T00:00:00.000Z",
      "2026-07-01T00:00:00.000Z",
    ]);
    expect(versions.map((version) => version.characterCount)).toEqual([
      "# 第4章 二稿\n\n新正文。".length,
      "# 第4章 初稿\n\n旧正文。".length,
    ]);
  });

  it("rejects unsafe version ids instead of reading outside the archive", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-chapter-workspace-"));
    await expect(readChapterVersion(bookDir, 1, "../book.json"))
      .rejects.toThrow(/invalid chapter version id/i);
  });

describe("chapter version retention", () => {
  async function seedVersions(bookDir: string, count: number, source: ChapterVersionSource) {
    for (let index = 0; index < count; index += 1) {
      await archiveChapterVersion(
        bookDir,
        3,
        `第 ${index} 版正文`,
        source,
        new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      );
    }
  }

  it("keeps the newest versions and drops the oldest beyond the cap", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-retention-"));
    await seedVersions(bookDir, 5, "manual");

    const removed = await pruneChapterVersions(bookDir, 3, 3);
    expect(removed).toHaveLength(2);

    const remaining = await listChapterVersions(bookDir, 3);
    expect(remaining).toHaveLength(3);
    // Oldest-first: the two earliest timestamps are the ones dropped.
    expect(remaining.map((version) => version.createdAt)).not.toContain(
      new Date(Date.UTC(2026, 0, 1, 0, 0, 0)).toISOString(),
    );
  });

  it("does nothing while under the cap", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-retention-under-"));
    await seedVersions(bookDir, 2, "manual");
    await expect(pruneChapterVersions(bookDir, 3, 5)).resolves.toEqual([]);
    expect(await listChapterVersions(bookDir, 3)).toHaveLength(2);
  });

  it("keeps restore points and does not empty the history to satisfy the cap", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-retention-restore-"));
    await seedVersions(bookDir, 3, "restore");
    await seedVersions(bookDir, 3, "manual");

    // The three restore points already fill the budget. Pruning the rest would
    // delete every ordinary version, so nothing is removed instead.
    const removed = await pruneChapterVersions(bookDir, 3, 3);
    expect(removed).toEqual([]);
    expect(await listChapterVersions(bookDir, 3)).toHaveLength(6);
  });

  it("prunes ordinary versions while preserving restore points", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-retention-mixed-"));
    await seedVersions(bookDir, 1, "restore");
    await seedVersions(bookDir, 6, "manual");

    const removed = await pruneChapterVersions(bookDir, 3, 4);
    expect(removed).toHaveLength(3);

    const remaining = await listChapterVersions(bookDir, 3);
    expect(remaining.filter((version) => version.source === "restore")).toHaveLength(1);
    expect(remaining).toHaveLength(4);
  });
});

  it("locates chapter files by exact number, not a 4-character prefix", () => {
    // A 5-digit number is 10000, not chapter 1000.
    expect(parseChapterFileNumber("10000_x.md")).toBe(10000);
    expect(parseChapterFileNumber("0007-foo.md")).toBe(7);
    expect(parseChapterFileNumber("0007_bar.md")).toBe(7);
    expect(parseChapterFileNumber("notes.md")).toBeNull();

    expect(selectChapterFile(["10000_x.md"], 1000)).toBeNull();
    expect(selectChapterFile(["0007-foo.md"], 7)).toBe("0007-foo.md");
    // The canonical underscore form wins when both separators exist.
    expect(selectChapterFile(["0007-a.md", "0007_b.md"], 7)).toBe("0007_b.md");
  });

  it("keeps the revision monotonic after history is pruned to the cap", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-monotonic-revision-"));
    await mkdir(join(bookDir, "chapters"), { recursive: true });
    await writeFile(join(bookDir, "chapters", "0003_chapter.md"), "正文\n", "utf-8");

    let previous = 0;
    for (let index = 0; index < 25; index += 1) {
      await archiveChapterVersion(
        bookDir,
        3,
        `第 ${index} 版正文`,
        "manual",
        new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      );
      // Retention caps the archive directory; the revision must not cap with it.
      await pruneChapterVersions(bookDir, 3, 20);
      const info = await readChapterRevision(bookDir, 3);
      expect(info).not.toBeNull();
      expect(info!.revision).toBeGreaterThan(previous);
      previous = info!.revision;
    }
    expect(previous).toBeGreaterThan(21);
  });

  it("does not expose archives from another chapter", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-chapter-workspace-"));
    const version = await archiveChapterVersion(
      bookDir,
      1,
      "# 第1章",
      "regeneration",
      new Date("2026-07-03T00:00:00.000Z"),
    );

    await expect(readChapterVersion(bookDir, 2, version.id)).rejects.toThrow();
    await expect(readFile(
      join(bookDir, "chapters", ".versions", "0001", `${version.id}.md`),
      "utf-8",
    )).resolves.toBe("# 第1章");
  });
});

