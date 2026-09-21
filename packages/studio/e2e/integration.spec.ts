import { test, expect } from "@playwright/test";

/**
 * Integration guards for the two imported libraries.
 *
 * These assert the assets are actually SERVED, not merely present on disk —
 * a previous layout put the Oh Story skills next to a top-level SKILL.md, which
 * made the loader treat the folder as one skill and never discover the thirteen
 * subdirectories. Serving-level assertions catch that class of regression.
 */

test("Oh Story writing skills are loaded and served", async ({ request }) => {
  const res = await request.get("/api/v1/skills");
  expect(res.ok()).toBeTruthy();
  const json = (await res.json()) as { skills: Array<{ id: string }> };
  const ids = json.skills.map((s) => s.id);

  for (const id of [
    "story-setup",
    "story",
    "story-long-scan",
    "story-long-analyze",
    "story-long-write",
    "story-short-scan",
    "story-short-analyze",
    "story-short-write",
    "story-deslop",
    "story-review",
    "story-import",
    "story-cover",
  ]) {
    expect(ids, `missing skill ${id}`).toContain(id);
  }
});

test("Webnovel Writer genre templates are available", async ({ request }) => {
  const res = await request.get("/api/v1/genres");
  expect(res.ok()).toBeTruthy();
  const json = (await res.json()) as { genres: Array<{ id: string }> };
  const ids = json.genres.map((g) => g.id);

  // One from each imported family, plus the built-ins that shipped before.
  for (const id of [
    "xiuxian", "cthulhu", "rules-weird", "urban-ability",
    "palace-intrigue", "zhihu-short", "esports", "war-spy",
    "xuanhuan", "xianxia",
  ]) {
    expect(ids, `missing genre ${id}`).toContain(id);
  }

  // Genre ids stay ASCII slugs so they are addressable everywhere.
  expect(ids.filter((id) => /[^\x00-\x7F]/.test(id))).toEqual([]);
});

test("the skills section lists the imported writing skills in the UI", async ({ page }) => {
  await page.goto("/#/settings");
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
  // The imported skill names appear in the project settings skill list.
  await expect(page.getByText("story-long-write").first()).toBeVisible({ timeout: 20_000 });
});

test("diagnostics labels stay product-neutral", async ({ page }) => {
  await page.goto("/#/doctor");
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
  // The visible labels describe the role, not the internal file namespace.
  await expect(page.getByText("项目配置文件")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("inkos.json 配置")).toHaveCount(0);
  await expect(page.getByText("全局 ~/.inkos/.env")).toHaveCount(0);
});

test("long settings lists scroll inside a bounded box instead of stretching the page", async ({ page }) => {
  await page.goto("/#/settings");
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });

  // The prompt-pack list must own its scrolling so later groups stay reachable.
  const promptList = page.locator("div.max-h-\\[520px\\]").first();
  await expect(promptList).toBeVisible({ timeout: 20_000 });
  const metrics = await promptList.evaluate((el) => ({
    maxHeight: getComputedStyle(el).maxHeight,
    scrolls: el.scrollHeight > el.clientHeight,
  }));
  expect(metrics.maxHeight).not.toBe("none");
  expect(metrics.scrolls).toBe(true);
});
