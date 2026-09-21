import { Command } from "commander";
import {
  StateManager,
  commitChapter,
  formatLengthCount,
  readChapterFindings,
  readGenreProfile,
  resolveLengthCountingMode,
} from "@actalk/inkos-core";
import { findProjectRoot, resolveBookId, log, logError } from "../utils.js";

export const reviewCommand = new Command("review")
  .description("Review and approve chapters");

reviewCommand
  .command("list")
  .description("List chapters pending review")
  .argument("[book-id]", "Book ID (optional, lists all books if omitted)")
  .option("--json", "Output JSON")
  .action(async (bookId: string | undefined, opts) => {
    try {
      const root = findProjectRoot();
      const state = new StateManager(root);

      const bookIds = bookId ? [bookId] : await state.listBooks();
      const allPending: Array<{
        readonly bookId: string;
        readonly title: string;
        readonly chapter: number;
        readonly chapterTitle: string;
        readonly wordCount: number;
        readonly status: string;
        readonly issues: ReadonlyArray<string>;
      }> = [];

      for (const id of bookIds) {
        const index = await state.loadChapterIndex(id);
        const pending = index.filter(
          (ch) =>
            ch.status === "ready-for-review" || ch.status === "audit-failed",
        );

        if (pending.length === 0) continue;

        const book = await state.loadBookConfig(id);
        const { profile: genreProfile } = await readGenreProfile(root, book.genre);
        const countingMode = resolveLengthCountingMode(book.language ?? genreProfile.language);

        if (!opts.json) {
          log(`\n${book.title} (${id}):`);
        }
        for (const ch of pending) {
          allPending.push({
            bookId: id,
            title: book.title,
            chapter: ch.number,
            chapterTitle: ch.title,
            wordCount: ch.wordCount,
            status: ch.status,
            issues: ch.auditIssues,
          });
          if (!opts.json) {
            log(
              `  Ch.${ch.number} "${ch.title}" | ${formatLengthCount(ch.wordCount, countingMode)} | ${ch.status}`,
            );
            if (ch.auditIssues.length > 0) {
              for (const issue of ch.auditIssues) {
                log(`    - ${issue}`);
              }
            }
          }
        }
      }

      if (opts.json) {
        log(JSON.stringify({ pending: allPending }, null, 2));
      } else if (allPending.length === 0) {
        log("No chapters pending review.");
      }
    } catch (e) {
      if (opts.json) {
        log(JSON.stringify({ error: String(e) }));
      } else {
        logError(`Failed to list reviews: ${e}`);
      }
      process.exit(1);
    }
  });

/**
 * Parse "[book-id] <chapter>" style arguments from variadic args.
 * Supports: "3" (auto-detect book) or "my-book 3"
 */
function parseBookAndChapter(
  args: ReadonlyArray<string>,
): { readonly bookIdArg: string | undefined; readonly chapterNum: number } {
  if (args.length === 1) {
    const num = parseInt(args[0]!, 10);
    if (isNaN(num)) {
      throw new Error(`Expected chapter number, got "${args[0]}"`);
    }
    return { bookIdArg: undefined, chapterNum: num };
  }
  if (args.length === 2) {
    const num = parseInt(args[1]!, 10);
    if (isNaN(num)) {
      throw new Error(`Expected chapter number as second argument, got "${args[1]}"`);
    }
    return { bookIdArg: args[0], chapterNum: num };
  }
  throw new Error("Usage: inkos review approve [book-id] <chapter>");
}

interface CommitOneResult {
  readonly ok: boolean;
  readonly code: string;
  readonly message: string;
}

/**
 * Commit one chapter through the same transactional gate the Studio uses.
 *
 * This replaced a raw `status: "approved"` index write. That bypassed every
 * review guarantee: no findings check, no stale-audit check, no lock and no
 * receipt — `review approve` could bless never-audited or audit-stale prose.
 */
async function commitOneChapter(
  state: StateManager,
  bookId: string,
  chapterNum: number,
): Promise<CommitOneResult> {
  const releaseLock = await state.acquireBookLock(bookId);
  try {
    const bookDir = state.bookDir(bookId);
    const index = await state.loadChapterIndex(bookId);
    const meta = index.find((chapter) => chapter.number === chapterNum);
    if (!meta) {
      return { ok: false, code: "CHAPTER_NOT_FOUND", message: `Chapter ${chapterNum} not found in "${bookId}".` };
    }
    const { findings } = await readChapterFindings({
      bookDir,
      chapterNumber: chapterNum,
      legacyAuditIssues: meta.auditIssues ?? [],
    });
    const result = await commitChapter(
      {
        bookDir: (id) => state.bookDir(id),
        loadChapterIndex: (id) => state.loadChapterIndex(id),
        saveChapterIndex: (id, next) => state.saveChapterIndex(id, next),
      },
      { bookId, chapterNumber: chapterNum, findings },
    );
    if (result.ok) {
      return { ok: true, code: "OK", message: `Chapter ${chapterNum} approved (state committed).` };
    }
    return { ok: false, code: result.code, message: result.message };
  } finally {
    await releaseLock();
  }
}

