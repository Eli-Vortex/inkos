import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listBookMaterials,
  readBookMaterial,
  saveBookMaterial,
} from "../materials/book-materials.js";

describe("book materials library", () => {
  let bookDir: string;

  beforeEach(async () => {
    bookDir = await mkdtemp(join(tmpdir(), "inkos-materials-"));
  });

  afterEach(async () => {
    await rm(bookDir, { recursive: true, force: true });
  });

  it("returns no facets before anything is created", async () => {
    expect(await listBookMaterials(bookDir)).toEqual([]);
  });

  it("groups saved notes by facet and only shows facets that exist", async () => {
    await saveBookMaterial(bookDir, { facet: "人物", title: "林砚", content: "主角，账房学徒。" });
    await saveBookMaterial(bookDir, { facet: "人物", title: "沈知白", content: "掌柜。" });
    await saveBookMaterial(bookDir, { facet: "制度", title: "盐引制度", content: "官盐凭引销售。" });

    const facets = await listBookMaterials(bookDir);
    const names = facets.map((f) => f.facet).sort();
    expect(names).toEqual(["人物", "制度"]);

    const people = facets.find((f) => f.facet === "人物");
    expect(people?.entries.map((e) => e.title).sort()).toEqual(["林砚", "沈知白"]);
    // 模型没有整理“财政”，分类里就不该出现。
    expect(names).not.toContain("财政");
  });

  it("reads a saved note back by facet and name", async () => {
    await saveBookMaterial(bookDir, { facet: "地图", title: "关隘", content: "北境三关。" });
    const facets = await listBookMaterials(bookDir);
    const entry = facets[0]?.entries[0];
    expect(entry).toBeDefined();

    const content = await readBookMaterial(bookDir, entry!.facet, entry!.name);
    expect(content).toContain("北境三关");
  });

  it("does not escape the materials directory via facet or title", async () => {
    await saveBookMaterial(bookDir, { facet: "../../etc", title: "../evil", content: "x" });
    const facets = await listBookMaterials(bookDir);
    expect(facets).toHaveLength(1);
    expect(facets[0]!.facet).not.toContain("..");
    expect(facets[0]!.entries[0]!.path.startsWith("story/materials/")).toBe(true);
  });
});
