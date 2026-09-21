import type { GenreProfile } from "../models/genre-profile.js";
import type { LengthCountingMode } from "../models/length-governance.js";
import type { WriteChapterOutput } from "./writer.js";
import { countChapterLength } from "../utils/length-metrics.js";

export interface CreativeOutput {
  readonly title: string;
  readonly content: string;
  readonly wordCount: number;
  readonly preWriteCheck: string;
}

export function cleanChapterTitle(
  rawTitle: string,
  chapterNumber?: number,
  countingMode: LengthCountingMode = "zh_chars",
): string {
  let t = (rawTitle ?? "").trim();
  // Remove markdown headers # ...
  t = t.replace(/^#+\s*/, "");
  // Remove leading/trailing quotes, brackets, guillemets
  t = t.replace(/^[“"《【\[「『]+|[”"》】\]」』]+$/g, "");
  // Remove duplicate chapter prefixes like "第2章", "第2章：", "第2章 ", "Chapter 2:", "第2回"
  t = t.replace(/^(?:第\s*\d+\s*[章节回卷篇]|Chapter\s*\d+)[:：、\s-]*/i, "");
  // Remove Chinese numeral chapter prefixes like "第二章："
  t = t.replace(/^(?:第\s*[一二三四五六七八九十百千]+\s*[章节回卷篇])[:：、\s-]*/, "");
  // Strip leading punctuation
  t = t.replace(/^[:：、\s-]+/, "").trim();
  return t || defaultChapterTitle(chapterNumber ?? 1, countingMode);
}

export function cleanChapterProse(rawContent: string, title?: string, chapterNumber?: number): string {
  let prose = (rawContent ?? "").trim();

  // 1. Strip any markdown table at the start (such as PRE_WRITE_CHECK table | 检查项 | 本章记录 | 备注 |)
  if (/^\s*\|[^\n]+\|\s*\n\s*\|[-:|\s]+\|\s*\n/.test(prose)) {
    const lines = prose.split("\n");
    let inTable = true;
    let proseStart = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (inTable) {
        if (line.startsWith("|") || line.startsWith("（必须输出") || line.startsWith("===") || line === "") {
          continue;
        } else {
          inTable = false;
          proseStart = i;
          break;
        }
      }
    }
    if (!inTable) {
      prose = lines.slice(proseStart).join("\n").trim();
    }
  }

  // 2. Strip any leftover tag markers or pre-write instructions
  prose = prose.replace(/^===\s*[A-Z_]+\s*===\s*$/gm, "");
  prose = prose.replace(/^[（(]必须输出Markdown表格[^\n]*[）)]\s*$/gm, "");

  // 3. Strip any leading `# 第N章 ...` heading from the start of the prose
  // because writer.saveChapter prepends the canonical chapter heading
  prose = prose.replace(/^#\s*(?:第\s*\d+\s*[章节回卷篇]|Chapter\s*\d+)[^\n]*\n+/im, "").trim();

  // 4. Strip duplicate standalone title at the very start if it matches the chapter title
  if (title) {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length >= 2) {
      const escaped = trimmedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const titleRegex = new RegExp(`^#*\\s*${escaped}\\s*\\n+`, "i");
      prose = prose.replace(titleRegex, "").trim();
    }
  }

  return prose;
}

export function parseCreativeOutput(
  chapterNumber: number,
  content: string,
  countingMode: LengthCountingMode = "zh_chars",
): CreativeOutput {
  const extract = (tag: string): string => {
    const regex = new RegExp(
      `=== ${tag} ===\\s*([\\s\\S]*?)(?==== [A-Z_]+ ===|$)`,
    );
    const match = content.match(regex);
    return match?.[1]?.trim() ?? "";
  };

  let chapterContent = extract("CHAPTER_CONTENT");

  // Fallback: if === TAG === parsing fails (common with local/small models),
  // try to extract usable content from the raw output
  if (!chapterContent) {
    chapterContent = fallbackExtractContent(content, countingMode);
  }

  let title = extract("CHAPTER_TITLE");
  if (!title) {
    title = fallbackExtractTitle(content, chapterNumber, countingMode);
  }

  const cleanedTitle = cleanChapterTitle(title, chapterNumber, countingMode);
  const cleanedContent = cleanChapterProse(chapterContent, cleanedTitle, chapterNumber);

  return {
    title: cleanedTitle,
    content: cleanedContent,
    wordCount: countChapterLength(cleanedContent, countingMode),
    preWriteCheck: extract("PRE_WRITE_CHECK"),
  };
}

/**
 * Fallback content extraction when === CHAPTER_CONTENT === tag is missing.
 * Tries common patterns from local/small models, then falls back to
 * stripping metadata and returning the longest prose block.
 */