reviewCommand
  .command("approve")
  .description("Approve a chapter and commit its state: approve [book-id] <chapter>")
  .argument("<args...>", "Book ID (optional) and chapter number")
  .option("--json", "Output JSON")
  .action(async (args: ReadonlyArray<string>, opts) => {
    try {
      const root = findProjectRoot();
      const { bookIdArg, chapterNum } = parseBookAndChapter(args);
      const bookId = await resolveBookId(bookIdArg, root);
      const state = new StateManager(root);

      const result = await commitOneChapter(state, bookId, chapterNum);
      if (!result.ok) {
        if (opts.json) {
          log(JSON.stringify({ bookId, chapter: chapterNum, status: "rejected", code: result.code, error: result.message }));
        } else {
          logError(result.message);
        }
        process.exit(1);
      }

      if (opts.json) {
        log(JSON.stringify({ bookId, chapter: chapterNum, status: "approved" }));
      } else {
        log(result.message);
      }
    } catch (e) {
      if (opts.json) {
        log(JSON.stringify({ error: String(e) }));
      } else {
        logError(`Failed to approve: ${e}`);
      }
      process.exit(1);
    }
  });

reviewCommand
  .command("approve-all")
  .description("Approve all pending chapters for a book")
  .argument("[book-id]", "Book ID (auto-detected if only one book)")
  .option("--json", "Output JSON")
  .action(async (bookIdArg: string | undefined, opts) => {
    try {
      const root = findProjectRoot();
      const bookId = await resolveBookId(bookIdArg, root);
      const state = new StateManager(root);

      const index = await state.loadChapterIndex(bookId);
      // Only chapters that actually passed review are candidates; each still goes
      // through the commit gate, which may reject it (stale audit, blockers).
      const pending = index
        .filter((ch) => ch.status === "ready-for-review")
        .map((ch) => ch.number);

      const approved: number[] = [];
      const failed: Array<{ chapter: number; code: string; message: string }> = [];
      for (const chapterNumber of pending) {
        const result = await commitOneChapter(state, bookId, chapterNumber);
        if (result.ok) approved.push(chapterNumber);
        else failed.push({ chapter: chapterNumber, code: result.code, message: result.message });
      }

      if (opts.json) {
        log(JSON.stringify({ bookId, approvedCount: approved.length, approved, failed }, null, 2));
      } else {
        log(`${approved.length} chapter(s) approved.`);
        for (const item of failed) {
          logError(`  Ch.${item.chapter} not approved (${item.code}): ${item.message}`);
        }
      }
      if (failed.length > 0) {
        process.exit(1);
      }
    } catch (e) {
      if (opts.json) {
        log(JSON.stringify({ error: String(e) }));
      } else {
        logError(`Failed to approve: ${e}`);
      }
      process.exit(1);
    }
  });

reviewCommand
  .command("reject")
  .description("Reject a chapter and roll back state: reject [book-id] <chapter>")
  .argument("<args...>", "Book ID (optional) and chapter number")
  .option("--reason <reason>", "Rejection reason")
  .option("--keep-subsequent", "Only reject this chapter, do not discard subsequent chapters")
  .option("--json", "Output JSON")
  .action(async (args: ReadonlyArray<string>, opts) => {
    try {
      const root = findProjectRoot();
      const { bookIdArg, chapterNum } = parseBookAndChapter(args);
      const bookId = await resolveBookId(bookIdArg, root);

      const state = new StateManager(root);

      // The index read-modify-write and the rollback both mutate canonical state;
      // hold the book lock so a concurrent writer cannot clobber either.
      const releaseLock = await state.acquireBookLock(bookId);
      let discarded: ReadonlyArray<number> = [];
      try {
        const index = await state.loadChapterIndex(bookId);
        const idx = index.findIndex((ch) => ch.number === chapterNum);
        if (idx === -1) {
          throw new Error(`Chapter ${chapterNum} not found in "${bookId}"`);
        }

        if (opts.keepSubsequent) {
          // Legacy behavior: only mark as rejected, no state rollback
          const updated = [...index];
          updated[idx] = {
            ...updated[idx]!,
            status: "rejected",
            reviewNote: opts.reason ?? "Rejected without reason",
            updatedAt: new Date().toISOString(),
          };
          await state.saveChapterIndex(bookId, updated);

          if (opts.json) {
            log(JSON.stringify({ bookId, chapter: chapterNum, status: "rejected", discarded: [] }));
          } else {
            log(`Chapter ${chapterNum} rejected (state not rolled back).`);
          }
          return;
        }

        // Default: roll back state to before the rejected chapter and discard
        // it along with all subsequent chapters that depend on its state.
        const rollbackTarget = chapterNum - 1;
        discarded = await state.rollbackToChapter(bookId, rollbackTarget);
      } finally {
        await releaseLock();
      }
      const rollbackTarget = chapterNum - 1;

      if (opts.json) {
        log(JSON.stringify({
          bookId,
          chapter: chapterNum,
          status: "rejected",
          rolledBackTo: rollbackTarget,
          discarded,
        }));
      } else {
        log(`Chapter ${chapterNum} rejected. State rolled back to chapter ${rollbackTarget}.`);
        if (discarded.length > 1) {
          log(`  Also discarded ${discarded.length - 1} subsequent chapter(s): ${discarded.filter((n) => n !== chapterNum).join(", ")}`);
        }
      }
    } catch (e) {
      if (opts.json) {
        log(JSON.stringify({ error: String(e) }));
      } else {
        logError(`Failed to reject: ${e}`);
      }
      process.exit(1);
    }
  });
