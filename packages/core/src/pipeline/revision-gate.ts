import type { RevisionGate } from "../models/book.js";

/**
 * The three counts the manual-revision gate compares.
 *
 * These come from the in-memory structured audit result during the pipeline run
 * (`AuditIssue` severities plus the AI-tell count) — not from the flattened
 * `auditIssues` strings that are persisted into the chapter index. Keeping the
 * decision on structured counts is deliberate: the persisted strings are a
 * summary for readers, and must never become the gate's input.
 */
export interface RevisionAuditCounts {
  readonly blockingCount: number;
  readonly criticalCount: number;
  readonly aiTellCount: number;
}

export interface RevisionGateDecision {
  readonly apply: boolean;
  readonly improvedBlocking: boolean;
  readonly improvedCritical: boolean;
  readonly improvedAITells: boolean;
  readonly didNotWorsen: boolean;
}

/** Human-readable description of each manual-revision gate, surfaced in revisionDiagnostics. */
export const REVISION_GATE_STANDARDS: Record<RevisionGate, string> = {
  strict: "A revision is applied only when blocking, critical, and AI-tell counts do not worsen, and at least one of blocking, critical, or AI-tell issues improves.",
  lenient: "A revision is applied whenever blocking, critical, and AI-tell counts do not worsen; no improvement is required (lenient gate).",
  always: "Manual revisions are always applied; audit counts are recorded for reference only (always gate).",
};

/**
 * Decide whether a manual revision may replace the original chapter.
 *
 * - "strict": apply only when no count worsens AND blocking or AI-tells improved.
 * - "lenient": apply whenever no count worsens (no improvement required).
 * - "always": always apply; counts are recorded only.
 *
 * Extracted from the pipeline so the decision is a pure, directly testable unit
 * and so any future change to the counting source is caught by the baseline
 * suite in `__tests__/revision-gate-decision.test.ts`.
 */
export function decideRevisionGate(
  gate: RevisionGate,
  before: RevisionAuditCounts,
  after: RevisionAuditCounts,
): RevisionGateDecision {
  const improvedBlocking = after.blockingCount < before.blockingCount;
  // Clearing a critical issue is a real improvement even when the blocking
  // count is unchanged; without this, a rewrite that only fixed criticals was
  // rejected and the original kept, so "rewrite" appeared to do nothing.
  const improvedCritical = after.criticalCount < before.criticalCount;
  const improvedAITells = after.aiTellCount < before.aiTellCount;
  const blockingDidNotWorsen = after.blockingCount <= before.blockingCount;
  const criticalDidNotWorsen = after.criticalCount <= before.criticalCount;
  const aiDidNotWorsen = after.aiTellCount <= before.aiTellCount;
  const didNotWorsen = blockingDidNotWorsen && criticalDidNotWorsen && aiDidNotWorsen;

  const apply = gate === "always"
    ? true
    : gate === "lenient"
      ? didNotWorsen
      : didNotWorsen && (improvedBlocking || improvedCritical || improvedAITells);

  return { apply, improvedBlocking, improvedCritical, improvedAITells, didNotWorsen };
}
