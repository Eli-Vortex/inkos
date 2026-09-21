/**
 * Escape a literal string for safe use inside a `RegExp`.
 *
 * Single-sourced: this exact one-liner was copied into seven modules, so a fix
 * or a missed edge case would have had to be made seven times.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
