import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectChapterFindings } from "../findings/projection.js";
import type { Finding } from "../findings/types.js";
import type { ChapterMeta } from "../models/chapter.js";
import {
  isWaiverStale,
  loadChapterFindings,
  readChapterFindings,
  saveChapterFindings,
  waiveChapterFinding,
} from "../state/chapter-findings-store.js";

const legacy = (chapterNumber: number, auditIssues: readonly string[]) =>
  projectChapterFindings({ number: chapterNumber, auditIssues });

const contractFinding = (chapterNumber: number): Finding => ({
  id: "contract.demo.1",
  source: "contract",
  rule: "contract.outline.missing",
  severity: "critical",
  blocking: true,
  scope: "chapter",
  status: "open",
  message: "缺少细纲",
  suggestion: "先生成细纲",
  evidence: { chapterNumber },
  policyVersion: "chapter-gate-v1",
  createdAt: new Date(0).toISOString(),
});

describe("chapter findings store", () => {
  let bookDir: string;

  beforeEach(async () => {
    bookDir = await mkdtemp(join(tmpdir(), "nc-findings-"));
  });

  afterEach(async () => {
    await rm(bookDir, { recursive: true, force: true });
  });

  it("returns null when nothing has been stored for the chapter", async () => {
    expect(await loadChapterFindings(bookDir, 3)).toBeNull();
  });

  it("round-trips findings, including evidence and policy version", async () => {
    const findings = [contractFinding(3)];
    await saveChapterFindings({ bookDir, chapterNumber: 3, findings });
    const stored = await loadChapterFindings(bookDir, 3);
    expect(stored?.chapterNumber).toBe(3);
    expect(stored?.findings).toEqual(findings);
  });

  it("writes one file per chapter, so chapters do not share a blob", async () => {
    await saveChapterFindings({ bookDir, chapterNumber: 1, findings: [contractFinding(1)] });
    await saveChapterFindings({ bookDir, chapterNumber: 2, findings: [contractFinding(2)] });
    expect((await loadChapterFindings(bookDir, 1))?.findings).toHaveLength(1);
    expect((await loadChapterFindings(bookDir, 2))?.findings).toHaveLength(1);
    // Saving chapter 2 must not have disturbed chapter 1.
    expect((await loadChapterFindings(bookDir, 1))?.findings[0]?.evidence)
      .toEqual({ chapterNumber: 1 });
  });

  it("falls back to projecting the legacy summary when no store exists", async () => {
    const result = await readChapterFindings({
      bookDir,
      chapterNumber: 5,
      legacyAuditIssues: ["[warning] 需要复审", "[critical] 断裂"],
    });
    expect(result.source).toBe("legacy");
    expect(result.findings.map((item) => item.severity)).toEqual(["warning", "critical"]);
  });

  it("prefers the store over the legacy summary once one exists", async () => {
    await saveChapterFindings({ bookDir, chapterNumber: 5, findings: [contractFinding(5)] });
    const result = await readChapterFindings({
      bookDir,
      chapterNumber: 5,
      legacyAuditIssues: ["[critical] 这条已被结构化记录取代"],
    });
    expect(result.source).toBe("store");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.rule).toBe("contract.outline.missing");
  });

  it("never reports a corrupt store as 'no findings'", async () => {
    // A corrupt file must fall back to legacy, not to an empty clean result.
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(bookDir, "chapters", "findings"), { recursive: true });
    await writeFile(join(bookDir, "chapters", "findings", "0009.json"), "{ not json", "utf-8");

    const result = await readChapterFindings({
      bookDir,
      chapterNumber: 9,
      legacyAuditIssues: ["[critical] 仍然存在"],
    });
    expect(result.source).toBe("legacy");
    expect(result.findings).toHaveLength(1);
  });
});

