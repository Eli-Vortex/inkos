/**
 * Honest empty workbench dataset.
 *
 * Production must never present fabricated data: when the project has no books
 * (or a surface has no recorded data yet) the workbench shows these empty
 * structures and the pages render their own "not enough data" states. The demo
 * dataset in mock.ts is only ever used when the author explicitly turns on demo
 * mode.
 */

import type { WorkbenchDataset } from "./mock";

export function emptyWorkbenchDataset(): WorkbenchDataset {
  return {
    books: [],
    chapters: [],
    outline: {
      chapterId: "",
      goal: "",
      beats: [],
      characters: [],
      constraints: [],
      approvedRevision: null,
      currentRevision: 0,
      approvedAt: null,
      approvedBy: null,
    },
    candidates: [],
    reviewItems: [],
    tasks: [],
    research: { materials: [], timeline: [], promises: [], m3: [] },
    analytics: {
      currentChapter: 0,
      continuity: [],
      promises: [],
      debts: [],
      pacingAlerts: [],
    },
    export: {
      head: "",
      headCommitId: "",
      submittedChapters: 0,
      candidateChapters: 0,
      preview: [],
      history: [],
    },
    rules: [],
    diagnostics: [],
    unavailable: [],
    commitPreview: {
      candidateId: "",
      baseline: "",
      wordDelta: 0,
      statusChange: "",
      gates: [],
      pendingIndexTasks: [],
      removable: false,
    },
  };
}
