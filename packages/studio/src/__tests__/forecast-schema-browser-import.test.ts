import { describe, expect, it } from "vitest";

describe("browser-safe core imports", () => {
  it("loads the narrative forecast schema without the Node-heavy core root", async () => {
    const forecastSchema = await import("@actalk/inkos-core/forecast/schema");

    expect(forecastSchema.NarrativeForecastSchema).toBeDefined();
  });

  it("loads the finding model without the Node-heavy core root", async () => {
    // The workbench adapter projects findings in the browser. Importing these
    // from the core root drags `node:fs` into the client bundle and the whole
    // workbench fails to mount, so this subpath must stay free of Node modules.
    const findings = await import("@actalk/inkos-core/findings");

    expect(findings.projectChapterFindings).toBeTypeOf("function");
    expect(findings.blockingFindings).toBeTypeOf("function");
    expect(findings.isWaivable).toBeTypeOf("function");

    // And it must actually behave, not merely load.
    const projected = findings.projectChapterFindings({
      number: 1,
      auditIssues: ["[critical] 动机断裂", "[warning] 需复审"],
    });
    expect(projected).toHaveLength(2);
    expect(findings.blockingFindings(projected)).toHaveLength(1);
  });
});
