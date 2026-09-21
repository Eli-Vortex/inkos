import { DeslopLinter, type DeslopFinding } from "../../pipeline/deslop-linter.js";
import type { Finding, FindingContext } from "../types.js";
import { externalFinding, mapExternalSeverity } from "./external-probe.js";

/**
 * Deslop as a finding producer.
 *
 * The pattern scanner already exists in this codebase, ported from Oh Story's
 * `story-deslop`. What was missing was a shape the rest of the product could
 * read: its results lived in a `DeslopFinding` type that nothing else
 * understood, so deslop output could not appear alongside continuity or contract
 * findings, could not be waived, and could not join the commit gate.
 *
 * This producer narrows that gap without touching the scanner. Note the severity
 * mapping: upstream marks patterns "blocking", but a prose-surface preference
 * must not hard-stop an author, so it lands as a warning. Promoting any rule to
 * blocking is a calibration decision, made once, in `mapExternalSeverity`.
 */

export const DESLOP_POLICY_VERSION = "deslop-v1";

export function deslopFindings(
  text: string,
  params: {
    readonly chapterNumber?: number;
    readonly policyVersion?: string;
    readonly createdAt?: string;
  } = {},
): readonly Finding[] {
  const policyVersion = params.policyVersion ?? DESLOP_POLICY_VERSION;
  const createdAt = params.createdAt ?? new Date(0).toISOString();
  const report = DeslopLinter.scan(text);

  return report.findings.map((entry: DeslopFinding) => externalFinding({
    source: "deslop",
    rule: `deslop.${entry.rule}`,
    severity: mapExternalSeverity(entry.type),
    chapterNumber: params.chapterNumber,
    message: entry.snippet
      ? `${entry.rule}：${entry.snippet}`
      : entry.rule,
    suggestion: entry.suggestion,
    quote: entry.snippet,
    policyVersion,
    createdAt,
  }));
}

/** The producer form, for registration alongside the other review sources. */
export function deslopProducer(readText: (context: FindingContext) => Promise<string>) {
  return {
    source: "deslop" as const,
    async produce(context: FindingContext): Promise<readonly Finding[]> {
      const text = await readText(context);
      return deslopFindings(text, {
        chapterNumber: context.chapterNumber,
        policyVersion: context.policyVersion,
        createdAt: new Date().toISOString(),
      });
    },
  };
}
