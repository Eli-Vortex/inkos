import { access } from "node:fs/promises";
import { join } from "node:path";
import {
  defaultBlockingPolicy,
  defaultWaivablePolicy,
  type Finding,
} from "../findings/types.js";
import { findingId } from "../findings/legacy.js";
import { loadPersistedPlan } from "./persisted-governed-plan.js";
import { readPlanRevisionState } from "../state/plan-approval-store.js";
import type { PlanChapterOutput } from "../agents/planner.js";

/**
 * The chapter gate: one implementation of "may this chapter be written".
 *
 * The upstream skill pack expressed this as a shell hook
 * (`guard-outline-before-prose.sh`), which can only guard whichever entry point
 * happens to invoke it. Here it is a plain function so the editor, the CLI and
 * the daemon all reach the same verdict instead of three similar ones.
 *
 * It checks what it can actually verify:
 *   1. a chapter plan exists for this chapter;
 *   2. the plan parses strictly (the memo parser rejects drift and blanks);
 *   3. the plan belongs to the chapter being written;
 *   4. the plan carries a goal and some operative constraints.
 *
 * It deliberately does NOT check an approval version. This codebase has no
 * outline-approval store yet, so inventing a check for one would produce a field
 * that looks enforcing but never runs. That dimension is reported as
 * `unverified` instead, which is a claim about the gate, not about the plan.
 */

export const CHAPTER_GATE_POLICY_VERSION = "chapter-gate-v1";

export const GATE_RULES = {
  planMissing: "contract.outline.missing",
  planUnparsable: "contract.outline.unparsable",
  chapterMismatch: "contract.outline.chapter-mismatch",
  goalMissing: "contract.outline.goal-missing",
  thinConstraints: "contract.outline.thin-constraints",
  planUnapproved: "contract.outline.unapproved",
  approvalStale: "contract.outline.approval-stale",
  approvalUnverified: "contract.outline.approval-unverified",
} as const;

export interface ChapterGateInput {
  readonly bookId: string;
  readonly bookDir: string;
  readonly chapterNumber: number;
}

export interface ChapterGateResult {
  readonly passed: boolean;
  readonly findings: readonly Finding[];
  /** The parsed plan when one was available, so callers do not reload it. */
  readonly plan: PlanChapterOutput | null;
}

function planFilePath(bookDir: string, chapterNumber: number): string {
  const padded = String(chapterNumber).padStart(4, "0");
  return join(bookDir, "story", "runtime", `chapter-${padded}.plan.md`);
}

function finding(params: {
  readonly rule: string;
  readonly severity: Finding["severity"];
  readonly blocking: boolean;
  readonly chapterNumber: number;
  readonly message: string;
  readonly suggestion: string;
  readonly status?: Finding["status"];
}): Finding {
  return {
    id: findingId({
      source: "contract",
      rule: params.rule,
      chapterNumber: params.chapterNumber,
      message: params.message,
    }),
    source: "contract",
    rule: params.rule,
    severity: params.severity,
    blocking: params.blocking,
    scope: "chapter",
    status: params.status ?? "open",
    message: params.message,
    suggestion: params.suggestion,
    evidence: { chapterNumber: params.chapterNumber },
    policyVersion: CHAPTER_GATE_POLICY_VERSION,
    createdAt: new Date(0).toISOString(),
  };
}

/**
 * Pure evaluation of a chapter plan against its chapter.
 *
 * Split from the loader so the rules can be tested without touching disk, and so
 * a caller holding an already-parsed plan can re-evaluate without re-reading.
 */
