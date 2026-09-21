import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stableHash } from "../utils/stable-hash.js";

export type ChapterVersionSource =
  | "manual"
  | "agent"
  | "revision"
  | "regeneration"
  | "restore";

export interface ChapterVersion {
  readonly id: string;
  readonly chapterNumber: number;
  readonly source: ChapterVersionSource;
  readonly createdAt: string;
  readonly characterCount: number;
}

const VERSION_ID_PATTERN = /^(\d{13})_(manual|agent|revision|regeneration|restore)_([0-9a-f-]{36})$/;

export async function readChapterUserBrief(
  bookDir: string,
  chapterNumber: number,
): Promise<string> {
  try {
    return (await readFile(userBriefPath(bookDir, chapterNumber), "utf-8")).trim();
  } catch (error) {
    if (isMissingFile(error)) return "";
    throw error;
  }
}

export async function saveChapterUserBrief(
  bookDir: string,
  chapterNumber: number,
  brief: string,
): Promise<void> {
  const path = userBriefPath(bookDir, chapterNumber);
  const normalized = brief.trim();
  if (!normalized) {
    await rm(path, { force: true });
    return;
  }
  await mkdir(join(bookDir, "story", "runtime"), { recursive: true });
  await writeFile(path, `${normalized}\n`, "utf-8");
}