function fallbackExtractContent(raw: string, countingMode: LengthCountingMode): string {
  // Try markdown heading: # 第N章 ... followed by content
  const headingMatch = raw.match(/^#\s*第\d+章[^\n]*\n+([\s\S]+)/m);
  if (headingMatch) {
    return headingMatch[1]!.trim();
  }

  if (countingMode === "en_words") {
    const englishHeadingMatch = raw.match(/^#\s*Chapter\s+\d+(?::|\s+)([^\n]*)\n+([\s\S]+)/im);
    if (englishHeadingMatch) {
      return englishHeadingMatch[2]!.trim();
    }
  }

  // Try "正文" or "内容" labeled section
  const labelMatch = raw.match(/(?:正文|内容|章节内容)[：:]\s*\n+([\s\S]+)/);
  if (labelMatch) {
    return labelMatch[1]!.trim();
  }

  if (countingMode === "en_words") {
    const englishLabelMatch = raw.match(/(?:content|chapter content)[：:]\s*\n+([\s\S]+)/i);
    if (englishLabelMatch) {
      return englishLabelMatch[1]!.trim();
    }
  }

  // Last resort: strip lines that look like metadata/tags, keep the rest
  const lines = raw.split("\n");
  const proseLines = lines.filter((line) => {
    const trimmed = line.trim();
    // Skip tag-like lines, empty lines at boundaries, and short key-value lines
    if (/^===\s*[A-Z_]+\s*===/.test(trimmed)) return false;
    if (/^(PRE_WRITE_CHECK|CHAPTER_TITLE|章节标题|写作自检)[：:]/.test(trimmed)) return false;
    return true;
  });
  const result = proseLines.join("\n").trim();
  // Only use fallback if we got meaningful content (>100 chars)
  return result.length > 100 ? result : "";
}

/**
 * Fallback title extraction when === CHAPTER_TITLE === tag is missing.
 */
function fallbackExtractTitle(
  raw: string,
  chapterNumber: number,
  countingMode: LengthCountingMode,
): string {
  // Try: # 第N章 Title
  const headingMatch = raw.match(/^#\s*第\d+章\s*(.+)/m);
  if (headingMatch) {
    return headingMatch[1]!.trim();
  }
  if (countingMode === "en_words") {
    const englishHeadingMatch = raw.match(/^#\s*Chapter\s+\d+(?::|\s+)\s*(.+)/im);
    if (englishHeadingMatch) {
      return englishHeadingMatch[1]!.trim();
    }
  }
  // Try: 章节标题：Title or CHAPTER_TITLE: Title (without === delimiters)
  const labelMatch = raw.match(/(?:章节标题|CHAPTER_TITLE)[：:]\s*(.+)/);
  if (labelMatch) {
    return labelMatch[1]!.trim();
  }
  return defaultChapterTitle(chapterNumber, countingMode);
}

export type ParsedWriterOutput = Omit<WriteChapterOutput, "postWriteErrors" | "postWriteWarnings">;

/**
 * Parse LLM output that uses === TAG === delimiters into structured chapter data.
 * Shared by WriterAgent (writing new chapters) and ChapterAnalyzerAgent (analyzing existing chapters).
 */
export function parseWriterOutput(
  chapterNumber: number,
  content: string,
  genreProfile: GenreProfile,
  countingMode: LengthCountingMode = "zh_chars",
): ParsedWriterOutput {
  const extract = (tag: string): string => {
    const regex = new RegExp(
      `=== ${tag} ===\\s*([\\s\\S]*?)(?==== [A-Z_]+ ===|$)`,
    );
    const match = content.match(regex);
    return match?.[1]?.trim() ?? "";
  };

  const rawTitle = extract("CHAPTER_TITLE") || defaultChapterTitle(chapterNumber, countingMode);
  const title = cleanChapterTitle(rawTitle, chapterNumber, countingMode);
  const chapterContent = cleanChapterProse(extract("CHAPTER_CONTENT"), title, chapterNumber);

  return {
    chapterNumber,
    title,
    content: chapterContent,
    wordCount: countChapterLength(chapterContent, countingMode),
    preWriteCheck: extract("PRE_WRITE_CHECK"),
    postSettlement: extract("POST_SETTLEMENT"),
    updatedState: extract("UPDATED_STATE") || defaultStatePlaceholder(countingMode),
    updatedLedger: genreProfile.numericalSystem
      ? (extract("UPDATED_LEDGER") || defaultLedgerPlaceholder(countingMode))
      : "",
    updatedHooks: extract("UPDATED_HOOKS") || defaultHooksPlaceholder(countingMode),
    chapterSummary: extract("CHAPTER_SUMMARY"),
    updatedSubplots: extract("UPDATED_SUBPLOTS"),
    updatedEmotionalArcs: extract("UPDATED_EMOTIONAL_ARCS"),
    updatedCharacterMatrix: extract("UPDATED_CHARACTER_MATRIX"),
  };
}

function defaultChapterTitle(
  chapterNumber: number,
  countingMode: LengthCountingMode,
): string {
  return countingMode === "en_words" ? `Chapter ${chapterNumber}` : `第${chapterNumber}章`;
}

function defaultStatePlaceholder(countingMode: LengthCountingMode): string {
  return countingMode === "en_words" ? "(state card not updated)" : "(状态卡未更新)";
}

function defaultLedgerPlaceholder(countingMode: LengthCountingMode): string {
  return countingMode === "en_words" ? "(ledger not updated)" : "(账本未更新)";
}

function defaultHooksPlaceholder(countingMode: LengthCountingMode): string {
  return countingMode === "en_words" ? "(hooks pool not updated)" : "(伏笔池未更新)";
}
