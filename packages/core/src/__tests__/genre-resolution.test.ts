import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readGenreProfile, listAvailableGenres } from "../agents/rules-reader.js";

/**
 * A book's `genre` is authored as free text (often Chinese), while the profile
 * files are keyed by ASCII id. Resolution must therefore accept an id, a slug,
 * or the display name, or the imported genre set is unreachable and every book
 * silently degrades to other.md.
 */
describe("genre profile resolution", () => {
  async function emptyProjectRoot(): Promise<string> {
    return mkdtemp(join(tmpdir(), "inkos-genre-"));
  }

  it("resolves an exact profile id", async () => {
    const root = await emptyProjectRoot();
    const parsed = await readGenreProfile(root, "xuanhuan");
    expect(parsed.profile.id).toBe("xuanhuan");
  });

  it("resolves a Chinese display name to its profile", async () => {
    const root = await emptyProjectRoot();
    const parsed = await readGenreProfile(root, "玄幻");
    expect(parsed.profile.id).toBe("xuanhuan");
  });

  it("resolves imported genre names, including ones whose file was renamed", async () => {
    const root = await emptyProjectRoot();
    await expect(readGenreProfile(root, "修仙")).resolves.toMatchObject({
      profile: { id: "xiuxian" },
    });
    await expect(readGenreProfile(root, "规则怪谈")).resolves.toMatchObject({
      profile: { id: "rules-weird" },
    });
    await expect(readGenreProfile(root, "高武")).resolves.toMatchObject({
      profile: { id: "high-martial-arts" },
    });
  });

  it("falls back to the generic profile for an unknown genre", async () => {
    const root = await emptyProjectRoot();
    const parsed = await readGenreProfile(root, "不存在的题材");
    expect(parsed.profile.id).toBe("other");
  });

  it("exposes the imported genre set as addressable ASCII ids", async () => {
    const root = await emptyProjectRoot();
    const genres = await listAvailableGenres(root);
    const ids = genres.map((g) => g.id);
    expect(ids).toContain("xiuxian");
    expect(ids).toContain("rules-weird");
    expect(ids).toContain("war-spy");
    expect(ids.filter((id) => /[^\x00-\x7F]/.test(id))).toEqual([]);
  });
});
