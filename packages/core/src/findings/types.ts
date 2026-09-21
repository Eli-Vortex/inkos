import { z } from "zod";
import { stableHash } from "../utils/stable-hash.js";

/**
 * The single finding model.
 *
 * Every review surface in the product — continuity, AI-tells, deslop, runtime
 * state, long-span fatigue, contract compliance, sensitive words — is expected
 * to converge on this shape so that the review view, the commit gate and the
 * waiver log all read one vocabulary instead of a per-subsystem one.
 *
 * Two fields carry the weight:
 *
 * - `severity` and `blocking` are deliberately separate. Severity answers "how
 *   bad is this"; blocking answers "may this stop a commit". An upstream rule
 *   marked blocking is not automatically non-waivable in this product, and a
 *   warning recorded by a manual edit must not hard-stop the author.
 *
 * - `status` includes `unverified`. A failed, timed-out or unparsable check is
 *   not the same as a clean one, and the difference must survive into the data
 *   rather than being flattened into an empty list.
 */
export const FINDING_SOURCES = [
  "continuity",
  "ai-tells",
  "deslop",
  "state",
  "fatigue",
  "contract",
  "sensitive",
  "style",
  "legacy",
] as const;

export const FindingSourceSchema = z.enum(FINDING_SOURCES);
export type FindingSource = z.infer<typeof FindingSourceSchema>;

export const FindingSeveritySchema = z.enum(["critical", "warning", "info"]);
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

export const FindingScopeSchema = z.enum(["chapter", "book"]);
export type FindingScope = z.infer<typeof FindingScopeSchema>;

export const FindingStatusSchema = z.enum(["open", "waived", "resolved", "unverified"]);
export type FindingStatus = z.infer<typeof FindingStatusSchema>;

export const FindingEvidenceSchema = z.object({
  chapterNumber: z.number().int().min(1).optional(),
  chapterRange: z.tuple([z.number().int().min(1), z.number().int().min(1)]).optional(),
  quote: z.string().optional(),
  offset: z.number().int().min(0).optional(),
});
export type FindingEvidence = z.infer<typeof FindingEvidenceSchema>;

export const FindingWaiverSchema = z.object({
  by: z.string().min(1),
  reason: z.string().min(1),
  at: z.string().datetime(),
  /**
   * Hash of the evidence the waiver was granted against. When the passage it
   * referred to changes, the hash stops matching and the waiver is reported as
   * expired instead of silently disappearing.
   */
  basisHash: z.string().min(1),
});
export type FindingWaiver = z.infer<typeof FindingWaiverSchema>;

export const FindingSchema = z.object({
  id: z.string().min(1),
  source: FindingSourceSchema,
  rule: z.string().min(1),
  severity: FindingSeveritySchema,
  blocking: z.boolean(),
  scope: FindingScopeSchema,
  status: FindingStatusSchema,
  message: z.string(),
  suggestion: z.string().default(""),
  evidence: FindingEvidenceSchema.default({}),
  waiver: FindingWaiverSchema.optional(),
  policyVersion: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type Finding = z.infer<typeof FindingSchema>;

/** Context handed to a producer; enough to scope the work without leaking stores. */
export interface FindingContext {
  readonly bookId: string;
  readonly chapterNumber?: number;
  readonly policyVersion: string;
}

/**
 * The one interface a review source may implement.
 *
 * A producer reads a candidate and emits findings. It never writes canonical
 * state, never opens its own store and never decides that a commit may proceed —
 * those belong to the governance services in core.
 */
export interface FindingProducer {
  readonly source: FindingSource;
  produce(context: FindingContext): Promise<readonly Finding[]>;
}

/**
 * Whether a finding stops a commit.
 *
 * This is policy, not a property of how bad the finding is. Keeping it a named
 * function means the rule can be changed in one place once real calibration data
 * exists, and it keeps upstream "blocking" flags from silently becoming
 * non-waivable product errors.
 */
export function defaultBlockingPolicy(severity: FindingSeverity): boolean {
  return severity === "critical";
}

/** Whether an author may explicitly waive a finding, with a recorded reason. */
export function defaultWaivablePolicy(source: FindingSource): boolean {
  // Legacy entries carry no rule identity, so there is nothing stable to waive
  // against. Producers with a real rule id are waivable by default.
  return source !== "legacy";
}

/**
 * Findings that would stop a commit.
 *
 * Includes `unverified`: a check that never produced a verdict must not be
 * treated as clean. Only an explicit author decision (`waived`) or an actual fix
 * (`resolved`) clears a finding.
 */
export function blockingFindings(findings: readonly Finding[]): readonly Finding[] {
  return findings.filter(
    (finding) => finding.blocking && finding.status !== "waived" && finding.status !== "resolved",
  );
}

/** Findings that are open and would stop a commit because the check never ran. */
export function unverifiedFindings(findings: readonly Finding[]): readonly Finding[] {
  return findings.filter((finding) => finding.status === "unverified");
}

/**
 * Basis hash for a waiver: the hash of the evidence it was granted against.
 *
 * Single-sourced so the waive endpoint (which records it) and the commit gate
 * (which re-checks it against the current prose) cannot drift.
 */
export function waiverBasisHash(finding: Pick<Finding, "evidence">): string {
  return stableHash(finding.evidence.quote ?? "");
}

/**
 * Whether a waived finding's basis no longer holds against the current prose.
 *
 * A waiver is only valid while the passage it referred to is still there. Empty
 * evidence cannot be re-checked, so such waivers stay valid (the author's
 * explicit decision stands).
 */
export function isExpiredWaiver(finding: Finding, currentChapterText: string): boolean {
  if (finding.status !== "waived" || !finding.waiver) return false;
  const quote = finding.evidence.quote?.trim() ?? "";
  // Too short to identify a passage reliably; do not risk false positives.
  if (quote.length < 8) return false;
  if (finding.waiver.basisHash !== waiverBasisHash(finding)) return true;
  return !currentChapterText.includes(quote);
}
