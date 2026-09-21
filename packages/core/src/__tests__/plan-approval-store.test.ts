import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  approvePlan,
  loadPlanApproval,
  PLAN_APPROVAL_POLICY_VERSION,
  readPlanHash,
  readPlanRevisionState,
} from "../state/plan-approval-store.js";

const CHAPTER = 3;

describe("plan approval store", () => {
  let bookDir: string;

  beforeEach(async () => {
    bookDir = await mkdtemp(join(tmpdir(), "nc-plan-approval-"));
    await mkdir(join(bookDir, "story", "runtime"), { recursive: true });
  });

  afterEach(async () => {
    await rm(bookDir, { recursive: true, force: true });
  });

  const writePlan = (body: string) => writeFile(
    join(bookDir, "story", "runtime", `chapter-000${CHAPTER}.plan.md`),
    body,
    "utf-8",
  );

  it("reports nothing approved when the chapter has no plan", async () => {
    const state = await readPlanRevisionState(bookDir, CHAPTER);
    expect(state.revision).toBe(0);
    expect(state.approved).toBe(false);
    expect(state.dirty).toBe(false);
    expect(await loadPlanApproval(bookDir, CHAPTER)).toBeNull();
  });

  it("refuses to approve a chapter with no plan", async () => {
    const result = await approvePlan({ bookDir, chapterNumber: CHAPTER });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no-plan");
  });

  it("treats a fresh plan as revision 1 and unapproved", async () => {
    await writePlan("# plan v1\n");
    const state = await readPlanRevisionState(bookDir, CHAPTER);
    expect(state.revision).toBe(1);
    expect(state.approved).toBe(false);
    expect(state.dirty).toBe(true);
  });

  it("records who approved which revision, and clears dirty", async () => {
    await writePlan("# plan v1\n");
    const result = await approvePlan({
      bookDir,
      chapterNumber: CHAPTER,
      approvedBy: "作者本人",
      now: new Date("2026-03-01T00:00:00.000Z"),
    });
    expect(result.ok).toBe(true);

    const state = await readPlanRevisionState(bookDir, CHAPTER);
    expect(state.approved).toBe(true);
    expect(state.dirty).toBe(false);
    expect(state.approvedRevision).toBe(1);
    expect(state.approvedBy).toBe("作者本人");
    expect(state.approvedAt).toBe("2026-03-01T00:00:00.000Z");

    const stored = await loadPlanApproval(bookDir, CHAPTER);
    expect(stored?.policyVersion).toBe(PLAN_APPROVAL_POLICY_VERSION);
    expect(stored?.planHash).toBe(await readPlanHash(bookDir, CHAPTER));
  });

  it("becomes revision N+1 and dirty again when the plan changes", async () => {
    await writePlan("# plan v1\n");
    await approvePlan({ bookDir, chapterNumber: CHAPTER });
    await writePlan("# plan v2 改动过\n");

    const state = await readPlanRevisionState(bookDir, CHAPTER);
    expect(state.revision).toBe(2);
    expect(state.approved).toBe(false);
    expect(state.dirty).toBe(true);
    // The earlier approval is still reported, so the UI can say what was approved.
    expect(state.approvedRevision).toBeNull();
    expect(state.approvedHash).not.toBe(state.planHash);
  });

  it("refuses to approve a revision the author never saw", async () => {
    await writePlan("# plan v1\n");
    const result = await approvePlan({
      bookDir,
      chapterNumber: CHAPTER,
      expectedRevision: 7,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("revision-mismatch");
      expect(result.currentRevision).toBe(1);
    }
    expect((await readPlanRevisionState(bookDir, CHAPTER)).approved).toBe(false);
  });

  it("re-approving after an edit returns to a clean state", async () => {
    await writePlan("# plan v1\n");
    await approvePlan({ bookDir, chapterNumber: CHAPTER });
    await writePlan("# plan v2\n");
    const second = await approvePlan({ bookDir, chapterNumber: CHAPTER, expectedRevision: 2 });
    expect(second.ok).toBe(true);

    const state = await readPlanRevisionState(bookDir, CHAPTER);
    expect(state.revision).toBe(2);
    expect(state.approved).toBe(true);
    expect(state.dirty).toBe(false);
  });

  it("survives a corrupt approval file without claiming approval", async () => {
    await writePlan("# plan v1\n");
    await writeFile(
      join(bookDir, "story", "runtime", `chapter-000${CHAPTER}.approval.json`),
      "{ not json",
      "utf-8",
    );
    const state = await readPlanRevisionState(bookDir, CHAPTER);
    expect(state.approved).toBe(false);
    expect(state.dirty).toBe(true);
  });
});

