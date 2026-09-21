import { describe, expect, it } from "vitest";
import { blockingFindings, FindingSchema, unverifiedFindings } from "../findings/index.js";
import type { Finding } from "../findings/types.js";
import {
  externalProbeProducer,
  externalFinding,
  mapExternalSeverity,
  runExternalFindingProbe,
  type SpawnLike,
} from "../findings/producers/external-probe.js";
import { deslopFindings, DESLOP_POLICY_VERSION } from "../findings/producers/deslop.js";
import {
  auditIssuesToFindings,
  auditIssuesToLegacySummary,
} from "../findings/producers/continuity.js";
import { projectChapterFindings } from "../findings/projection.js";

const spec = {
  source: "style" as const,
  command: "node",
  args: ["check.js", "--json"],
  timeoutMs: 50,
  maxOutputBytes: 1024,
  policyVersion: "test-v1",
};

const context = { bookId: "b", chapterNumber: 7, policyVersion: "test-v1" };

/** A fake child whose events the test drives explicitly. */
function fakeChild() {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const state = { killed: false };
  const child = {
    stdout: { on: (event: string, listener: (...args: unknown[]) => void) => { listeners[`out:${event}`] = [listener]; } },
    stderr: { on: () => {} },
    on: (event: string, listener: (...args: unknown[]) => void) => { listeners[event] = [listener]; },
    kill: () => { state.killed = true; return true; },
  };
  return {
    child,
    state,
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners[event] ?? []) listener(...args);
    },
    emitStdout(chunk: string) {
      for (const listener of listeners["out:data"] ?? []) listener(Buffer.from(chunk));
    },
  };
}

const parseNone = () => [] as readonly Finding[];

describe("external probe guardrails", () => {
  it("passes the command and args without a shell string", async () => {
    const calls: Array<{ command: string; args: readonly string[]; shell: unknown }> = [];
    const fake = fakeChild();
    const spawnFn: SpawnLike = (command, args, options) => {
      calls.push({ command, args, shell: options.shell });
      return fake.child as never;
    };

    const promise = runExternalFindingProbe({ spec, context, parse: parseNone, spawnFn });
    fake.emit("close", 0);
    await promise;

    expect(calls[0]?.command).toBe("node");
    expect(calls[0]?.args).toEqual(["check.js", "--json"]);
    // shell:false is the whole point — no interpolation surface.
    expect(calls[0]?.shell).toBe(false);
  });

  it("reports a clean run as verified with no findings", async () => {
    const fake = fakeChild();
    const outcome = await (async () => {
      const p = runExternalFindingProbe({
        spec, context, parse: parseNone,
        spawnFn: (() => fake.child as never) as SpawnLike,
      });
      fake.emit("close", 0);
      return p;
    })();
    expect(outcome.verified).toBe(true);
    expect(outcome.findings).toEqual([]);
    expect(outcome.failure).toBeUndefined();
  });

  it("turns a timeout into an unverified, blocking finding and kills the child", async () => {
    const fake = fakeChild();
    const outcome = await runExternalFindingProbe({
      spec: { ...spec, timeoutMs: 5 },
      context,
      parse: parseNone,
      spawnFn: (() => fake.child as never) as SpawnLike,
    });
    expect(outcome.verified).toBe(false);
    expect(outcome.failure).toBe("timeout");
    expect(fake.state.killed).toBe(true);
    expect(unverifiedFindings(outcome.findings)).toHaveLength(1);
    // "Did not run" must block; it must never look like "found nothing".
    expect(blockingFindings(outcome.findings)).toHaveLength(1);
  });

  it("turns a non-zero exit into an unverified finding", async () => {
    const fake = fakeChild();
    const p = runExternalFindingProbe({
      spec, context, parse: parseNone,
      spawnFn: (() => fake.child as never) as SpawnLike,
    });
    fake.emit("close", 2);
    const outcome = await p;
    expect(outcome.failure).toBe("nonzero-exit");
    expect(blockingFindings(outcome.findings)).toHaveLength(1);
  });

  it("treats an unparsable payload as a failure, not as no findings", async () => {
    const fake = fakeChild();
    const p = runExternalFindingProbe({
      spec,
      context,
      parse: () => { throw new Error("expected an array"); },
      spawnFn: (() => fake.child as never) as SpawnLike,
    });
    fake.emitStdout("{not what we asked for");
    fake.emit("close", 0);
    const outcome = await p;
    expect(outcome.verified).toBe(false);
    expect(outcome.failure).toBe("invalid-output");
    expect(blockingFindings(outcome.findings)).toHaveLength(1);
  });

  it("discards oversized output instead of parsing it", async () => {
    const fake = fakeChild();
    const p = runExternalFindingProbe({
      spec: { ...spec, maxOutputBytes: 16 },
      context,
      parse: parseNone,
      spawnFn: (() => fake.child as never) as SpawnLike,
    });
    fake.emitStdout("x".repeat(64));
    const outcome = await p;
    expect(outcome.failure).toBe("oversized-output");
    expect(fake.state.killed).toBe(true);
  });

  it("reports a spawn failure rather than throwing", async () => {
    const outcome = await runExternalFindingProbe({
      spec,
      context,
      parse: parseNone,
      spawnFn: (() => { throw new Error("ENOENT"); }) as SpawnLike,
    });
    expect(outcome.failure).toBe("spawn-failed");
    expect(blockingFindings(outcome.findings)).toHaveLength(1);
  });

  it("never lets an upstream 'blocking' flag hard-stop the author", async () => {
    expect(mapExternalSeverity("blocking")).toBe("warning");
    expect(mapExternalSeverity("critical")).toBe("warning");
    expect(mapExternalSeverity("advisory")).toBe("info");
    expect(mapExternalSeverity(undefined)).toBe("warning");
    const finding = externalFinding({
      source: "style", rule: "style.x", severity: mapExternalSeverity("blocking"),
      chapterNumber: 1, message: "m", policyVersion: "v", createdAt: new Date(0).toISOString(),
    });
    expect(finding.blocking).toBe(false);
  });

  it("exposes the probe as a FindingProducer", async () => {
    const fake = fakeChild();
    const producer = externalProbeProducer({
      spec, parse: parseNone,
      spawnFn: (() => fake.child as never) as SpawnLike,
    });
    expect(producer.source).toBe("style");
    const p = producer.produce(context);
    fake.emit("close", 0);
    await expect(p).resolves.toEqual([]);
  });

  it("validates every produced finding against the schema", async () => {
    const fake = fakeChild();
    const p = runExternalFindingProbe({
      spec, context, parse: parseNone,
      spawnFn: (() => fake.child as never) as SpawnLike,
    });
    fake.emit("close", 1);
    const outcome = await p;
    for (const finding of outcome.findings) {
      expect(() => FindingSchema.parse(finding)).not.toThrow();
    }
  });
});

