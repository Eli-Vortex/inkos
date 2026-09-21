/**
 * Crash-safe draft recovery.
 *
 * `beforeunload` covers a deliberate tab close, but not a browser crash, a
 * reload during a save, or a power cut. Autosave narrows that window without
 * closing it, so the editor's unsaved text is mirrored locally and offered back
 * on the next visit instead of being silently gone.
 *
 * The mirror is keyed by book + chapter + base revision: a draft written against
 * an older revision must not be replayed over newer text without the author
 * seeing that it is stale, so the key carries the revision it belongs to.
 *
 * Validation is hand-written rather than schema-based because this module runs
 * in the browser bundle, where pulling in a validation library for one small
 * record is not worth the weight.
 */

const DRAFT_SCHEMA_VERSION = 1;
const STORAGE_PREFIX = "inkos.workbench.draft";

export interface DraftRecord {
  readonly schemaVersion: 1;
  readonly bookId: string;
  readonly chapterId: string;
  readonly candidateId: string;
  readonly baseRevision: number;
  readonly body: string;
  readonly savedAt: string;
}

export interface DraftKey {
  readonly bookId: string;
  readonly chapterId: string;
  readonly candidateId: string;
}

function storageKey(key: DraftKey): string {
  return [STORAGE_PREFIX, key.bookId, key.chapterId, key.candidateId].join(":");
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Storage can be unavailable (private mode, disabled cookies).
    return null;
  }
}

function parseDraft(value: unknown): DraftRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== DRAFT_SCHEMA_VERSION) return null;
  if (typeof record.bookId !== "string" || !record.bookId) return null;
  if (typeof record.chapterId !== "string" || !record.chapterId) return null;
  if (typeof record.candidateId !== "string" || !record.candidateId) return null;
  if (typeof record.baseRevision !== "number" || !Number.isInteger(record.baseRevision)) return null;
  if (typeof record.body !== "string") return null;
  if (typeof record.savedAt !== "string") return null;
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    bookId: record.bookId,
    chapterId: record.chapterId,
    candidateId: record.candidateId,
    baseRevision: record.baseRevision,
    body: record.body,
    savedAt: record.savedAt,
  };
}

export function saveDraftMirror(params: {
  readonly key: DraftKey;
  readonly baseRevision: number;
  readonly body: string;
  readonly now?: Date;
}): void {
  const store = storage();
  if (!store) return;
  const record: DraftRecord = {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    bookId: params.key.bookId,
    chapterId: params.key.chapterId,
    candidateId: params.key.candidateId,
    baseRevision: params.baseRevision,
    body: params.body,
    savedAt: (params.now ?? new Date()).toISOString(),
  };
  try {
    store.setItem(storageKey(params.key), JSON.stringify(record));
  } catch {
    // Quota or transient failure: losing the mirror is worse than failing the
    // keystroke, so the editor keeps working either way.
  }
}

export function loadDraftMirror(key: DraftKey): DraftRecord | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(storageKey(key));
    if (!raw) return null;
    return parseDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearDraftMirror(key: DraftKey): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(storageKey(key));
  } catch {
    // Nothing to do: a stale mirror is reported as a recoverable draft, not
    // applied automatically.
  }
}

/**
 * A mirror worth offering back: it differs from the server text and it was
 * written against the revision currently loaded.
 *
 * A mirror from a different revision is deliberately not offered, because
 * replaying it would overwrite prose written since.
 */
export function findRecoverableDraft(params: {
  readonly key: DraftKey;
  readonly baseRevision: number;
  readonly serverBody: string;
}): DraftRecord | null {
  const record = loadDraftMirror(params.key);
  if (!record) return null;
  if (record.baseRevision !== params.baseRevision) return null;
  if (record.body === params.serverBody) return null;
  return record;
}
