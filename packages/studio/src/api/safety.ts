import { isSafeBookId as isSafeCoreBookId } from "@actalk/inkos-core";

/** Validates bookId for API inputs and filesystem-backed book operations. */
export function isSafeBookId(bookId: unknown): bookId is string {
  return isSafeCoreBookId(bookId);
}

/**
 * Validates a session id before it is joined into a transcript filename.
 *
 * Session ids are used directly as `<sessionId>.jsonl` basenames, so an id with
 * a path separator or `..` escapes `.inkos/sessions/` and lets a request read,
 * append to, or delete arbitrary JSON/JSONL files. The canonical shape is
 * `timestamp-random`; we intentionally stay looser than that so existing ids and
 * test fixtures keep working, but we reject anything that is not a single,
 * traversal-free path segment.
 */
export function isSafeSessionId(sessionId: unknown): sessionId is string {
  if (typeof sessionId !== "string") return false;
  if (sessionId.length === 0 || sessionId.length > 200) return false;
  if (sessionId.trim() !== sessionId) return false;
  if (sessionId.includes("/") || sessionId.includes("\\")) return false;
  if (sessionId.includes("..")) return false;
  if (sessionId.includes("\0")) return false;
  if (sessionId === "." || sessionId === "..") return false;
  return true;
}
