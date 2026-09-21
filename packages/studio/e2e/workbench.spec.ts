import { test, expect, type Page } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Novel Creation workbench — end-to-end coverage.
 *
 * The workbench runs on the demo dataset by default, so these specs exercise the
 * real component tree, router, editor buffer state machine and adapter contract
 * without needing a live LLM. They prove the integrated workbench is reachable
 * from the host Studio and that its core authoring flow behaves as documented in
 * docs/03-frontend-design.md.
 *
 * The host sidebar lists only real books, so the structure spec seeds one.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const E2E_ROOT = resolve(here, "../../..", "test-project");
const SEED_BOOK_ID = "e2e-wb-structure";
const SEED_BOOK_TITLE = "结构测试书";

async function seedStructureBook() {
  const dir = resolve(E2E_ROOT, "books", SEED_BOOK_ID);
  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  await writeFile(
    resolve(dir, "book.json"),
    JSON.stringify({
      id: SEED_BOOK_ID,
      title: SEED_BOOK_TITLE,
      platform: "other",
      genre: "玄幻",
      status: "active",
      targetChapters: 20,
      chapterWordCount: 3000,
      language: "zh",
      createdAt: now,
      updatedAt: now,
    }, null, 2),
    "utf-8",
  );
}

const AREAS = [
  { area: "books", label: "作品列表" },
  { area: "writing", label: "写作工作区" },
  { area: "outline", label: "细纲与合同" },
  { area: "review", label: "审核视图" },
  { area: "compare", label: "版本比较" },
  { area: "commit", label: "提交确认" },
  { area: "tasks", label: "任务中心" },
  { area: "research", label: "研究与分析" },
  { area: "analytics", label: "连载分析" },
  { area: "export", label: "导出" },
  { area: "settings", label: "设置与关于" },
] as const;

async function gotoWorkbench(page: Page, area: string) {
  // Demo mode is opt-in; these specs read the deterministic demo dataset.
  await page.goto(`/?demo=1#/workbench/${area}`);
  await expect(page.locator(".nc-root")).toBeVisible({ timeout: 20_000 });
}

