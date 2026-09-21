import { describe, expect, it } from "vitest";
import { createSaveSequencer } from "./save-sequencer";

describe("save sequencer", () => {
  it("only lets the newest request settle the buffer", () => {
    const sequencer = createSaveSequencer();
    const first = sequencer.begin();
    const second = sequencer.begin();
    // The first response arrives late: it must not overwrite newer text.
    expect(sequencer.isCurrent(first)).toBe(false);
    expect(sequencer.isCurrent(second)).toBe(true);
  });

  it("retires the previous request as soon as a new one opens", () => {
    const sequencer = createSaveSequencer();
    const first = sequencer.begin();
    expect(sequencer.isCurrent(first)).toBe(true);
    const second = sequencer.begin();
    expect(sequencer.isCurrent(first)).toBe(false);
    expect(sequencer.isCurrent(second)).toBe(true);
  });

  it("never reuses a sequence number", () => {
    const sequencer = createSaveSequencer();
    const seen = new Set<number>();
    for (let index = 0; index < 8; index += 1) {
      const seq = sequencer.begin();
      expect(seen.has(seq)).toBe(false);
      seen.add(seq);
    }
    expect(sequencer.current()).toBe(8);
  });

  it("rejects an unknown sequence number", () => {
    const sequencer = createSaveSequencer();
    expect(sequencer.isCurrent(0)).toBe(false);
    expect(sequencer.isCurrent(99)).toBe(false);
  });
});
