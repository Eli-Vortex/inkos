import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
// e2e/fixtures → e2e → studio → packages → repo root, then the E2E project.
const E2E_ROOT = resolve(dir, "../../../..", "test-project");

export const LIVE_BOOK_ID = "e2e-live-chapter";
export const LIVE_BOOK_TITLE = "实时闭环测试书";
export const LIVE_CHAPTER_TITLE = "灯下第一夜";
export const LIVE_CHAPTER_BODY = "他在天亮前把灯取了下来，河面还浮着薄雾。\n";
export const LIVE_CHAPTER_EDITED = "他在天亮前把灯取了下来，河面浮着薄雾，像一层没人收拾的旧账。";

export function liveBookDir(): string {
  return resolve(E2E_ROOT, "books", LIVE_BOOK_ID);
}

export function liveChapterDir(): string {
  return resolve(liveBookDir(), "chapters");
}

export function liveChapterFilePath(): string {
  return resolve(liveChapterDir(), "0001_灯下第一夜.md");
}

export function liveIndexPath(): string {
  return resolve(liveChapterDir(), "index.json");
}

export function liveVersionsDir(): string {
  return resolve(liveChapterDir(), ".versions", "0001");
}

export function livePlanPath(): string {
  return resolve(liveBookDir(), "story", "runtime", "chapter-0001.plan.md");
}

export function liveApprovalPath(): string {
  return resolve(liveBookDir(), "story", "runtime", "chapter-0001.approval.json");
}

/**
 * Seeds a real book with one real chapter awaiting review, so the live adapter
 * can be exercised against the actual chapter transaction system: save draft →
 * (version archived, index marked for review) → approve (commit).
 */
export async function seedLiveChapter(): Promise<void> {
  await removeLiveChapter();

  const now = new Date().toISOString();
  await mkdir(liveChapterDir(), { recursive: true });

  await writeFile(
    resolve(liveBookDir(), "book.json"),
    JSON.stringify(
      {
        id: LIVE_BOOK_ID,
        title: LIVE_BOOK_TITLE,
        platform: "other",
        genre: "xuanhuan",
        status: "active",
        targetChapters: 20,
        chapterWordCount: 3000,
        language: "zh",
        createdAt: now,
        updatedAt: now,
      },
      null,
      2,
    ),
    "utf-8",
  );

  await writeFile(liveChapterFilePath(), LIVE_CHAPTER_BODY, "utf-8");

  // A chapter plan, so the outline gate and the approval flow have something
  // real to work with. Approval hashes the file, so the content only needs to be
  // plausible markdown.
  await mkdir(resolve(liveBookDir(), "story", "runtime"), { recursive: true });
  await writeFile(
    livePlanPath(),
    [
      "# 第 1 章 细纲：灯下第一夜",
      "",
      "## 本章目标",
      "让主角在今天亮前取下那盏灯，并第一次意识到河面下有人在等。",
      "",
      "## 必须保留",
      "- 主角的谨慎",
      "",
      "## 不要做",
      "- 不要在第一章解释灯的来历",
      "",
    ].join("\n"),
    "utf-8",
  );

  // No auditIssues → the chapter has no blocking findings, so commit is allowed.
  await writeFile(
    liveIndexPath(),
    JSON.stringify(
      [
        {
          number: 1,
          title: LIVE_CHAPTER_TITLE,
          status: "ready-for-review",
          wordCount: LIVE_CHAPTER_BODY.replace(/\s+/g, "").length,
          createdAt: now,
          updatedAt: now,
          auditIssues: [],
        },
      ],
      null,
      2,
    ),
    "utf-8",
  );
}

export async function removeLiveChapter(): Promise<void> {
  await rm(liveBookDir(), { recursive: true, force: true });
}

