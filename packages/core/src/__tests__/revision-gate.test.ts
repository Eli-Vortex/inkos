import { describe, expect, it } from "vitest";
import { resolveRevisionGate } from "../models/book.js";

describe("resolveRevisionGate", () => {
  it("book-level revisionGate overrides project-level revisionGate", () => {
    expect(resolveRevisionGate(
      { writing: { revisionGate: "always" } },
      { revisionGate: "lenient" },
    )).toBe("always");

    expect(resolveRevisionGate(
      { writing: { revisionGate: "strict" } },
      { revisionGate: "always" },
    )).toBe("strict");
  });

  it("falls back to project-level revisionGate when book does not set one", () => {
    expect(resolveRevisionGate({}, { revisionGate: "lenient" })).toBe("lenient");
    expect(resolveRevisionGate(
      { writing: {} },
      { revisionGate: "always" },
    )).toBe("always");
  });

  it("defaults to lenient when neither book nor project sets a revisionGate", () => {
    // Manual revisions are user-initiated; "lenient" applies them unless the
    // audit worsens. "strict" silently discarded polish/rewrite on clean chapters.
    expect(resolveRevisionGate({})).toBe("lenient");
    expect(resolveRevisionGate({ writing: {} }, {})).toBe("lenient");
  });
});
