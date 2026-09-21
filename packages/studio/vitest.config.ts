import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // Subpath aliases must precede the bare package alias: a string alias also
      // matches `<key>/...`, so the bare entry would otherwise swallow these.
      // The app/build resolves these subpaths via core's package.json "exports"
      // (browser-safe, zod-only); tests resolve them to source like the bare pkg.
      "@actalk/inkos-core/interactive-film/evaluator": resolve(__dirname, "../core/src/interactive-film/evaluator.ts"),
      "@actalk/inkos-core/interactive-film/graph-schema": resolve(__dirname, "../core/src/interactive-film/graph-schema.ts"),
      "@actalk/inkos-core/forecast/schema": resolve(__dirname, "../core/src/forecast/schema.ts"),
      "@actalk/inkos-core/findings": resolve(__dirname, "../core/src/findings/index.ts"),
      "@actalk/inkos-core": resolve(__dirname, "../core/src/index.ts"),
    },
  },
  test: {
    // `.test.tsx` files carry a `@vitest-environment jsdom` docblock; everything
    // else stays on the faster node environment.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    fileParallelism: false,
    // server.ts is large enough that first-load esbuild transforms can exceed
    // Vitest's default 5s timeout on a cold full-suite run.
    testTimeout: 30_000,
  },
});
