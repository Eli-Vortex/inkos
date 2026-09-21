import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { blockingFindings, FindingSchema } from "../findings/index.js";
import type { Finding } from "../findings/types.js";
import {
  CHAPTER_GATE_POLICY_VERSION,
  evaluateChapterGate,
  GATE_RULES,
  isGateFindingWaivable,
  validateChapterGate,
} from "../pipeline/chapter-gate.js";

const plan = (overrides: {
  chapter?: number;
  goal?: string;
  mustKeep?: string[];
  mustAvoid?: string[];
  styleEmphasis?: string[];
} = {}) => ({
  intent: {
    chapter: overrides.chapter ?? 4,
    goal: overrides.goal ?? "让主角拿到账本",
    mustKeep: overrides.mustKeep ?? ["主角谨慎"],
    mustAvoid: overrides.mustAvoid ?? [],
    styleEmphasis: overrides.styleEmphasis ?? [],
  },
  memo: { chapter: overrides.chapter ?? 4 },
  plannerInputs: {},
}) as unknown as Parameters<typeof evaluateChapterGate>[0]["plan"];

const ruleIds = (findings: readonly Finding[]) => findings.map((item) => item.rule);

describe("chapter gate rules", () => {
  it("blocks when there is no plan at all", () => {
    const findings = evaluateChapterGate({
      chapterNumber: 4,
      planFilePresent: false,
      plan: null,
    });
    expect(ruleIds(findings)).toEqual([GATE_RULES.planMissing]);
    expect(blockingFindings(findings)).toHaveLength(1);
  });

  it("blocks when the plan exists but cannot be parsed strictly", () => {
    const findings = evaluateChapterGate({
      chapterNumber: 4,
      planFilePresent: true,
      plan: null,
    });
    expect(ruleIds(findings)).toEqual([GATE_RULES.planUnparsable]);
    expect(blockingFindings(findings)).toHaveLength(1);
  });

  it("blocks when the plan belongs to a different chapter", () => {
    const findings = evaluateChapterGate({
      chapterNumber: 7,
      planFilePresent: true,
      plan: plan({ chapter: 6 }),
    });
    expect(ruleIds(findings)).toContain(GATE_RULES.chapterMismatch);
    expect(blockingFindings(findings).map((item) => item.rule))
      .toContain(GATE_RULES.chapterMismatch);
  });

  it("blocks when the plan states no goal", () => {
    const findings = evaluateChapterGate({
      chapterNumber: 4,
      planFilePresent: true,
      plan: plan({ goal: "   " }),
    });
    expect(ruleIds(findings)).toContain(GATE_RULES.goalMissing);
    expect(blockingFindings(findings).map((item) => item.rule))
      .toContain(GATE_RULES.goalMissing);
  });

  it("warns, but does not block, on a plan with no operative constraints", () => {
    const findings = evaluateChapterGate({
      chapterNumber: 4,
      planFilePresent: true,
      plan: plan({ mustKeep: [], mustAvoid: [], styleEmphasis: [] }),
    });
    const thin = findings.find((item) => item.rule === GATE_RULES.thinConstraints);
    expect(thin?.severity).toBe("warning");
    expect(thin?.blocking).toBe(false);
    expect(blockingFindings(findings)).toHaveLength(0);
  });

  it("reports the missing approval store as unverified rather than passing it", () => {
    const findings = evaluateChapterGate({
      chapterNumber: 4,
      planFilePresent: true,
      plan: plan(),
    });
    const approval = findings.find((item) => item.rule === GATE_RULES.approvalUnverified);
    expect(approval?.status).toBe("unverified");
    // Not being able to check approval must not stop the author.
    expect(approval?.blocking).toBe(false);
    expect(blockingFindings(findings)).toHaveLength(0);
  });

  it("passes a well-formed plan, and every finding validates against the schema", () => {
    const findings = evaluateChapterGate({
      chapterNumber: 4,
      planFilePresent: true,
      plan: plan(),
    });
    expect(blockingFindings(findings)).toHaveLength(0);
    for (const item of findings) {
      expect(() => FindingSchema.parse(item)).not.toThrow();
    }
    expect(findings.every((item) => item.policyVersion === CHAPTER_GATE_POLICY_VERSION)).toBe(true);
  });

  it("blocks an unapproved plan once approval state is readable", () => {
    const findings = evaluateChapterGate({
      chapterNumber: 4,
      planFilePresent: true,
      plan: plan(),
      approval: { approved: false, dirty: false, approvedRevision: null, revision: 1 },
    });
    expect(ruleIds(findings)).toContain(GATE_RULES.planUnapproved);
    expect(blockingFindings(findings).map((item) => item.rule)).toContain(GATE_RULES.planUnapproved);
  });

  it("blocks a plan that changed after it was approved", () => {
    const findings = evaluateChapterGate({
      chapterNumber: 4,
      planFilePresent: true,
      plan: plan(),
      // Approved at r2, plan is now at r3.
      approval: { approved: false, dirty: true, approvedRevision: 2, revision: 3 },
    });
    const stale = findings.find((item) => item.rule === GATE_RULES.approvalStale);
    expect(stale?.blocking).toBe(true);
    expect(stale?.message).toContain("第 2 版");
    expect(stale?.message).toContain("第 3 版");
  });

  it("passes when the current plan revision is the approved one", () => {
    const findings = evaluateChapterGate({
      chapterNumber: 4,
      planFilePresent: true,
      plan: plan(),
      approval: { approved: true, dirty: false, approvedRevision: 3, revision: 3 },
    });
    expect(ruleIds(findings)).not.toContain(GATE_RULES.planUnapproved);
    expect(ruleIds(findings)).not.toContain(GATE_RULES.approvalStale);
    expect(ruleIds(findings)).not.toContain(GATE_RULES.approvalUnverified);
    expect(blockingFindings(findings)).toHaveLength(0);
  });

  it("allows an author to waive a gate finding with a reason", () => {
    const findings = evaluateChapterGate({
      chapterNumber: 4,
      planFilePresent: false,
      plan: null,
    });
    const missing = findings[0]!;
    expect(isGateFindingWaivable(missing)).toBe(true);
    const waived: Finding = {
      ...missing,
      status: "waived",
      waiver: {
        by: "author",
        reason: "本章是一次有意的手写实验",
        at: new Date().toISOString(),
        basisHash: "hash",
      },
    };
    // A waived finding no longer counts against the gate.
    expect(blockingFindings([waived])).toHaveLength(0);
  });
});

describe("validateChapterGate against disk", () => {
  let bookDir: string;

  beforeEach(async () => {
    bookDir = await mkdtemp(join(tmpdir(), "nc-gate-"));
  });

  afterEach(async () => {
    await rm(bookDir, { recursive: true, force: true });
  });

  it("reports a missing plan file as missing, not as unparsable", async () => {
    const result = await validateChapterGate({ bookId: "b", bookDir, chapterNumber: 1 });
    expect(result.passed).toBe(false);
    expect(result.plan).toBeNull();
    expect(ruleIds(result.findings)).toEqual([GATE_RULES.planMissing]);
  });

  it("distinguishes an unreadable plan from a missing one", async () => {
    const runtimeDir = join(bookDir, "story", "runtime");
    await mkdir(runtimeDir, { recursive: true });
    // A plan file with YAML frontmatter is the documented "re-plan" signal.
    await writeFile(
      join(runtimeDir, "chapter-0001.plan.md"),
      "---\nchapter: 1\n---\n",
      "utf-8",
    );

    const result = await validateChapterGate({ bookId: "b", bookDir, chapterNumber: 1 });
    expect(ruleIds(result.findings)).toEqual([GATE_RULES.planUnparsable]);
  });
});

