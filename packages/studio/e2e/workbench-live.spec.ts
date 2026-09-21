import { test, expect } from "@playwright/test";
import { readFile, readdir, writeFile } from "node:fs/promises";
import {
  LIVE_CHAPTER_EDITED,
  LIVE_CHAPTER_TITLE,
  liveChapterFilePath,
  liveIndexPath,
  liveApprovalPath,
  liveVersionsDir,
  removeLiveChapter,
  seedLiveChapter,
} from "./fixtures/seed-live-chapter";

/**
 * The production write path must reach the real chapter transaction system.
 *
 * This drives the workbench in **live mode** (no `?demo=1`) against a seeded
 * book, then verifies the result on disk — not in the UI. Saving a candidate
 * must replace the chapter file AND archive the previous text as a version;
 * committing must approve the chapter in the real chapter index.
 */

test.describe("live chapter loop", () => {
  test.beforeAll(async () => {
    await seedLiveChapter();
  });

  test.afterAll(async () => {
    await removeLiveChapter();
  });

  test("saving a candidate persists the chapter and archives a version", async ({ page }) => {
    await page.goto("/#/workbench/writing");
    await expect(page.locator(".nc-root")).toBeVisible({ timeout: 20_000 });

    const editor = page.getByRole("textbox", { name: /正文/ });
    await expect(editor).toBeVisible({ timeout: 20_000 });
    // The real chapter text must be what the editor is bound to.
    await expect(editor).toHaveValue(/他在天亮前把灯取了下来/, { timeout: 20_000 });

    await editor.fill(LIVE_CHAPTER_EDITED);
    // Autosave through the adapter → PUT /books/:id/chapters/:num
    await expect(page.locator('.nc-statesync[data-state="clean"]')).toBeVisible({ timeout: 15_000 });

    // Disk is the source of truth: the chapter file now holds the new text.
    const onDisk = await readFile(liveChapterFilePath(), "utf-8");
    expect(onDisk).toContain(LIVE_CHAPTER_EDITED);

    // The previous text was archived, so version history is not empty.
    const versions = await readdir(liveVersionsDir());
    expect(versions.filter((f) => f.endsWith(".md")).length).toBeGreaterThan(0);
  });

  test("committing approves the chapter in the real index", async ({ page }) => {
    // Re-seed so this chapter is freshly audited. Saving marks the audit stale
    // on purpose — editing prose invalidates the verdict — so a commit test must
    // start from a chapter whose review still applies.
    await seedLiveChapter();

    await page.goto("/#/workbench/commit");
    await expect(page.locator(".nc-root")).toBeVisible({ timeout: 20_000 });

    const confirm = page.getByRole("button", { name: /确认提交/ });
    await expect(confirm).toBeEnabled({ timeout: 20_000 });
    await confirm.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /确认|提交/ }).last().click();

    // The receipt reflects a real approval, not a simulated one.
    await expect(dialog.getByText(/提交回执/)).toBeVisible({ timeout: 20_000 });

    const index = JSON.parse(await readFile(liveIndexPath(), "utf-8")) as Array<{ status: string }>;
    expect(index[0]?.status).toBe("approved");
  });

  test("approving the outline is recorded on disk and clears the dirty flag", async ({ request }) => {
    await seedLiveChapter();

    const before = await request.get("/api/v1/books/e2e-live-chapter/chapters/1/plan-approval");
    expect(before.ok()).toBe(true);
    expect(await before.json()).toMatchObject({ approved: false, dirty: true, revision: 1 });

    const approved = await request.post(
      "/api/v1/books/e2e-live-chapter/chapters/1/plan-approval",
      { data: { expectedRevision: 1 } },
    );
    expect(approved.ok()).toBe(true);
    expect(await approved.json()).toMatchObject({
      ok: true,
      state: { approved: true, dirty: false, approvedRevision: 1 },
    });

    // The approval is a real file, not an in-memory flag.
    const stored = JSON.parse(await readFile(liveApprovalPath(), "utf-8")) as {
      revision: number;
      planHash: string;
      approvedBy: string;
    };
    expect(stored.revision).toBe(1);
    expect(stored.planHash).toHaveLength(8);
    expect(stored.approvedBy).toBeTruthy();
  });

  test("refuses to approve a revision the author never saw", async ({ request }) => {
    await seedLiveChapter();

    const response = await request.post(
      "/api/v1/books/e2e-live-chapter/chapters/1/plan-approval",
      { data: { expectedRevision: 99 } },
    );
    // 409 rather than a silent overwrite: approving a plan the author has not
    // read must not be recorded.
    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({ error: "REVISION_MISMATCH", currentRevision: 1 });
  });

  test("refuses to waive a legacy finding, which has no stable rule", async ({ request }) => {
    await seedLiveChapter();
    // Add a legacy audit entry (the pre-finding format) to the chapter index.
    const index = JSON.parse(await readFile(liveIndexPath(), "utf-8")) as Array<Record<string, unknown>>;
    index[0]!.auditIssues = ["[warning] Manual chapter replacement requires review before continuation."];
    await writeFile(liveIndexPath(), JSON.stringify(index, null, 2), "utf-8");

    const findings = await (await request.get(
      "/api/v1/books/e2e-live-chapter/chapters/1/findings",
    )).json() as { source: string; findings: Array<{ id: string; rule: string }> };
    expect(findings.source).toBe("legacy");
    expect(findings.findings).toHaveLength(1);

    const waive = await request.post(
      `/api/v1/books/e2e-live-chapter/chapters/1/findings/${encodeURIComponent(findings.findings[0]!.id)}/waive`,
      { data: { reason: "想跳过这一条" } },
    );
    // Nothing durable to attach the waiver to, so it must be refused rather than
    // recorded and silently lost later.
    expect(waive.status()).toBe(409);
    expect(await waive.json()).toMatchObject({ error: "not-waivable" });
  });

  test("a commit is refused after an edit until the chapter is re-audited", async ({ page }) => {    await seedLiveChapter();

    // Edit the chapter: this archives a version and marks the audit stale.
    await page.goto("/#/workbench/writing");
    const editor = page.getByRole("textbox", { name: /正文/ });
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await editor.fill(`${LIVE_CHAPTER_EDITED}\n改过之后，审核结论就不再适用于这一版。`);
    await expect(page.locator('.nc-statesync[data-state="clean"]')).toBeVisible({ timeout: 15_000 });

    // The stale audit must be visible, and the commit must not claim "passed".
    await page.goto("/#/workbench/commit");
    await expect(page.locator(".nc-root")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/需重新审核|需作者确认/).first()).toBeVisible({ timeout: 20_000 });

    const confirm = page.getByRole("button", { name: /确认提交/ });
    await expect(confirm).toBeDisabled();

    // Nothing was approved.
    const index = JSON.parse(await readFile(liveIndexPath(), "utf-8")) as Array<{ status: string }>;
    expect(index[0]?.status).not.toBe("approved");
  });
});

