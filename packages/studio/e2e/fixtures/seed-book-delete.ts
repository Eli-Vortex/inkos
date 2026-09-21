import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
// e2e/fixtures → e2e → studio → packages → repo root, then the E2E project.
const E2E_ROOT = resolve(dir, "../../../..", "test-project");

export const E2E_BOOK_DELETE_ID = "e2e-book-delete";
export const E2E_BOOK_DELETE_TITLE = "待删除测试书";
export const E2E_BOOK_SETTINGS_ID = "e2e-book-settings";
export const E2E_BOOK_SETTINGS_TITLE = "设置入口测试书";

/**
 * Seeds a real book on disk so the sidebar's work actions (settings / delete)
 * are exercisable. Real books are the only ones that can be configured or
 * deleted; the workbench's demo shelf entries never can.
 */
export async function seedBook(id: string, title: string): Promise<void> {
  const bookDir = resolve(E2E_ROOT, "books", id);
  await mkdir(bookDir, { recursive: true });
  const now = new Date().toISOString();
  await writeFile(
    resolve(bookDir, "book.json"),
    JSON.stringify(
      {
        id,
        title,
        platform: "other",
        genre: "都市",
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
}

export async function removeBook(id: string): Promise<void> {
  await rm(resolve(E2E_ROOT, "books", id), { recursive: true, force: true });
}

export async function seedBookForDelete(): Promise<void> {
  await seedBook(E2E_BOOK_DELETE_ID, E2E_BOOK_DELETE_TITLE);
}

export async function removeBookForDelete(): Promise<void> {
  await removeBook(E2E_BOOK_DELETE_ID);
}
