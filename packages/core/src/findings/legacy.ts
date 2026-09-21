import {
  defaultBlockingPolicy,
  defaultWaivablePolicy,
  type Finding,
  type FindingSeverity,
} from "./types.js";
import { stableHash } from "../utils/stable-hash.js";

/**
 * Reading the legacy audit summary.
 *
 * Chapters written before the finding model stored audits as flat strings of the
 * form `[severity] description`. Those strings are all that survives: the
 * category, suggestion and repair scope the reviewer originally produced were
 * dropped when they were flattened, and cannot be recovered here.
 *
 * So this reader is honest about what it cannot know. It recovers severity and
 * message, marks the entry `source: "legacy"` with an empty suggestion, and
 * leaves evidence at chapter granularity only. Callers must treat an empty
 * suggestion as "not recorded", not as "no advice".
 */

export const LEGACY_POLICY_VERSION = "legacy";

const SEVERITY_TAGS: Record<string, FindingSeverity> = {
  critical: "critical",
  error: "critical",
  block: "critical",
  warning: "warning",
  warn: "warning",
  info: "info",
  suggest: "info",
  advisory: "info",
};

const LEADING_TAG = /^\s*\[([^\]]+)\]\s*/;

/** Map one legacy severity tag onto the finding vocabulary. */
export function parseLegacySeverity(raw: string): FindingSeverity {
  const tag = raw.match(LEADING_TAG)?.[1]?.trim().toLowerCase() ?? "";
  return SEVERITY_TAGS[tag] ?? "warning";
}

/** Strip the leading `[severity]` tag, leaving the description. */
export function parseLegacyMessage(raw: string): string {
  return raw.replace(LEADING_TAG, "").trim() || raw.trim();
}

/**
 * Derive a finding id that is stable for a given (chapter, rule, message).
 *
 * Stability matters because waivers and deduplication key off the id. Note the
 * deliberate consequence: if the underlying message changes, the id changes too,
 * which is the correct behaviour — a waiver granted for one finding must not
 * silently cover a different one.
 */
export function findingId(parts: {
  readonly source: string;
  readonly rule: string;
  readonly chapterNumber?: number;
  readonly message: string;
}): string {
  const key = [parts.source, parts.rule, parts.chapterNumber ?? "-", parts.message].join("|");
  return `${parts.source}.${parts.rule}.${stableHash(key)}`;
}

export interface LegacyAuditSource {
  readonly number: number;
  readonly auditIssues?: readonly string[];
}

/**
 * Project a legacy `auditIssues` array into findings.
 *
 * Duplicate messages in the same chapter are disambiguated by an occurrence
 * suffix so the ids stay unique without depending on array position, which would
 * shift whenever an earlier entry is removed.
 */
export function auditIssueToFinding(raw: string, chapterNumber: number): Finding {
  const severity = parseLegacySeverity(raw);
  const message = parseLegacyMessage(raw);
  return {
    id: findingId({ source: "legacy", rule: "legacy.audit", chapterNumber, message }),
    source: "legacy",
    rule: "legacy.audit",
    severity,
    blocking: defaultBlockingPolicy(severity),
    scope: "chapter",
    status: "open",
    message,
    // Not recoverable: the reviewer's suggestion was dropped at write time.
    suggestion: "",
    evidence: { chapterNumber },
    policyVersion: LEGACY_POLICY_VERSION,
    createdAt: new Date(0).toISOString(),
  };
}

export function projectLegacyFindings(source: LegacyAuditSource): readonly Finding[] {
  const raw = source.auditIssues ?? [];
  const seen = new Map<string, number>();
  return raw.map((entry) => {
    const finding = auditIssueToFinding(entry, source.number);
    const occurrence = seen.get(finding.id) ?? 0;
    seen.set(finding.id, occurrence + 1);
    return occurrence === 0
      ? finding
      : { ...finding, id: `${finding.id}.${occurrence + 1}` };
  });
}

/** Whether an author may waive this finding. Legacy entries carry no stable rule. */
export function isWaivable(finding: Finding): boolean {
  return defaultWaivablePolicy(finding.source);
}
