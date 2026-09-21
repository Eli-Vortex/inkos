import { describe, expect, it } from "vitest";
import { countCjk, formatNumber, formatPercent, formatSigned, formatTime, formatWords } from "./format";

describe("workbench formatting", () => {
  it("groups numerals so counts stay scannable", () => {
    expect(formatNumber(196400)).toBe("196,400");
    expect(formatWords(1000)).toBe("1,000 字");
  });

  it("keeps a delta signed and zero unsigned", () => {
    expect(formatSigned(340)).toBe("+340");
    expect(formatSigned(-120)).toBe("-120");
    expect(formatSigned(0)).toBe("0");
  });

  it("formats a completion ratio as a percentage", () => {
    expect(formatPercent(0.75)).toBe("75%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("counts CJK characters without counting whitespace", () => {
    // "灯河渡口" + "第三个人未到"
    expect(countCjk("灯河渡口\n\n第三个人未到")).toBe(10);
    expect(countCjk("   ")).toBe(0);
  });

  it("renders a clock time and falls back for missing or unparsable values", () => {
    expect(formatTime(null)).toBe("—");
    expect(formatTime("not-a-date")).toBe("not-a-date");
    // Timezone-independent: only the shape is asserted, never a fixed hour.
    expect(formatTime("2026-09-16T09:12:00+08:00")).toMatch(/^\d{2}:\d{2}$/);
  });
});
