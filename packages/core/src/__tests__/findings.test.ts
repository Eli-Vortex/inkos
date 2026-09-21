import { describe, expect, it } from "vitest";
import {
  auditIssueToFinding,
  countBlockingFindings,
  countUnverifiedFindings,
  defaultBlockingPolicy,
  defaultWaivablePolicy,
  findingId,
  isWaivable,
  parseLegacyMessage,
  parseLegacySeverity,
  projectChapterFindings,
  projectLegacyFindings,
  unverifiedFindings,
  FindingSchema,
  type Finding,
} from "../findings/index.js";

const chapter = (auditIssues: readonly string[]) => ({ number: 7, auditIssues });

describe("legacy severity parsing", () => {
  it("maps the documented tags onto the finding vocabulary", () => {
    expect(parseLegacySeverity("[critical] 动机断裂")).toBe("critical");
    expect(parseLegacySeverity("[warning] 需要复审")).toBe("warning");
    expect(parseLegacySeverity("[info] prose surface")).toBe("info");
  });

  it("accepts the wider historical vocabulary without inventing critical", () => {
    // "error" and "block" were used by other subsystems for the same urgency.
    expect(parseLegacySeverity("[error] state mismatch")).toBe("critical");
    expect(parseLegacySeverity("[block] sensitive term")).toBe("critical");
    // Unknown or missing tags degrade to warning, never to critical.
    expect(parseLegacySeverity("[nonsense] x")).toBe("warning");
    expect(parseLegacySeverity("no tag at all")).toBe("warning");
    expect(parseLegacySeverity("")).toBe("warning");
  });

  it("strips the tag to leave the description", () => {
    expect(parseLegacyMessage("[critical] 动机断裂")).toBe("动机断裂");
    expect(parseLegacyMessage("  [warning]   spacing  ")).toBe("spacing");
    expect(parseLegacyMessage("bare message")).toBe("bare message");
  });
});

describe("legacy finding projection", () => {
  it("keeps blocking aligned with the pre-existing behaviour", () => {
    // Before the finding model, only critical entries stopped a commit.
    const findings = projectLegacyFindings(chapter([
      "[critical] a",
      "[warning] b",
      "[info] c",
    ]));
    expect(findings.map((finding) => finding.blocking)).toEqual([true, false, false]);
    expect(countBlockingFindings(findings)).toBe(1);
  });

  it("is explicit that legacy entries cannot supply a suggestion", () => {
    const finding = auditIssueToFinding("[warning] 手动替换需要复审", 3);
    expect(finding.source).toBe("legacy");
    expect(finding.policyVersion).toBe("legacy");
    expect(finding.suggestion).toBe("");
    expect(finding.evidence).toEqual({ chapterNumber: 3 });
    expect(isWaivable(finding)).toBe(false);
  });

  it("produces stable ids for the same chapter and message", () => {
    const first = auditIssueToFinding("[warning] 同一个问题", 4);
    const second = auditIssueToFinding("[warning] 同一个问题", 4);
    expect(first.id).toBe(second.id);
    // A different chapter or message must not collide.
    expect(auditIssueToFinding("[warning] 同一个问题", 5).id).not.toBe(first.id);
    expect(auditIssueToFinding("[warning] 另一个问题", 4).id).not.toBe(first.id);
  });

  it("disambiguates duplicate messages without depending on array position", () => {
    const findings = projectLegacyFindings(chapter(["[warning] dup", "[warning] dup"]));
    expect(new Set(findings.map((finding) => finding.id)).size).toBe(2);
  });

  it("validates every projected entry against the persisted schema", () => {
    const findings = projectChapterFindings(chapter([
      "[critical] a",
      "[warning] b",
      "untagged legacy entry",
    ]));
    for (const finding of findings) {
      expect(() => FindingSchema.parse(finding)).not.toThrow();
    }
  });

  it("survives an empty or absent audit summary", () => {
    expect(projectChapterFindings({ number: 1 })).toEqual([]);
    expect(projectChapterFindings({ number: 1, auditIssues: [] })).toEqual([]);
  });
});

describe("finding policy helpers", () => {
  it("keeps severity and blocking separate", () => {
    expect(defaultBlockingPolicy("critical")).toBe(true);
    expect(defaultBlockingPolicy("warning")).toBe(false);
    expect(defaultBlockingPolicy("info")).toBe(false);
  });

  it("does not allow waiving entries with no stable rule identity", () => {
    expect(defaultWaivablePolicy("legacy")).toBe(false);
    expect(defaultWaivablePolicy("contract")).toBe(true);
  });

  it("reports unverified findings separately from clean results", () => {
    const unverified: Finding = {
      ...auditIssueToFinding("[warning] check timed out", 2),
      source: "deslop",
      rule: "deslop.timeout",
      status: "unverified",
      blocking: true,
      message: "去 AI 味检查未完成",
    };
    const findings: readonly Finding[] = [
      ...projectLegacyFindings(chapter([])),
      unverified,
    ];
    expect(unverifiedFindings(findings)).toHaveLength(1);
    // An unverified check must be counted as blocking, not as clean.
    expect(countBlockingFindings(findings)).toBe(1);
    expect(countUnverifiedFindings(findings)).toBe(1);
  });

  it("an empty result and an unverified result are distinguishable", () => {
    const clean: readonly Finding[] = projectLegacyFindings(chapter([]));
    const failed: readonly Finding[] = [{
      ...auditIssueToFinding("[warning] x", 1),
      source: "deslop",
      rule: "deslop.timeout",
      status: "unverified",
    }];
    // Both have no open blocking findings; only the failure is "not verified".
    expect(countUnverifiedFindings(clean)).toBe(0);
    expect(countUnverifiedFindings(failed)).toBe(1);
  });
});
