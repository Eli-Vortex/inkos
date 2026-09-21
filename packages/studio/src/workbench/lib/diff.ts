/**
 * Paragraph-level diff used by 版本比较.
 *
 * Pure and dependency-free on purpose: the comparison is a reading aid, so the
 * algorithm is small enough to test directly (see lib/diff.test.ts) instead of
 * being verified through the rendered view.
 */

export type DiffKind = "same" | "del" | "add";

export interface DiffLine {
  readonly kind: DiffKind;
  readonly text: string;
  readonly leftNo: number | null;
  readonly rightNo: number | null;
}

/**
 * Longest-common-subsequence diff over non-empty paragraphs.
 * Deletions win ties, so a rewritten paragraph reads as "old line removed,
 * new line added" rather than as an unexplained replacement.
 */
export function diffParagraphs(leftText: string, rightText: string): DiffLine[] {
  const left = leftText.split(/\n+/).filter(Boolean);
  const right = rightText.split(/\n+/).filter(Boolean);
  const rows = left.length;
  const cols = right.length;

  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (left[i] === right[j]) {
      out.push({ kind: "same", text: left[i], leftNo: i + 1, rightNo: j + 1 });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ kind: "del", text: left[i], leftNo: i + 1, rightNo: null });
      i += 1;
    } else {
      out.push({ kind: "add", text: right[j], leftNo: null, rightNo: j + 1 });
      j += 1;
    }
  }
  while (i < rows) {
    out.push({ kind: "del", text: left[i], leftNo: i + 1, rightNo: null });
    i += 1;
  }
  while (j < cols) {
    out.push({ kind: "add", text: right[j], leftNo: null, rightNo: j + 1 });
    j += 1;
  }
  return out;
}

export function diffStats(lines: readonly DiffLine[]) {
  return {
    total: lines.length,
    added: lines.filter((line) => line.kind === "add").length,
    removed: lines.filter((line) => line.kind === "del").length,
    unchanged: lines.filter((line) => line.kind === "same").length,
  };
}
