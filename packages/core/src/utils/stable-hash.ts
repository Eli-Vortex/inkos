/**
 * Deterministic, dependency-free hashing.
 *
 * Used for finding ids, waiver bases and chapter content digests. It is NOT a
 * security primitive — it exists so that "is this the same text as before?" and
 * "is this the same finding?" can be answered reproducibly across processes and
 * platforms without pulling in a crypto dependency.
 *
 * FNV-1a, 32-bit, rendered as 8 hex chars.
 */
export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Hash of chapter prose, normalised so trailing whitespace does not count as a change. */
export function contentHash(text: string): string {
  return stableHash(text.replace(/\s+$/, ""));
}
