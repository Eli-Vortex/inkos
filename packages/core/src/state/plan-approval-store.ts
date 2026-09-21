import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stableHash } from "../utils/stable-hash.js";

/**
 * Chapter plan approval.
 *
 * The product has always shown "细纲已批准 / 有未批准变更", but nothing stored an
 * approval: `outlineApproved` and `outlineDirty` were hardcoded false in the
 * workbench, so the badges could never appear and the gate could not check what
 * it claimed to check. Rather than invent a field with no backing, this is the
 * backing: one small record per chapter naming the plan revision that was
 * approved, by whom and when.
 *
 * Revision is derived from the plan's content hash plus the stored revision
 * counter, which is enough to answer the only two questions that matter:
 * "is the current plan the approved one?" and "has it changed since?"
 */

export const PLAN_APPROVAL_POLICY_VERSION = "plan-approval-v1";

export interface PlanApproval {
  readonly schemaVersion: 1;
  readonly chapterNumber: number;
  /** Revision that was approved. */
  readonly revision: number;
  /** Hash of the plan file when it was approved. */
  readonly planHash: string;
  readonly approvedAt: string;
  readonly approvedBy: string;
  readonly policyVersion: string;
}

export interface PlanRevisionState {
  /** Revision of the plan currently on disk. */
  readonly revision: number;
  readonly planHash: string;
  /** Revision the author approved, or null when nothing has been approved. */
  readonly approvedRevision: number | null;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
  readonly approvedHash: string | null;
  /** True only when an approval exists and matches the current plan. */
  readonly approved: boolean;
  /** True when a plan exists whose current revision has not been approved. */
  readonly dirty: boolean;
}

function approvalPath(bookDir: string, chapterNumber: number): string {
  const padded = String(chapterNumber).padStart(4, "0");
  return join(bookDir, "story", "runtime", `chapter-${padded}.approval.json`);
}

function planPath(bookDir: string, chapterNumber: number): string {
  const padded = String(chapterNumber).padStart(4, "0");
  return join(bookDir, "story", "runtime", `chapter-${padded}.plan.md`);
}

function parseApproval(value: unknown): PlanApproval | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) return null;
  if (typeof record.chapterNumber !== "number") return null;
  if (typeof record.revision !== "number") return null;
  if (typeof record.planHash !== "string") return null;
  if (typeof record.approvedAt !== "string") return null;
  if (typeof record.approvedBy !== "string") return null;
  return {
    schemaVersion: 1,
    chapterNumber: record.chapterNumber,
    revision: record.revision,
    planHash: record.planHash,
    approvedAt: record.approvedAt,
    approvedBy: record.approvedBy,
    policyVersion: typeof record.policyVersion === "string"
      ? record.policyVersion
      : PLAN_APPROVAL_POLICY_VERSION,
  };
}

export async function loadPlanApproval(
  bookDir: string,
  chapterNumber: number,
): Promise<PlanApproval | null> {
  try {
    const raw = await readFile(approvalPath(bookDir, chapterNumber), "utf-8");
    return parseApproval(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Hash of the plan file, or null when the chapter has no plan. */
export async function readPlanHash(
  bookDir: string,
  chapterNumber: number,
): Promise<string | null> {
  try {
    const raw = await readFile(planPath(bookDir, chapterNumber), "utf-8");
    return stableHash(raw.trim());
  } catch {
    return null;
  }
}

/**
 * Derive the approval state of a chapter's plan.
 *
 * A plan that changed after approval is one revision beyond what was approved,
 * which is what makes "有未批准变更" true without keeping a full plan history.
 */
export async function readPlanRevisionState(
  bookDir: string,
  chapterNumber: number,
): Promise<PlanRevisionState> {
  const [planHash, approval] = await Promise.all([
    readPlanHash(bookDir, chapterNumber),
    loadPlanApproval(bookDir, chapterNumber),
  ]);

  if (!planHash) {
    return {
      revision: 0,
      planHash: "",
      approvedRevision: approval?.revision ?? null,
      approvedAt: approval?.approvedAt ?? null,
      approvedBy: approval?.approvedBy ?? null,
      approvedHash: approval?.planHash ?? null,
      approved: false,
      dirty: false,
    };
  }

  const matches = approval?.planHash === planHash;
  const revision = approval
    ? (matches ? approval.revision : approval.revision + 1)
    : 1;

  return {
    revision,
    planHash,
    approvedRevision: matches ? approval!.revision : null,
    approvedAt: matches ? approval!.approvedAt : approval?.approvedAt ?? null,
    approvedBy: matches ? approval!.approvedBy : approval?.approvedBy ?? null,
    approvedHash: approval?.planHash ?? null,
    approved: Boolean(matches),
    dirty: Boolean(planHash) && !matches,
  };
}

export type ApprovePlanResult =
  | { readonly ok: true; readonly approval: PlanApproval }
  | { readonly ok: false; readonly reason: "no-plan" | "revision-mismatch"; readonly currentRevision?: number };

/**
 * Approve the current plan revision.
 *
 * `expectedRevision` is checked against the plan actually on disk, so approving a
 * revision the author never saw is refused rather than silently recorded.
 */
export async function approvePlan(params: {
  readonly bookDir: string;
  readonly chapterNumber: number;
  readonly expectedRevision?: number;
  readonly approvedBy?: string;
  readonly now?: Date;
}): Promise<ApprovePlanResult> {
  const state = await readPlanRevisionState(params.bookDir, params.chapterNumber);
  if (!state.planHash) {
    return { ok: false, reason: "no-plan" };
  }
  if (typeof params.expectedRevision === "number" && params.expectedRevision !== state.revision) {
    return { ok: false, reason: "revision-mismatch", currentRevision: state.revision };
  }

  const approval: PlanApproval = {
    schemaVersion: 1,
    chapterNumber: params.chapterNumber,
    revision: state.revision,
    planHash: state.planHash,
    approvedAt: (params.now ?? new Date()).toISOString(),
    approvedBy: params.approvedBy ?? "author",
    policyVersion: PLAN_APPROVAL_POLICY_VERSION,
  };

  const dir = join(params.bookDir, "story", "runtime");
  await mkdir(dir, { recursive: true });
  await writeFile(
    approvalPath(params.bookDir, params.chapterNumber),
    JSON.stringify(approval, null, 2),
    "utf-8",
  );

  return { ok: true, approval };
}
