import { describe, expect, it } from "vitest";
import { DEFAULT_WORKBENCH_AREA, WORKBENCH_AREAS, isWorkbenchArea } from "./areas";

describe("workbench areas", () => {
  it("lists the eleven workbench surfaces in navigation order", () => {
    expect(WORKBENCH_AREAS).toEqual([
      "books",
      "writing",
      "outline",
      "review",
      "compare",
      "commit",
      "tasks",
      "research",
      "analytics",
      "export",
      "settings",
    ]);
  });

  it("accepts every declared area", () => {
    for (const area of WORKBENCH_AREAS) {
      expect(isWorkbenchArea(area)).toBe(true);
    }
  });

  it("rejects unknown, empty and missing values so the router falls back", () => {
    expect(isWorkbenchArea("chapter")).toBe(false);
    expect(isWorkbenchArea("")).toBe(false);
    expect(isWorkbenchArea(undefined)).toBe(false);
    expect(isWorkbenchArea(null)).toBe(false);
  });

  it("defaults to the writing workspace, which must itself be a real area", () => {
    expect(DEFAULT_WORKBENCH_AREA).toBe("writing");
    expect(isWorkbenchArea(DEFAULT_WORKBENCH_AREA)).toBe(true);
  });
});
