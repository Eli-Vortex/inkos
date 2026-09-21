import { describe, expect, it } from "vitest";
import { EMPTY_DATASET, NORMAL_DATASET, datasetFor } from "./mock";

describe("demo dataset", () => {
  it("keeps the empty scenario genuinely empty instead of hiding placeholders", () => {
    const empty = datasetFor("empty");
    expect(empty).toBe(EMPTY_DATASET);
    expect(empty.books).toHaveLength(0);
    expect(empty.chapters).toHaveLength(0);
    expect(empty.candidates).toHaveLength(0);
    expect(empty.reviewItems).toHaveLength(0);
    expect(empty.tasks).toHaveLength(0);
  });

  it("gives every finding evidence and an explicit waivability decision", () => {
    for (const item of NORMAL_DATASET.reviewItems) {
      expect(item.evidence.quote.length).toBeGreaterThan(0);
      expect(item.evidence.chapterLabel.length).toBeGreaterThan(0);
      // A hard integrity error can never be waived from the UI.
      if (item.severity === "block") expect(item.waivable).toBe(false);
      // Only a waived finding may carry a recorded reason.
      expect(item.status === "waived" ? item.waiverReason !== null : item.waiverReason === null).toBe(true);
    }
  });

  it("keeps exactly one formal candidate so 版本比较 has a stable baseline", () => {
    expect(NORMAL_DATASET.candidates.filter((candidate) => candidate.isFormal)).toHaveLength(1);
  });

  it("points the commit preview at a real candidate and blocks on open findings", () => {
    const target = NORMAL_DATASET.candidates.find(
      (candidate) => candidate.id === NORMAL_DATASET.commitPreview.candidateId,
    );
    expect(target).toBeDefined();
    expect(target?.isFormal).toBe(false);
    const openBlockers = NORMAL_DATASET.reviewItems.filter(
      (item) => item.severity === "block" && item.status === "open",
    );
    expect(openBlockers.length).toBeGreaterThan(0);
    expect(NORMAL_DATASET.commitPreview.gates.some((gate) => gate.state === "block")).toBe(true);
    expect(NORMAL_DATASET.commitPreview.pendingIndexTasks.length).toBeGreaterThan(0);
  });

  it("never invents a committed word count for a book still migrating", () => {
    const migrating = NORMAL_DATASET.books.find((book) => book.migration === "pending");
    expect(migrating).toBeDefined();
    expect(migrating?.chaptersCommitted).toBe(0);
    expect(migrating?.wordCount).toBe(0);
  });

  it("never exposes an unconnected capability as available", () => {
    expect(NORMAL_DATASET.unavailable.length).toBeGreaterThan(0);
    for (const capability of NORMAL_DATASET.unavailable) {
      expect(capability.reason.length).toBeGreaterThan(0);
    }
    // Every declared rule must name its severity and its source.
    for (const rule of NORMAL_DATASET.rules) {
      expect(["block", "warn", "suggest"]).toContain(rule.severity);
      expect(rule.source.length).toBeGreaterThan(0);
    }
  });

  it("applies a scenario override without mutating the normal dataset", () => {
    const conflicted = datasetFor("conflict");
    const hand = conflicted.candidates.find((candidate) => candidate.id === "cand-hand");
    expect(hand?.baseline).toContain("r9");
    expect(NORMAL_DATASET.candidates.find((candidate) => candidate.id === "cand-hand")?.baseline).not.toContain("r9");
    expect(conflicted.candidates[0]).toEqual(NORMAL_DATASET.candidates[0]);
  });

  it("marks an existing chapter stale instead of inventing one", () => {
    const stale = datasetFor("stale");
    expect(stale.chapters.map((chapter) => chapter.id)).toEqual(NORMAL_DATASET.chapters.map((chapter) => chapter.id));
    expect(stale.chapters.find((chapter) => chapter.id === "c-10")?.staleReview).toBe(true);
    expect(NORMAL_DATASET.chapters.find((chapter) => chapter.id === "c-10")?.staleReview).toBe(false);
  });

  it("describes recovery on the diagnostic entry, not as a fake success", () => {
    const recovering = datasetFor("recovering");
    expect(recovering.books).toBe(NORMAL_DATASET.books);
    const entry = recovering.diagnostics.find((diagnostic) => diagnostic.id === "d-3");
    expect(entry?.detail).toContain("恢复流程");
    expect(entry?.state).toBe("warn");
  });
});
