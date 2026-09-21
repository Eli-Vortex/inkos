import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HookRecordSchema, type HookRecord } from "../models/runtime-state.js";
import {
  loadHookDiagnosticsHistory,
  recordHookDiagnostics,
  staleRunLength,
  HOOK_DIAGNOSTICS_POLICY_VERSION,
} from "../state/hook-diagnostics-store.js";
import { hasEvidenceTrail, hookEvidence } from "../utils/hook-lifecycle.js";

const baseHook = {
  hookId: "h-1",
  startChapter: 3,
  type: "mystery",
  status: "open" as const,
  lastAdvancedChapter: 3,
  expectedPayoff: "棋盘底下的信",
  notes: "",
};

const hook = (overrides: Partial<HookRecord> = {}): HookRecord =>
  HookRecordSchema.parse({ ...baseHook, ...overrides });

describe("HookRecord evidence fields", () => {
  it("still parses a ledger written before evidence tracking", () => {
    const parsed = HookRecordSchema.parse(baseHook);
    expect(parsed.evidence).toBeUndefined();
    expect(parsed.resolvedAt).toBeUndefined();
    expect(parsed.policyVersion).toBeUndefined();
    // Absence is reported as "no trail", not as a fabricated empty one.
    expect(hookEvidence(parsed)).toEqual([]);
    expect(hasEvidenceTrail(parsed)).toBe(false);
  });

  it("round-trips a recorded evidence trail", () => {
    const parsed = hook({
      evidence: [
        { chapter: 3, quote: "他把信塞进棋盘夹层", kind: "planted" },
        { chapter: 19, quote: "夹层里空无一物", kind: "paid-off" },
      ],
      resolvedAt: 19,
      policyVersion: "hook-stale-v1",
    });
    expect(hookEvidence(parsed)).toHaveLength(2);
    expect(hasEvidenceTrail(parsed)).toBe(true);
    expect(parsed.resolvedAt).toBe(19);
  });

  it("rejects an evidence entry with an unknown kind", () => {
    expect(() => HookRecordSchema.parse({
      ...baseHook,
      evidence: [{ chapter: 3, quote: "x", kind: "invented" }],
    })).toThrow();
  });

  it("survives a JSON round-trip, which is how hooks.json persists it", () => {
    const parsed = hook({
      evidence: [{ chapter: 5, quote: "引用", kind: "advanced" }],
    });
    const revived = HookRecordSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(revived).toEqual(parsed);
  });
});

describe("hook diagnostics history", () => {
  let bookDir: string;

  beforeEach(async () => {
    bookDir = await mkdtemp(join(tmpdir(), "nc-hook-diag-"));
  });

  afterEach(async () => {
    await rm(bookDir, { recursive: true, force: true });
  });

  it("returns an empty history when nothing has been recorded", async () => {
    const history = await loadHookDiagnosticsHistory(bookDir);
    expect(history.snapshots).toEqual([]);
  });

  it("records one snapshot per chapter and keeps them in chapter order", async () => {
    // A hook planted at 3, never advanced, with a short half-life.
    const hooks = [hook({ halfLifeChapters: 2, lastAdvancedChapter: 3, promoted: true })];

    await recordHookDiagnostics({ bookDir, chapter: 10, hooks });
    await recordHookDiagnostics({ bookDir, chapter: 4, hooks });

    const history = await loadHookDiagnosticsHistory(bookDir);
    expect(history.snapshots.map((snapshot) => snapshot.chapter)).toEqual([4, 10]);
    expect(history.snapshots[0]?.policyVersion).toBe(HOOK_DIAGNOSTICS_POLICY_VERSION);
    expect(history.snapshots[0]?.entries["h-1"]).toMatchObject({ halfLife: expect.any(Number) });
  });

  it("replaces a chapter's snapshot instead of duplicating it", async () => {
    const hooks = [hook({ halfLifeChapters: 2 })];
    await recordHookDiagnostics({ bookDir, chapter: 6, hooks });
    await recordHookDiagnostics({ bookDir, chapter: 6, hooks });
    const history = await loadHookDiagnosticsHistory(bookDir);
    expect(history.snapshots).toHaveLength(1);
  });

  it("keeps the past intact when a later chapter is recorded", async () => {
    const hooks = [hook({ halfLifeChapters: 2, lastAdvancedChapter: 3 })];
    const first = await recordHookDiagnostics({ bookDir, chapter: 4, hooks });
    await recordHookDiagnostics({ bookDir, chapter: 30, hooks });

    const history = await loadHookDiagnosticsHistory(bookDir);
    // The chapter-4 verdict is still readable exactly as it was recorded.
    expect(history.snapshots[0]).toEqual(first);
  });

  it("makes a stale run measurable over time", async () => {
    const hooks = [hook({ halfLifeChapters: 1, lastAdvancedChapter: 1 })];
    for (const chapter of [5, 6, 7]) {
      await recordHookDiagnostics({ bookDir, chapter, hooks });
    }
    const history = await loadHookDiagnosticsHistory(bookDir);
    expect(staleRunLength(history, "h-1")).toBe(3);
    expect(staleRunLength(history, "h-1", 6)).toBe(2);
  });
});
