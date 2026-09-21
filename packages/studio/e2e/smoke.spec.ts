import { test, expect } from "@playwright/test";

/**
 * Full-route smoke test.
 *
 * The visual redesign touched the whole Studio shell and every page, so this
 * spec walks each addressable route (plus the sidebar-only pages) and asserts
 * the app renders without a runtime error or the Vite error overlay. It is not
 * a behaviour test — the feature specs cover behaviour — it is a crash guard so
 * a restyle that throws at import/render time is caught immediately.
 */

const DEEP_LINK_ROUTES = [
  "#/",
  "#/chat",
  "#/workbench",
  "#/workbench/books",
  "#/workbench/writing",
  "#/workbench/analytics",
  "#/workbench/export",
  "#/book/new",
  "#/services",
  "#/services/nonexistent-service",
  "#/settings",
  "#/translation",
  "#/import",
  "#/import/chapters",
  "#/book/nonexistent-book",
  "#/book/nonexistent-book/settings",
  // Auxiliary pages are addressable so a refresh keeps the author in place.
  "#/doctor",
  "#/genres",
  "#/style",
  "#/radar",
  "#/daemon",
  "#/logs",
  "#/book/nonexistent-book/analytics",
  "#/book/nonexistent-book/truth",
  "#/book/nonexistent-book/chapter/1",
];

test.describe("full-route smoke", () => {
  for (const route of DEEP_LINK_ROUTES) {
    test(`renders without a runtime error: ${route}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.goto(route);
      // The shell (sidebar) and a main region must always mount.
      await expect(page.locator("aside").first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("main").first()).toBeVisible({ timeout: 20_000 });
      // Vite's dev error overlay means a module threw during render.
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      // Give effects a beat to surface async render errors.
      await page.waitForTimeout(600);
      expect(errors, `runtime errors on ${route}:\n${errors.join("\n")}`).toEqual([]);
    });
  }

  test("the shell uses one flat ground, not two tones", async ({ page }) => {
    await page.goto("/#/");
    await expect(page.locator("aside").first()).toBeVisible({ timeout: 20_000 });

    const surfaces = await page.evaluate(() => {
      const bg = (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        return el ? getComputedStyle(el).backgroundColor : null;
      };
      return {
        body: getComputedStyle(document.body).backgroundColor,
        bodyImage: getComputedStyle(document.body).backgroundImage,
        sidebar: bg("aside"),
        header: bg("header"),
      };
    });

    // No gradient anywhere: the ground is a single flat colour.
    expect(surfaces.bodyImage).toBe("none");
    // Chromium serializes an opaque colour as either `rgb(r, g, b)` or
    // `rgba(r, g, b, 1)` depending on how it was authored, so normalize before
    // comparing — the assertion is about the tone, not the serialization.
    const normalize = (value: string) =>
      value.replace(/^rgba\(([^)]+),\s*1\)$/, "rgb($1)");
    const tones = [surfaces.body, surfaces.sidebar, surfaces.header]
      .filter((v): v is string => v !== null)
      .map(normalize);
    expect(tones.length).toBeGreaterThan(0);
    for (const tone of tones) {
      expect(tone).toBe(tones[0]);
    }
  });

  test("sidebar-only pages mount without a runtime error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("#/");
    const nav = page.locator('[data-testid="novel-creation-section"]');
    await expect(nav).toBeVisible({ timeout: 20_000 });

    const entries = ["研究中心", "任务中心"];
    for (const name of entries) {
      await nav.getByRole("button", { name, exact: true }).click();
      await page.waitForTimeout(400);
    }
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors, `runtime errors:\n${errors.join("\n")}`).toEqual([]);
  });
});