export async function readChapterPlanDocument(
  bookDir: string,
  chapterNumber: number,
): Promise<string | null> {
  try {
    return await readFile(planPath(bookDir, chapterNumber), "utf-8");
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

/**
 * How many versions of one chapter to keep.
 *
 * Autosave archives the previous text on every save, so without a cap a single
 * writing session produces dozens of full-text copies per chapter and the
 * history list becomes unusable. Kept generous enough that "go back a few
 * drafts" still works, and pruned oldest-first so the most recent deliberation
 * survives.
 */
export const CHAPTER_VERSION_RETENTION = 20;

/**
 * Delete the oldest archived versions beyond the retention limit.
 *
 * Only `manual`, `agent` and `regeneration` versions are eligible; `restore`
 * entries are kept because they mark a deliberate author decision to bring back
 * an earlier draft, and losing those would erase the reason the current text is
 * what it is.
 */
export async function pruneChapterVersions(
  bookDir: string,
  chapterNumber: number,
  keep: number = CHAPTER_VERSION_RETENTION,
): Promise<ReadonlyArray<string>> {
  assertChapterNumber(chapterNumber);
  // Metadata only: the version id encodes both the timestamp and the source, so
  // pruning never has to read the archived text. This runs on every save, and
  // reading every archived chapter there would undo the point of the cap.
  const versions = await listVersionMetadata(bookDir, chapterNumber);
  if (versions.length <= keep) return [];

  const protectedIds = new Set(
    versions.filter((version) => version.source === "restore").map((version) => version.id),
  );
  // When the protected entries already meet (or exceed) the budget, pruning the
  // rest would delete the entire ordinary history to satisfy a number. Keeping
  // the restore points and skipping the prune is the safer reading of "keep":
  // the cap is a target, not a licence to empty the history.
  if (protectedIds.size >= keep) return [];

  const prunable = versions
    .filter((version) => !protectedIds.has(version.id))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const removable = prunable.slice(keep - protectedIds.size);
  const removed: string[] = [];
  for (const version of removable) {
    try {
      await rm(join(versionsDir(bookDir, chapterNumber), `${version.id}.md`), { force: true });
      removed.push(version.id);
    } catch {
      // A version that cannot be removed is not worth failing the save over.
    }
  }
  return removed;
}

/**
 * Version metadata without reading any archived text.
 *
 * The id is `${timestamp}_${source}_${uuid}`, so timestamp and source are already
 * available from the directory listing. Callers that need a character count must
 * use `listChapterVersions`, which reads the files.
 */
async function listVersionMetadata(
  bookDir: string,
  chapterNumber: number,
): Promise<ReadonlyArray<ChapterVersion>> {
  let files: string[];
  try {
    files = await readdir(versionsDir(bookDir, chapterNumber));
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }

  return files.flatMap((file) => {
    if (!file.endsWith(".md")) return [];
    const id = file.slice(0, -3);
    const parsed = parseVersionId(id);
    if (!parsed) return [];
    return [{
      id,
      chapterNumber,
      source: parsed.source,
      createdAt: new Date(parsed.timestamp).toISOString(),
      characterCount: 0,
    }];
  });
}

export async function archiveChapterVersion(
  bookDir: string,
  chapterNumber: number,
  content: string,
  source: ChapterVersionSource,
  now = new Date(),
): Promise<ChapterVersion> {
  assertChapterNumber(chapterNumber);
  const id = `${now.getTime()}_${source}_${randomUUID()}`;
  const dir = versionsDir(bookDir, chapterNumber);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}.md`), content, "utf-8");
  // Archiving means the prose is about to change, so the revision advances. The
  // counter is stored separately from the archive directory (see
  // `readChapterRevision`) so pruning old versions can no longer freeze it.
  await bumpStoredRevision(bookDir, chapterNumber);
  return {
    id,
    chapterNumber,
    source,
    createdAt: now.toISOString(),
    characterCount: content.length,
  };
}

/**
 * Count archived versions without reading them.
 *
 * `listChapterVersions` reads every file to report its size, which is fine for a
 * history view but wasteful on the save path — and the save path only needs the
 * count to compute the next revision. This is a single directory read.
 */
export async function countChapterVersions(
  bookDir: string,
  chapterNumber: number,
): Promise<number> {
  assertChapterNumber(chapterNumber);
  try {
    const files = await readdir(versionsDir(bookDir, chapterNumber));
    return files.filter((file) => file.endsWith(".md") && parseVersionId(file.slice(0, -3))).length;
  } catch (error) {
    if (isMissingFile(error)) return 0;
    throw error;
  }
}

export async function listChapterVersions(
  bookDir: string,
  chapterNumber: number,
): Promise<ReadonlyArray<ChapterVersion>> {
  assertChapterNumber(chapterNumber);
  let files: string[];
  try {
    files = await readdir(versionsDir(bookDir, chapterNumber));
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }

  const versions = await Promise.all(files.flatMap((file) => {
    if (!file.endsWith(".md")) return [];
    const id = file.slice(0, -3);
    const parsed = parseVersionId(id);
    if (!parsed) return [];
    return [readFile(join(versionsDir(bookDir, chapterNumber), file), "utf-8").then((content) => ({
      id,
      chapterNumber,
      source: parsed.source,
      createdAt: new Date(parsed.timestamp).toISOString(),
      characterCount: content.length,
    }))];
  }));

  return versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readChapterVersion(
  bookDir: string,
  chapterNumber: number,
  versionId: string,
): Promise<string> {
  assertChapterNumber(chapterNumber);
  if (!parseVersionId(versionId)) {
    throw new Error(`Invalid chapter version id: ${versionId}`);
  }
  return readFile(join(versionsDir(bookDir, chapterNumber), `${versionId}.md`), "utf-8");
}

/**
 * Locate a chapter's prose file.
 *
 * This is the single locator for chapter files. Reads and writes must agree on
 * which file a chapter is, or a chapter can be readable but unwritable — which
 * is exactly the class of bug that comes from each call site matching the name
 * its own way. The underscore form is what the writer produces; the hyphen form
 * is accepted so hand-authored or imported chapters are still found.
 */
export async function findChapterFile(
  bookDir: string,
  chapterNumber: number,
): Promise<string | null> {
  assertChapterNumber(chapterNumber);
  let files: string[];
  try {
    files = await readdir(join(bookDir, "chapters"));
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
  return selectChapterFile(files, chapterNumber);
}

/**
 * Pick a chapter's file from an already-read directory listing.
 *
 * Exported so callers that already have the listing (eval, composer) apply the
 * exact same rule as {@link findChapterFile} instead of re-implementing a weaker
 * `startsWith` match — which accepted `10000_x.md` for chapter 1000 and missed
 * the hyphen form that hand-authored chapters use.
 */
export function selectChapterFile(
  files: readonly string[],
  chapterNumber: number,
): string | null {
  const padded = padChapter(chapterNumber);
  const candidates = files.filter(
    (file) => (file.startsWith(`${padded}_`) || file.startsWith(`${padded}-`)) && file.endsWith(".md"),
  );
  if (candidates.length === 0) return null;
  // Prefer the canonical underscore form when both exist.
  const canonical = candidates.find((file) => file.startsWith(`${padded}_`));
  return canonical ?? candidates[0]!;
}

/**
 * Parse the chapter number from a chapter filename, or null.
 *
 * Requires a real separator after the digits, so `10000_x.md` is 10000, not a
 * corrupt 4-character slice. Single matcher shared by the index rebuild, the
 * persisted-count check and the composer.
 */
export function parseChapterFileNumber(file: string): number | null {
  const match = file.match(/^(\d+)[_-].*\.md$/);
  if (!match) return null;
  const value = Number.parseInt(match[1]!, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Map chapter number → filename from a directory listing (first match wins).
 *
 * Canonical so export and the agent runtime tools cannot drift; the previous
 * copies used a 4-character slice, misreading `10000_x.md` as chapter 1000.
 */
export function buildChapterFileLookup(files: ReadonlyArray<string>): ReadonlyMap<number, string> {
  const lookup = new Map<number, string>();
  for (const file of files) {
    const number = parseChapterFileNumber(file);
    if (number === null) continue;
    if (!lookup.has(number)) lookup.set(number, file);
  }
  return lookup;
}

export async function readChapterContent(
  bookDir: string,
  chapterNumber: number,
): Promise<string | null> {
  const file = await findChapterFile(bookDir, chapterNumber);
  if (!file) return null;
  return readFile(join(bookDir, "chapters", file), "utf-8");
}

export interface ChapterRevisionInfo {
  /**
   * Monotonic revision.
   *
   * Persisted independently of the archived-version files, so pruning history
   * (retention cap) can never make it stall or go backwards. Older books with no
   * counter yet fall back to `archived-version count + 1`, which is exactly what
   * the counter was seeded from.
   */
  readonly revision: number;
  /** Digest of the current prose, so a caller can detect a same-revision rewrite. */
  readonly contentHash: string;
}

/**
 * Read the current revision of a chapter.
 *
 * Callers must read this *inside* the book lock before writing, otherwise two
 * writers can both observe the same revision and the second silently overwrites
 * the first. A client-side pre-check is not a lock.
 */
export async function readChapterRevision(
  bookDir: string,
  chapterNumber: number,
): Promise<ChapterRevisionInfo | null> {
  const content = await readChapterContent(bookDir, chapterNumber);
  if (content === null) return null;
  // A count, not a full listing: the save path runs this inside the book lock on
  // every write, and reading every archived file there would add N disk reads per
  // keystroke-batch save.
  const stored = await readStoredRevision(bookDir, chapterNumber);
  const revision = stored ?? (await countChapterVersions(bookDir, chapterNumber)) + 1;
  return {
    revision,
    contentHash: contentHashOf(content),
  };
}

/**
 * Directory holding the persisted per-chapter revision counters.
 *
 * Kept under a dot-directory so it is never mistaken for chapter prose and is
 * excluded from the "rebuild index from files" scan.
 */
function revisionsDir(bookDir: string): string {
  return join(bookDir, "chapters", ".revisions");
}

function revisionCounterPath(bookDir: string, chapterNumber: number): string {
  return join(revisionsDir(bookDir), padChapter(chapterNumber));
}

async function readStoredRevision(
  bookDir: string,
  chapterNumber: number,
): Promise<number | null> {
  let raw: string;
  try {
    raw = await readFile(revisionCounterPath(bookDir, chapterNumber), "utf-8");
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) && value >= 1 ? value : null;
}

async function writeStoredRevision(
  bookDir: string,
  chapterNumber: number,
  revision: number,
): Promise<void> {
  await mkdir(revisionsDir(bookDir), { recursive: true });
  await writeFile(revisionCounterPath(bookDir, chapterNumber), `${revision}\n`, "utf-8");
}

/**
 * Advance a chapter's persisted revision counter.
 *
 * Seeded from the archived-version count when absent so an existing book (whose
 * revision used to be derived purely from that count) does not jump on the first
 * save after upgrade.
 */
async function bumpStoredRevision(
  bookDir: string,
  chapterNumber: number,
): Promise<number> {
  const stored = await readStoredRevision(bookDir, chapterNumber);
  // The count already includes the archive just written, which is the same base
  // the legacy `versionCount + 1` formula used.
  const base = stored ?? (await countChapterVersions(bookDir, chapterNumber));
  const next = base + 1;
  await writeStoredRevision(bookDir, chapterNumber, next);
  return next;
}

function contentHashOf(text: string): string {
  return stableHash(text.replace(/\s+$/, ""));
}

function userBriefPath(bookDir: string, chapterNumber: number): string {
  assertChapterNumber(chapterNumber);
  return join(bookDir, "story", "runtime", `chapter-${padChapter(chapterNumber)}.user-brief.md`);
}

function planPath(bookDir: string, chapterNumber: number): string {
  assertChapterNumber(chapterNumber);
  return join(bookDir, "story", "runtime", `chapter-${padChapter(chapterNumber)}.plan.md`);
}

function versionsDir(bookDir: string, chapterNumber: number): string {
  return join(bookDir, "chapters", ".versions", padChapter(chapterNumber));
}

export function padChapter(chapterNumber: number): string {
  return String(chapterNumber).padStart(4, "0");
}

function assertChapterNumber(chapterNumber: number): void {
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw new Error(`Invalid chapter number: ${chapterNumber}`);
  }
}

function parseVersionId(
  versionId: string,
): { readonly timestamp: number; readonly source: ChapterVersionSource } | null {
  const match = versionId.match(VERSION_ID_PATTERN);
  if (!match) return null;
  const timestamp = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(timestamp)) return null;
  return {
    timestamp,
    source: match[2] as ChapterVersionSource,
  };
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
