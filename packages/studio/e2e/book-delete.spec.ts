import { test, expect } from "@playwright/test";
import {
  E2E_BOOK_DELETE_ID,
  E2E_BOOK_DELETE_TITLE,
  E2E_BOOK_SETTINGS_ID,
  E2E_BOOK_SETTINGS_TITLE,
  removeBook,
  seedBook,
} from "./fixtures/seed-book-delete";

/**
 * A real work must be deletable from the sidebar through BOTH affordances: the
 * always-visible "⋯" row menu and the explicit "delete work" entry inside the
 * work's own directory. Real books are the only ones with these actions, so the
 * spec seeds genuine books and drives the real DELETE path.
 */

test.beforeAll(async () => {
  await removeBook(E2E_BOOK_DELETE_ID);
  await removeBook(E2E_BOOK_SETTINGS_ID);
  await seedBook(E2E_BOOK_DELETE_ID, E2E_BOOK_DELETE_TITLE);
});

test.afterAll(async () => {
  await removeBook(E2E_BOOK_DELETE_ID);
  await removeBook(E2E_BOOK_SETTINGS_ID);
});

async function openShelf(page: import("@playwright/test").Page) {
  await page.goto("/#/");
  const nav = page.locator('[data-testid="novel-creation-section"]');
  await expect(nav.getByRole("button", { name: "我的作品", exact: true })).toBeVisible({ timeout: 20_000 });
  return nav;
}

test("the row \"…\" menu opens and its delete action works", async ({ page }) => {
  const nav = await openShelf(page);

  const book = nav.getByRole("button", { name: E2E_BOOK_DELETE_TITLE, exact: true });
  await expect(book).toBeVisible({ timeout: 20_000 });
  const row = book.locator("xpath=ancestor::div[contains(@class,'group/book')]");

  // The "…" trigger must be reachable without hovering (it used to be opacity-0).
  await row.getByRole("button", { name: new RegExp(`《${E2E_BOOK_DELETE_TITLE}》更多操作`) }).click();

  const menu = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(menu).toBeVisible();
  await menu.getByText("删除作品", { exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(E2E_BOOK_DELETE_TITLE);
  await dialog.getByRole("button", { name: "删除", exact: true }).click();

  await expect(nav.getByRole("button", { name: E2E_BOOK_DELETE_TITLE, exact: true })).toHaveCount(0, {
    timeout: 15_000,
  });
});

test("the explicit entry inside the work directory also deletes", async ({ page }) => {
  await seedBook(E2E_BOOK_SETTINGS_ID, E2E_BOOK_SETTINGS_TITLE);
  const nav = await openShelf(page);

  const book = nav.getByRole("button", { name: E2E_BOOK_SETTINGS_TITLE, exact: true });
  await expect(book).toBeVisible({ timeout: 20_000 });
  const row = book.locator("xpath=ancestor::div[contains(@class,'group/book')]");
  await row.getByRole("button", { name: new RegExp(`展开 ${E2E_BOOK_SETTINGS_TITLE}`) }).click();

  const deleteEntry = nav.getByRole("button", { name: "删除作品", exact: true }).first();
  await expect(deleteEntry).toBeVisible({ timeout: 10_000 });
  await deleteEntry.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(E2E_BOOK_SETTINGS_TITLE);
  await dialog.getByRole("button", { name: "删除", exact: true }).click();

  await expect(nav.getByRole("button", { name: E2E_BOOK_SETTINGS_TITLE, exact: true })).toHaveCount(0, {
    timeout: 15_000,
  });
});
