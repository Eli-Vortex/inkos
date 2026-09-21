import { describe, expect, it } from "vitest";
import {
  decideRevisionGate,
  REVISION_GATE_STANDARDS,
  type RevisionAuditCounts,
} from "../pipeline/revision-gate.js";

/**
 * Baseline fence for the manual-revision gate.
 *
 * The gate compares structured audit counts (blocking / critical / AI-tell).
 * These cases pin the current decision matrix so that any future change to the
 * counting source — for example moving the persisted audit summary to a
 * structured Finding model — shows up here as a visible, reviewed change rather
 * than a silent behaviour shift.
 */
const counts = (
  blockingCount: number,
  criticalCount: number,
  aiTellCount: number,
): RevisionAuditCounts => ({ blockingCount, criticalCount, aiTellCount });

describe("decideRevisionGate", () => {
  it("always applies under the always gate, even when everything worsens", () => {
    const decision = decideRevisionGate("always", counts(0, 0, 0), counts(9, 9, 9));
    expect(decision.apply).toBe(true);
  });

  it("strict applies only when nothing worsens and something improves", () => {
    // Nothing worsens + blocking improves → apply.
    expect(decideRevisionGate("strict", counts(3, 1, 2), counts(2, 1, 2)).apply).toBe(true);
    // Nothing worsens + only AI-tells improve → apply.
    expect(decideRevisionGate("strict", counts(3, 1, 2), counts(3, 1, 1)).apply).toBe(true);
    // Nothing worsens but nothing improves → keep the original.
    expect(decideRevisionGate("strict", counts(3, 1, 2), counts(3, 1, 2)).apply).toBe(false);
    // Blocking improves but AI-tells worsen → counts did worsen, keep original.
    expect(decideRevisionGate("strict", counts(3, 1, 2), counts(2, 1, 3)).apply).toBe(false);
    // Only critical worsens → keep original.
    expect(decideRevisionGate("strict", counts(3, 1, 2), counts(3, 2, 1)).apply).toBe(false);
  });

  it("lenient applies whenever nothing worsens, with no improvement required", () => {
    expect(decideRevisionGate("lenient", counts(3, 1, 2), counts(3, 1, 2)).apply).toBe(true);
    expect(decideRevisionGate("lenient", counts(3, 1, 2), counts(2, 1, 2)).apply).toBe(true);
    // Any count worsening blocks it.
    expect(decideRevisionGate("lenient", counts(3, 1, 2), counts(3, 1, 3)).apply).toBe(false);
    expect(decideRevisionGate("lenient", counts(3, 1, 2), counts(3, 2, 2)).apply).toBe(false);
    expect(decideRevisionGate("lenient", counts(3, 1, 2), counts(4, 1, 2)).apply).toBe(false);
  });

  it("a critical-only improvement satisfies the strict gate when nothing worsens", () => {
    // Clearing a critical issue is a real improvement: a rewrite that only
    // fixed criticals must not be discarded (that looked like "rewrite did
    // nothing").
    const decision = decideRevisionGate("strict", counts(3, 2, 2), counts(3, 1, 2));
    expect(decision.apply).toBe(true);
    expect(decision.improvedBlocking).toBe(false);
    expect(decision.improvedCritical).toBe(true);
    expect(decision.improvedAITells).toBe(false);
    expect(decision.didNotWorsen).toBe(true);
  });

  it("reports the comparison components for diagnostics", () => {
    const decision = decideRevisionGate("strict", counts(3, 1, 2), counts(1, 1, 1));
    expect(decision).toEqual({
      apply: true,
      improvedBlocking: true,
      improvedCritical: false,
      improvedAITells: true,
      didNotWorsen: true,
    });
  });

  it("describes every gate in the diagnostics standards", () => {
    for (const gate of ["strict", "lenient", "always"] as const) {
      expect(REVISION_GATE_STANDARDS[gate]).toBeTruthy();
    }
  });
});