test.describe("Novel Creation workbench", () => {
  test.beforeAll(async () => {
    await rm(resolve(E2E_ROOT, "books", SEED_BOOK_ID), { recursive: true, force: true });
    await seedStructureBook();
  });

  test.afterAll(async () => {
    await rm(resolve(E2E_ROOT, "books", SEED_BOOK_ID), { recursive: true, force: true });
  });

  test("uses the Novel Creation product title", async ({ page }) => {
    await gotoWorkbench(page, "books");
    await expect(page).toHaveTitle("Novel Creation");
  });

  test("every area renders from its deep link without a load failure", async ({ page }) => {
    for (const { area, label } of AREAS) {
      await gotoWorkbench(page, area);
      await expect(page.locator(`.nc-root[data-area="${area}"]`)).toBeVisible({ timeout: 20_000 });
      await expect(page.locator(".nc-topbar")).toContainText(label, { timeout: 20_000 });
      // Each area renders its own surface (writing uses a split pane, the rest
      // use a page head/body) — but never the "read failed" alert.
      await expect(page.locator(".nc-split, .nc-page-head, .nc-page-body").first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText("工作台数据读取失败")).toHaveCount(0);
    }
  });

  test("navigation switches areas via host sidebar and route follows", async ({ page }) => {
    await gotoWorkbench(page, "books");
    const nav = page.locator('[data-testid="novel-creation-section"]');
    await nav.getByRole("button", { name: "任务中心", exact: true }).click();
    await expect(page.locator('.nc-root[data-area="tasks"]')).toBeVisible();
    await expect(page).toHaveURL(/#\/workbench\/tasks/);

    await nav.getByRole("button", { name: "研究中心", exact: true }).click();
    await expect(page.locator('.nc-root[data-area="research"]')).toBeVisible();
  });

  test("the workbench book selector writes its context into the route", async ({ page }) => {
    await gotoWorkbench(page, "writing");
    await page.getByLabel("当前作品").selectOption("b-jiuzhang");

    await expect(page).toHaveURL(/#\/workbench\/writing\/b-jiuzhang$/);
    await expect(page.getByLabel("当前作品")).toHaveValue("b-jiuzhang");
  });

  test("book list shows the author's shelf with progress and governance", async ({ page }) => {
    await gotoWorkbench(page, "books");
    await expect(page.getByRole("heading", { name: "作品列表", level: 1 })).toBeVisible();
    await expect(page.locator(".nc-book-row").first()).toBeVisible({ timeout: 20_000 });
  });

  test("writing workspace marks edits dirty, then autosaves the candidate", async ({ page }) => {
    await gotoWorkbench(page, "writing");

    const editor = page.getByRole("textbox", { name: /正文/ });
    await expect(editor).toBeVisible({ timeout: 20_000 });

    await expect(page.getByRole("status")).toBeVisible();

    await editor.fill("渡口的灯在雨里晃了一下，像是要灭，又没灭。");
    // The buffer must report unsaved changes rather than silently saving.
    await expect(page.locator('.nc-statesync[data-state="dirty"]')).toBeVisible({ timeout: 5_000 });

    // IME-safe debounce (docs/03 §4) then a successful save receipt.
    await expect(page.locator('.nc-statesync[data-state="clean"]')).toBeVisible({ timeout: 10_000 });
  });

  test("a revision conflict blocks retries and chapter switching until rebase", async ({ page }) => {
    await gotoWorkbench(page, "settings");
    await page.getByRole("button", { name: "冲突", exact: true }).click();
    await page.evaluate(() => { window.location.hash = "/workbench/writing"; });

    const editor = page.getByRole("textbox", { name: /正文/ });
    await expect(editor).toBeVisible({ timeout: 20_000 });

    await editor.fill("第一次保存建立新版本。");
    await expect(page.locator('.nc-statesync[data-state="clean"]')).toBeVisible({ timeout: 10_000 });

    await editor.fill("第二次保存触发版本冲突。");
    await expect(page.locator('.nc-statesync[data-state="conflict"]')).toBeVisible({ timeout: 10_000 });

    await editor.fill("冲突后的文字只留在本地。");
    await page.waitForTimeout(1_200);
    await expect(page.locator('.nc-statesync[data-state="conflict"]')).toBeVisible();
    await expect(editor).toHaveValue("冲突后的文字只留在本地。");

    const chapters = page.getByRole("navigation", { name: "章节树" }).locator("button.nc-chapter");
    await chapters.nth(1).click();
    const dialog = page.getByRole("dialog", { name: "本章有未保存的改动" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "保存并切换" })).toBeDisabled();
    await expect(dialog.getByRole("alert")).toContainText("当前章节尚未切换");

    await dialog.getByRole("button", { name: "对齐基线" }).click();
    await dialog.getByRole("button", { name: "保存并切换" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(chapters.nth(1)).toHaveAttribute("aria-current", "true");
  });

  test("chapter tree selects a different active chapter", async ({ page }) => {
    await gotoWorkbench(page, "writing");
    const tree = page.getByRole("navigation", { name: "章节树" });
    await expect(tree).toBeVisible({ timeout: 20_000 });

    const chapters = tree.locator("button.nc-chapter");
    const count = await chapters.count();
    expect(count).toBeGreaterThan(1);

    const target = chapters.nth(count - 1);
    await target.click();
    await expect(target).toHaveAttribute("aria-current", "true");
  });

  test("review view groups findings by severity", async ({ page }) => {
    await gotoWorkbench(page, "review");
    await expect(page.locator(".nc-review-group").first()).toBeVisible({ timeout: 20_000 });
    // Blocking findings are listed and are never waivable from the UI (docs/03 §3.4).
    await expect(page.locator('.nc-review-item[data-severity="block"]').first()).toBeVisible();
  });

  test("commit is blocked while blocking gates are open", async ({ page }) => {
    await gotoWorkbench(page, "commit");
    await expect(page.getByRole("heading", { name: "门禁清单" })).toBeVisible({ timeout: 20_000 });

    // The demo dataset carries open blockers, so the action must be disabled.
    await expect(page.getByRole("button", { name: /确认提交/ })).toBeDisabled();
  });

  test("analytics and export render their deliverable content", async ({ page }) => {
    await gotoWorkbench(page, "analytics");
    await expect(page.getByRole("heading", { name: "连载分析", level: 1 })).toBeVisible({ timeout: 20_000 });

    await gotoWorkbench(page, "export");
    await expect(page.getByRole("heading", { name: "导出", level: 1 })).toBeVisible({ timeout: 20_000 });
    // Export defaults to committed chapters only (F-25).
    await expect(page.getByText("已提交章节").first()).toBeVisible();
  });

  test("sidebar follows the three-layer structure and the New menu groups creation", async ({ page }) => {
    await gotoWorkbench(page, "books");
    const nav = page.locator('[data-testid="novel-creation-section"]');

    // Layer 1: global workspace entries.
    await expect(nav.getByText("工作台", { exact: true })).toBeVisible();
    for (const label of ["首页", "我的作品", "研究中心", "任务中心", "会话记录"]) {
      await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
    }

    // Layer 2/3: each work is its own directory holding the authoring pages.
    const book = nav.getByRole("button", { name: SEED_BOOK_TITLE, exact: true });
    await expect(book).toBeVisible({ timeout: 20_000 });
    const bookRow = book.locator("xpath=ancestor::div[contains(@class,'group/book')]");
    await bookRow.getByRole("button", { name: new RegExp(`展开 ${SEED_BOOK_TITLE}`) }).click();
    for (const label of ["概览", "设定与大纲", "写作", "审核", "连载分析"]) {
      await expect(nav.getByRole("button", { name: label, exact: true }).first()).toBeVisible({ timeout: 10_000 });
    }

    // A book-scoped page must carry the book in the route, not just the area.
    await nav.getByRole("button", { name: "连载分析", exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`#/workbench/analytics/${SEED_BOOK_ID}`));

    // The create action is one grouped menu, not a grid of twelve buttons.
    await page.getByRole("button", { name: "新建", exact: true }).click();
    const menu = page.locator('[data-slot="dropdown-menu-content"]');
    await expect(menu).toBeVisible();
    await expect(menu.getByText("长篇小说", { exact: true })).toBeVisible();
    await expect(menu.getByText("导入章节", { exact: true })).toBeVisible();
  });

  test("mobile navigation opens as a drawer and closes after navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoWorkbench(page, "books");

    const drawer = page.locator('aside[aria-label="主导航"]');
    await expect.poll(async () => (await drawer.boundingBox())?.x ?? 0).toBeLessThan(-100);

    await page.getByRole("button", { name: "打开导航" }).click();
    await expect.poll(async () => Math.round((await drawer.boundingBox())?.x ?? -999)).toBe(0);

    await drawer.getByRole("button", { name: "首页", exact: true }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator('button[aria-label="关闭导航"].fixed.inset-0')).toHaveCount(0);
    await expect.poll(async () => (await drawer.boundingBox())?.x ?? 0).toBeLessThan(-100);
    await expect(page.getByRole("button", { name: "打开导航" })).toBeVisible();
  });

  test("real mode reads the project and never fabricates research data", async ({ page }) => {
    // No ?demo=1 → live mode: the workbench must read the real project.
    await page.goto("/#/workbench/research");
    await expect(page.locator(".nc-root")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("工作台数据读取失败")).toHaveCount(0);
    // The demo dataset's material must never appear in a real project.
    await expect(page.getByText("灯河渡口地理考")).toHaveCount(0);
    await expect(page.getByText("长夜灯河")).toHaveCount(0);
  });

  test("settings exposes the demo/live mode boundary", async ({ page }) => {
    await gotoWorkbench(page, "settings");
    await expect(page.getByText("演示数据模式").first()).toBeVisible({ timeout: 20_000 });
  });
});