describe("waiving a finding", () => {
  let bookDir: string;

  beforeEach(async () => {
    bookDir = await mkdtemp(join(tmpdir(), "nc-waive-"));
  });

  afterEach(async () => {
    await rm(bookDir, { recursive: true, force: true });
  });

  it("records who, why, when and the evidence basis", async () => {
    const findings = [contractFinding(2)];
    await saveChapterFindings({ bookDir, chapterNumber: 2, findings });

    const result = await waiveChapterFinding({
      bookDir,
      chapterNumber: 2,
      findingId: "contract.demo.1",
      by: "作者",
      reason: "本章是一次有意的手写实验",
      basisHash: "abc123",
    });

    expect(result.ok).toBe(true);
    const waived = result.findings[0]!;
    expect(waived.status).toBe("waived");
    expect(waived.waiver).toMatchObject({
      by: "作者",
      reason: "本章是一次有意的手写实验",
      basisHash: "abc123",
    });
    // The waiver persisted.
    const stored = await loadChapterFindings(bookDir, 2);
    expect(stored?.findings[0]?.status).toBe("waived");
  });

  it("refuses to waive a legacy finding, which has no stable rule identity", async () => {
    const result = await waiveChapterFinding({
      bookDir,
      chapterNumber: 6,
      findingId: legacy(6, ["[warning] x"])[0]!.id,
      by: "作者",
      reason: "想跳过",
      basisHash: "h",
      legacyAuditIssues: ["[warning] x"],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not-waivable");
  });

  it("reports an unknown finding id instead of inventing a record", async () => {
    const result = await waiveChapterFinding({
      bookDir,
      chapterNumber: 6,
      findingId: "does-not-exist",
      by: "作者",
      reason: "x",
      basisHash: "h",
      legacyAuditIssues: [],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not-found");
  });

  it("is idempotent about an already-waived finding", async () => {
    await saveChapterFindings({
      bookDir,
      chapterNumber: 2,
      findings: [contractFinding(2)],
    });
    await waiveChapterFinding({
      bookDir, chapterNumber: 2, findingId: "contract.demo.1",
      by: "作者", reason: "理由", basisHash: "h",
    });
    const second = await waiveChapterFinding({
      bookDir, chapterNumber: 2, findingId: "contract.demo.1",
      by: "作者", reason: "理由", basisHash: "h",
    });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("already-waived");
  });

  it("detects a waiver whose evidence basis has since changed", async () => {
    await saveChapterFindings({ bookDir, chapterNumber: 2, findings: [contractFinding(2)] });
    const waived = await waiveChapterFinding({
      bookDir, chapterNumber: 2, findingId: "contract.demo.1",
      by: "作者", reason: "理由", basisHash: "old-hash",
    });
    const finding = waived.findings[0]!;
    expect(isWaiverStale(finding, "old-hash")).toBe(false);
    // The passage changed → the author should reconfirm, not be silently covered.
    expect(isWaiverStale(finding, "new-hash")).toBe(true);
  });

  it("refreshes the chapter index summary so index readers stop seeing a waived blocker", async () => {
    await saveChapterFindings({ bookDir, chapterNumber: 2, findings: [contractFinding(2)] });
    let index: ChapterMeta[] = [{
      number: 2,
      title: "第2章",
      status: "ready-for-review",
      wordCount: 0,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      auditIssues: ["[critical] 缺少细纲"],
      lengthWarnings: [],
    }];

    const result = await waiveChapterFinding({
      bookDir,
      chapterNumber: 2,
      findingId: "contract.demo.1",
      by: "作者",
      reason: "有意省略细纲",
      basisHash: "h",
      syncIndex: {
        loadChapterIndex: async () => index,
        saveChapterIndex: async (next) => { index = [...next]; },
      },
    });

    expect(result.ok).toBe(true);
    // The store retains the waived finding; the index summary drops it.
    expect((await loadChapterFindings(bookDir, 2))?.findings[0]?.status).toBe("waived");
    expect(index[0]?.auditIssues).toEqual([]);
  });
});
