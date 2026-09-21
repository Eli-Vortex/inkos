import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { HookRecord } from "../models/runtime-state.js";
import { computeHookDiagnostics, type HookDiagnostics } from "../utils/hook-stale-detection.js";

/**
 * Persisted hook-diagnostic history.
 *
 * Stale/blocked detection used to be recomputed and thrown away with the
 * rendered markdown, which meant the product could say "this hook is stale now"
 * but never "this hook has been stale for twenty chapters". Anything derived
 * from a policy that can change over time needs its historical verdicts kept,
 * otherwise a policy tweak silently rewrites the past.
 *
 * One snapshot per chapter, appended. Re-recording the same chapter replaces its
 * snapshot rather than duplicating it, so a retried chapter settles on its final
 * verdict.
 */
export const HOOK_DIAGNOSTICS_POLICY_VERSION = "hook-stale-v1";

const HookDiagnosticEntrySchema = z.object({
  stale: z.boolean(),
  blocked: z.boolean(),
  missingUpstream: z.array(z.string()).default([]),
  distance: z.number(),
  halfLife: z.number(),
  blockedDistance: z.number(),
});

const HookDiagnosticSnapshotSchema = z.object({
  chapter: z.number().int().min(0),
  policyVersion: z.string().min(1),
  recordedAt: z.string().datetime(),
  entries: z.record(z.string(), HookDiagnosticEntrySchema),
});
export type HookDiagnosticSnapshot = z.infer<typeof HookDiagnosticSnapshotSchema>;

export const HookDiagnosticsHistorySchema = z.object({
  schemaVersion: z.literal(1),
  snapshots: z.array(HookDiagnosticSnapshotSchema).default([]),
});
export type HookDiagnosticsHistory = z.infer<typeof HookDiagnosticsHistorySchema>;

function historyPath(bookDir: string): string {
  return join(bookDir, "story", "state", "hook_diagnostics.json");
}

export function diagnosticEntry(
  diagnostics: HookDiagnostics,
): z.infer<typeof HookDiagnosticEntrySchema> {
  return {
    stale: diagnostics.stale,
    blocked: diagnostics.blocked,
    missingUpstream: [...diagnostics.missingUpstream],
    distance: diagnostics.distance,
    halfLife: diagnostics.halfLife,
    blockedDistance: diagnostics.blockedDistance,
  };
}

export async function loadHookDiagnosticsHistory(
  bookDir: string,
): Promise<HookDiagnosticsHistory> {
  try {
    const raw = await readFile(historyPath(bookDir), "utf-8");
    return HookDiagnosticsHistorySchema.parse(JSON.parse(raw));
  } catch {
    return { schemaVersion: 1, snapshots: [] };
  }
}

/**
 * Record the diagnostics for one chapter, replacing any earlier snapshot for it.
 *
 * Snapshots are kept in chapter order so a reader can reconstruct a curve
 * without sorting, and so the file stays diff-friendly.
 */
export async function recordHookDiagnostics(params: {
  readonly bookDir: string;
  readonly chapter: number;
  readonly hooks: ReadonlyArray<HookRecord>;
  readonly policyVersion?: string;
  readonly now?: Date;
}): Promise<HookDiagnosticSnapshot> {
  const diagnostics = computeHookDiagnostics({
    hooks: params.hooks,
    currentChapter: params.chapter,
  });

  const entries: HookDiagnosticSnapshot["entries"] = {};
  for (const [hookId, value] of diagnostics) {
    entries[hookId] = diagnosticEntry(value);
  }

  const snapshot: HookDiagnosticSnapshot = {
    chapter: params.chapter,
    policyVersion: params.policyVersion ?? HOOK_DIAGNOSTICS_POLICY_VERSION,
    recordedAt: (params.now ?? new Date()).toISOString(),
    entries,
  };

  const history = await loadHookDiagnosticsHistory(params.bookDir);
  const snapshots = history.snapshots
    .filter((item) => item.chapter !== params.chapter)
    .concat(snapshot)
    .sort((left, right) => left.chapter - right.chapter);

  const stateDir = join(params.bookDir, "story", "state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    historyPath(params.bookDir),
    JSON.stringify({ schemaVersion: 1, snapshots }, null, 2),
    "utf-8",
  );

  return snapshot;
}

/** How many consecutive snapshots up to `throughChapter` flagged the hook stale. */
export function staleRunLength(
  history: HookDiagnosticsHistory,
  hookId: string,
  throughChapter?: number,
): number {
  const relevant = history.snapshots
    .filter((snapshot) => throughChapter === undefined || snapshot.chapter <= throughChapter)
    .sort((left, right) => left.chapter - right.chapter);

  let run = 0;
  for (let index = relevant.length - 1; index >= 0; index -= 1) {
    if (relevant[index]?.entries[hookId]?.stale) run += 1;
    else break;
  }
  return run;
}
