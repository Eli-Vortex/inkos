/**
 * Minimal HTML text escaping for EPUB/text exports.
 *
 * Shared so the export and translation writers cannot drift in which characters
 * they escape.
 */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
