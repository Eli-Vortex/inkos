import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { toPosixPath } from "../utils/posix-path.js";

/**
 * Per-book research library.
 *
 * Materials the model collects during conversation (人物 / 制度 / 地图 / 财务 …)
 * are written under `books/<id>/story/materials/<facet>/`, so the book's page can
 * list exactly the categories that were actually produced — an absent facet has
 * no directory and therefore never appears.
 */
export interface BookMaterialEntry {
  readonly facet: string;
  readonly name: string;
  readonly title: string;
  /** Path relative to the book dir (posix), for display and artifact open. */
  readonly path: string;
  readonly charCount: number;
  readonly updatedAt: string;
  readonly excerpt: string;
}

export interface BookMaterialFacet {
  readonly facet: string;
  readonly entries: ReadonlyArray<BookMaterialEntry>;
}

const MATERIALS_SUBDIR = join("story", "materials");
const EXCERPT_CHARS = 240;

/** Strip anything that could escape the materials directory. */
function sanitizeSegment(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[/\\\0]+/g, " ")
    .replace(/\.{2,}/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 60)
    .trim();
  return cleaned || fallback;
}

export function bookMaterialsDir(bookDir: string): string {
  return join(bookDir, MATERIALS_SUBDIR);
}

export function bookMaterialPath(bookDir: string, facet: string, name: string): string {
  return join(bookMaterialsDir(bookDir), sanitizeSegment(facet, "其他"), `${sanitizeSegment(name, "material")}.md`);
}

function titleFromMarkdown(content: string, fallback: string): string {
  const firstHeading = content.split(/\r?\n/).find((line) => line.trim().startsWith("# "));
  return firstHeading ? firstHeading.replace(/^\s*#\s*/, "").trim() || fallback : fallback;
}

export async function saveBookMaterial(
  bookDir: string,
  input: {
    readonly facet: string;
    readonly title: string;
    readonly content: string;
    readonly now?: Date;
  },
): Promise<BookMaterialEntry> {
  const facet = sanitizeSegment(input.facet, "其他");
  const title = input.title.trim() || "未命名资料";
  const name = sanitizeSegment(input.title, facet);
  const dir = join(bookMaterialsDir(bookDir), facet);
  await mkdir(dir, { recursive: true });
  const body = input.content.trim();
  const markdown = body.startsWith("# ") ? `${body}\n` : `# ${title}\n\n${body}\n`;
  await writeFile(join(dir, `${name}.md`), markdown, "utf-8");
  return {
    facet,
    name,
    title: titleFromMarkdown(markdown, title),
    path: toPosixPath(join(MATERIALS_SUBDIR, facet, `${name}.md`)),
    charCount: markdown.length,
    updatedAt: (input.now ?? new Date()).toISOString(),
    excerpt: markdown.replace(/\s+/g, " ").slice(0, EXCERPT_CHARS),
  };
}

/** List every material, grouped by facet. Facets with no files are absent. */
export async function listBookMaterials(bookDir: string): Promise<ReadonlyArray<BookMaterialFacet>> {
  let facetDirs: string[];
  try {
    facetDirs = await readdir(bookMaterialsDir(bookDir));
  } catch {
    return [];
  }

  const facets: BookMaterialFacet[] = [];
  for (const facet of facetDirs.sort()) {
    let files: string[];
    try {
      files = await readdir(join(bookMaterialsDir(bookDir), facet));
    } catch {
      continue;
    }
    const entries: BookMaterialEntry[] = [];
    for (const file of files.filter((name) => name.endsWith(".md")).sort()) {
      const relative = join(MATERIALS_SUBDIR, facet, file);
      try {
        const content = await readFile(join(bookDir, relative), "utf-8");
        const name = file.slice(0, -3);
        entries.push({
          facet,
          name,
          title: titleFromMarkdown(content, name),
          path: toPosixPath(relative),
          charCount: content.length,
          updatedAt: new Date().toISOString(),
          excerpt: content.replace(/\s+/g, " ").slice(0, EXCERPT_CHARS),
        });
      } catch {
        // Unreadable file: skip rather than fail the whole library.
      }
    }
    if (entries.length > 0) facets.push({ facet, entries });
  }
  return facets;
}

export async function readBookMaterial(
  bookDir: string,
  facet: string,
  name: string,
): Promise<string | null> {
  try {
    return await readFile(bookMaterialPath(bookDir, facet, name), "utf-8");
  } catch {
    return null;
  }
}