describe("continuity audit findings", () => {
  it("keeps the category, suggestion and repair scope the string form dropped", () => {
    const findings = auditIssuesToFindings([
      {
        severity: "critical",
        category: "pov-drift",
        description: "视角切到了配角",
        suggestion: "改回主角视角",
        repairScope: "local",
      },
    ], { chapterNumber: 12 });

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.severity).toBe("critical");
    expect(finding.blocking).toBe(true);
    expect(finding.rule).toBe("continuity.pov-drift");
    // The category is carried by the rule id; the message stays the verbatim
    // description so the index summary keeps its `[severity] description` shape.
    expect(finding.message).toBe("视角切到了配角");
    expect(finding.suggestion).toBe("改回主角视角");
    expect(finding.evidence.chapterNumber).toBe(12);
    expect(() => FindingSchema.parse(finding)).not.toThrow();
  });

  it("keeps the compatibility summary equivalent to the findings", () => {
    const issues = [
      { severity: "warning" as const, category: "pacing", description: "节奏拖沓", suggestion: "" },
      { severity: "info" as const, category: "style", description: "句式重复", suggestion: "" },
    ];
    const summary = auditIssuesToLegacySummary(issues);
    expect(summary).toEqual(["[warning] 节奏拖沓", "[info] 句式重复"]);

    // Projecting the summary back yields the same severities, so readers on the
    // old string format and readers on findings agree.
    const projected = projectChapterFindings({ number: 4, auditIssues: summary });
    expect(projected.map((finding) => finding.severity)).toEqual(["warning", "info"]);
  });

  it("does not let a prose-surface info issue block a commit", () => {
    const findings = auditIssuesToFindings([
      { severity: "info", category: "style", description: "句式", suggestion: "" },
    ], { chapterNumber: 1 });
    expect(blockingFindings(findings)).toHaveLength(0);
  });
});

describe("deslop producer", () => {
  it("projects the existing scanner into findings", () => {
    // The scanner's documented blocking pattern: an explicit not-is comparison.
    const text = "他不是害怕，而是愤怒。";
    const findings = deslopFindings(text, { chapterNumber: 3 });
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.source).toBe("deslop");
      expect(finding.policyVersion).toBe(DESLOP_POLICY_VERSION);
      expect(finding.evidence.chapterNumber).toBe(3);
      expect(() => FindingSchema.parse(finding)).not.toThrow();
    }
  });

  it("does not let a prose-surface rule block a commit", () => {
    const findings = deslopFindings("他不是害怕，而是愤怒。", { chapterNumber: 3 });
    expect(findings.every((finding) => finding.blocking === false)).toBe(true);
    expect(blockingFindings(findings)).toHaveLength(0);
  });

  it("returns nothing for clean prose, without claiming a verdict either way", () => {
    expect(deslopFindings("他推开门，风从河面吹进来。")).toEqual([]);
  });
});

