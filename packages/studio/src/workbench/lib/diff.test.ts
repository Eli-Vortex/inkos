import { describe, expect, it } from "vitest";
import { diffParagraphs, diffStats } from "./diff";

const kinds = (left: string, right: string) => diffParagraphs(left, right).map((line) => line.kind);

describe("paragraph diff", () => {
  it("marks identical text as unchanged", () => {
    const lines = diffParagraphs("甲\n乙", "甲\n乙");
    expect(lines.map((line) => line.kind)).toEqual(["same", "same"]);
    expect(diffStats(lines)).toEqual({ total: 2, added: 0, removed: 0, unchanged: 2 });
  });

  it("keeps the surrounding paragraphs when one is inserted", () => {
    const lines = diffParagraphs("甲\n丙", "甲\n乙\n丙");
    expect(lines.map((line) => line.kind)).toEqual(["same", "add", "same"]);
    const added = lines.find((line) => line.kind === "add");
    expect(added?.text).toBe("乙");
    expect(added?.leftNo).toBeNull();
    expect(added?.rightNo).toBe(2);
  });

  it("reports a deletion with a left line number only", () => {
    const removed = diffParagraphs("甲\n乙\n丙", "甲\n丙").filter((line) => line.kind === "del");
    expect(removed).toHaveLength(1);
    expect(removed[0].text).toBe("乙");
    expect(removed[0].leftNo).toBe(2);
    expect(removed[0].rightNo).toBeNull();
  });

  it("treats a rewritten paragraph as a removal plus an addition", () => {
    expect(kinds("甲", "乙").sort()).toEqual(["add", "del"]);
  });

  it("numbers each side independently", () => {
    const same = diffParagraphs("甲\n乙\n丙", "乙\n丙\n丁").filter((line) => line.kind === "same");
    expect(same.map((line) => [line.leftNo, line.rightNo])).toEqual([
      [2, 1],
      [3, 2],
    ]);
  });

  it("ignores blank lines so paragraph spacing never shows up as a change", () => {
    expect(kinds("\n\n甲\n\n", "甲")).toEqual(["same"]);
    expect(kinds("", "")).toEqual([]);
  });

  it("counts an empty-then-filled document as a single addition", () => {
    const lines = diffParagraphs("", "甲\n乙");
    expect(diffStats(lines)).toEqual({ total: 2, added: 2, removed: 0, unchanged: 0 });
  });
});