export function evaluateChapterGate(params: {
  readonly chapterNumber: number;
  readonly planFilePresent: boolean;
  readonly plan: PlanChapterOutput | null;
  /**
   * Approval state of the plan. `null` means approval could not be read, which
   * is reported as unverified rather than as "approved" or "not approved".
   */
  readonly approval?: {
    readonly approved: boolean;
    readonly dirty: boolean;
    readonly approvedRevision: number | null;
    readonly revision: number;
  } | null;
}): readonly Finding[] {
  const { chapterNumber, planFilePresent, plan, approval } = params;
  const findings: Finding[] = [];

  if (!planFilePresent) {
    findings.push(finding({
      rule: GATE_RULES.planMissing,
      severity: "critical",
      blocking: defaultBlockingPolicy("critical"),
      chapterNumber,
      message: `第 ${chapterNumber} 章缺少细纲，无法开始写正文。`,
      suggestion: "先生成本章细纲并确认其内容；确需直接手写可显式豁免并说明理由。",
    }));
    return findings;
  }

  if (!plan) {
    findings.push(finding({
      rule: GATE_RULES.planUnparsable,
      severity: "critical",
      blocking: defaultBlockingPolicy("critical"),
      chapterNumber,
      message: `第 ${chapterNumber} 章的细纲无法严格解析，已拒绝以退化内容继续。`,
      suggestion: "重新生成或修正细纲的必要章节标题与内容，不要留空段落。",
    }));
    return findings;
  }

  if (plan.intent.chapter !== chapterNumber) {
    findings.push(finding({
      rule: GATE_RULES.chapterMismatch,
      severity: "critical",
      blocking: defaultBlockingPolicy("critical"),
      chapterNumber,
      message: `细纲记录的章节是第 ${plan.intent.chapter} 章，与要写的第 ${chapterNumber} 章不一致。`,
      suggestion: "为本章重新生成细纲，不要把别的章节的计划套用过来。",
    }));
  }

  if (!plan.intent.goal.trim()) {
    findings.push(finding({
      rule: GATE_RULES.goalMissing,
      severity: "critical",
      blocking: defaultBlockingPolicy("critical"),
      chapterNumber,
      message: `第 ${chapterNumber} 章的细纲没有写明本章目标。`,
      suggestion: "补上本章要达成的可见变化，再开始写正文。",
    }));
  }

  const constraintCount = plan.intent.mustKeep.length
    + plan.intent.mustAvoid.length
    + plan.intent.styleEmphasis.length;
  if (constraintCount === 0) {
    findings.push(finding({
      rule: GATE_RULES.thinConstraints,
      severity: "warning",
      blocking: defaultBlockingPolicy("warning"),
      chapterNumber,
      message: `第 ${chapterNumber} 章的细纲没有必须保留、必须避免或风格侧重的约束。`,
      suggestion: "补充至少一条硬约束，让审稿有可对照的标准。",
    }));
  }

  // Approval is now a real check when the approval record can be read. It is
  // only reported as unverified when it genuinely could not be determined.
  if (!approval) {
    findings.push(finding({
      rule: GATE_RULES.approvalUnverified,
      severity: "info",
      blocking: false,
      chapterNumber,
      message: "细纲批准状态无法读取，本次未做校验。",
      suggestion: "确认细纲批准记录可读后会自动生效，无需手工处理。",
      status: "unverified",
    }));
  } else if (!approval.approved && approval.dirty) {
    findings.push(finding({
      rule: GATE_RULES.approvalStale,
      severity: "critical",
      blocking: defaultBlockingPolicy("critical"),
      chapterNumber,
      message: `第 ${chapterNumber} 章的细纲在第 ${approval.approvedRevision ?? 0} 版被批准后已改动，当前是第 ${approval.revision} 版。`,
      suggestion: "确认最新细纲后再批准，或显式豁免并说明理由。",
    }));
  } else if (!approval.approved) {
    findings.push(finding({
      rule: GATE_RULES.planUnapproved,
      severity: "critical",
      blocking: defaultBlockingPolicy("critical"),
      chapterNumber,
      message: `第 ${chapterNumber} 章的细纲尚未批准。`,
      suggestion: "确认细纲内容后批准，或显式豁免并说明理由。",
    }));
  }

  return findings;
}

export async function validateChapterGate(input: ChapterGateInput): Promise<ChapterGateResult> {
  let planFilePresent = false;
  try {
    await access(planFilePath(input.bookDir, input.chapterNumber));
    planFilePresent = true;
  } catch {
    planFilePresent = false;
  }

  const plan = planFilePresent
    ? await loadPersistedPlan(input.bookDir, input.chapterNumber)
    : null;

  // Approval is read separately so a failure to read it is distinguishable from
  // "not approved" — the first must not be reported as the second.
  let approval: Parameters<typeof evaluateChapterGate>[0]["approval"] = null;
  try {
    const state = await readPlanRevisionState(input.bookDir, input.chapterNumber);
    approval = {
      approved: state.approved,
      dirty: state.dirty,
      approvedRevision: state.approvedRevision,
      revision: state.revision,
    };
  } catch {
    approval = null;
  }

  const findings = evaluateChapterGate({
    chapterNumber: input.chapterNumber,
    planFilePresent,
    plan,
    approval,
  });

  return {
    passed: findings.every((item) => !item.blocking || item.status === "waived"),
    findings,
    plan,
  };
}

/** Whether an author may waive this finding. Every gate rule is waivable with a reason. */
export function isGateFindingWaivable(item: Finding): boolean {
  return defaultWaivablePolicy(item.source);
}
