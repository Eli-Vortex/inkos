import { describe, expect, it } from "vitest";
import {
  assertNoSkillIdConflicts,
  FindingProducerRegistry,
  findSkillIdConflicts,
  ProducerRegistrationError,
} from "../findings/registry.js";
import type { Finding, FindingProducer, FindingSource } from "../findings/types.js";

const producer = (source: FindingSource, findings: readonly Finding[] = []): FindingProducer => ({
  source,
  async produce() {
    return findings;
  },
});

describe("finding producer registry", () => {
  it("accepts one producer per source", () => {
    const registry = new FindingProducerRegistry();
    registry.register(producer("continuity"));
    registry.register(producer("deslop"));
    expect(registry.sources()).toEqual(["continuity", "deslop"]);
    expect(registry.has("state")).toBe(false);
  });

  it("refuses a second producer for the same source instead of replacing one", () => {
    const registry = new FindingProducerRegistry();
    registry.register(producer("continuity"));
    expect(() => registry.register(producer("continuity")))
      .toThrow(ProducerRegistrationError);
  });

  it("collects findings from every producer", async () => {
    const registry = new FindingProducerRegistry();
    const finding = (id: string): Finding => ({
      id,
      source: "continuity",
      rule: "continuity.x",
      severity: "warning",
      blocking: false,
      scope: "chapter",
      status: "open",
      message: "m",
      suggestion: "",
      evidence: {},
      policyVersion: "v",
      createdAt: new Date(0).toISOString(),
    });
    registry.register(producer("continuity", [finding("a")]));
    registry.register(producer("deslop", [finding("b")]));

    const collected = await registry.collect({ bookId: "b", policyVersion: "v" });
    expect(collected.map((item) => item.id).sort()).toEqual(["a", "b"]);
  });

  it("surfaces a throwing producer rather than silently dropping it", async () => {
    const registry = new FindingProducerRegistry();
    registry.register({
      source: "deslop",
      async produce(): Promise<readonly Finding[]> {
        throw new Error("checker exploded");
      },
    });
    await expect(registry.collect({ bookId: "b", policyVersion: "v" }))
      .rejects.toThrow("checker exploded");
  });
});

describe("skill id collision guard", () => {
  it("finds ids that would shadow an existing skill", () => {
    const conflicts = findSkillIdConflicts({
      incomingIds: ["story-long-write", "Novel-Adapter-New"],
      existingIds: ["story-long-write", "story-review"],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.incomingId).toBe("story-long-write");
  });

  it("matches case-insensitively, so casing cannot sneak a collision through", () => {
    const conflicts = findSkillIdConflicts({
      incomingIds: ["STORY-LONG-WRITE"],
      existingIds: ["story-long-write"],
    });
    expect(conflicts).toHaveLength(1);
  });

  it("throws with the offending names so the fix is obvious", () => {
    expect(() => assertNoSkillIdConflicts({
      incomingIds: ["story-deslop"],
      existingIds: ["story-deslop", "story-review"],
      adapterLabel: "novel-creation.oh-story.deslop",
    })).toThrow(/story-deslop/);
  });

  it("passes when every incoming id is new", () => {
    expect(() => assertNoSkillIdConflicts({
      incomingIds: ["novel-creation.oh-story.copy"],
      existingIds: ["story-deslop"],
      adapterLabel: "adapter",
    })).not.toThrow();
  });
});
