import type { AuditIssue } from "../../agents/continuity.js";
import { defaultBlockingPolicy } from "../types.js";
import type { Finding } from "../types.js";
import { findingId } from "../legacy.js";

/**
 * Continuity audit results as findings.
 *
 * The auditor already returns structured issues (`severity`, `category`,
 * `description`, `suggestion`, `repairScope`). They used to be flattened into
 * `[severity] description` strings for the chapter index, which threw away the
 * category, the suggestion and the repair scope — the very fields the review
 * view needs. This keeps them intact and adds the location the string form lost.
 */

export const CONTINUITY_POLICY_VERSION = "continuity-v1";

export function auditIssuesToFindings(
  issues: ReadonlyArray<AuditIssue>,
  params: {
    readonly chapterNumber: number;
    readonly policyVersion?: string;
    readonly createdAt?: string;
  },
): readonly Finding[] {
  const policyVersion = params.policyVersion ?? CONTINUITY_POLICY_VERSION;
  const createdAt = params.createdAt ?? new Date(0).toISOString();

  return issues.map((issue) => {
    // The message is the description alone, so the index summary keeps its
    // established `[severity] description` shape and the legacy projection
    // reconstructs the same text. The category is carried by `rule`, which is
    // where a rule identity belongs and what the review view displays.
    const message = issue.description;
    return {
      id: findingId({
        source: "continuity",
        rule: `continuity.${slug(issue.category || "issue")}`,
        chapterNumber: params.chapterNumber,
        message,
      }),
      source: "continuity" as const,
      rule: `continuity.${slug(issue.category || "issue")}`,
      severity: issue.severity,
      blocking: defaultBlockingPolicy(issue.severity),
      scope: "chapter" as const,
      status: "open" as const,
      message,
      suggestion: issue.suggestion ?? "",
      evidence: { chapterNumber: params.chapterNumber },
      policyVersion,
      createdAt,
    };
  });
}

/**
 * The compatibility summary written into the chapter index.
 *
 * Kept in step with the findings so readers that still expect `string[]` see the
 * same verdicts, and so the legacy projection reconstructs equivalent findings
 * rather than a different set.
 */
export function auditIssuesToLegacySummary(
  issues: ReadonlyArray<AuditIssue>,
): readonly string[] {
  return issues.map((issue) => `[${issue.severity}] ${issue.description}`);
}

/**
 * The index summary, built from findings.
 *
 * This is the list of *active* problems. Waived and resolved findings are
 * dropped: the index summary has no field to carry "waived", so keeping the
 * line made index readers (the chapter list, CLI) treat an explicitly exempted
 * finding as still blocking while the commit gate — which reads the store —
 * allowed the commit. The store keeps the full history, including waivers and
 * their reasons, and the review surface reads it directly.
 */
export function findingsToLegacySummary(findings: readonly Finding[]): readonly string[] {
  return findings
    .filter((finding) => finding.status !== "waived" && finding.status !== "resolved")
    .map((finding) => `[${finding.severity}] ${finding.message}`);
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "");
  return normalized || "issue";
}
