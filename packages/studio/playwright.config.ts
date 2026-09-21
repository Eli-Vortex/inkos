import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// The E2E project root is test-project, so the repository's own .agents/skills
// (the imported Oh Story skills) must be pointed at explicitly to mirror how the
// real app, which runs with the repository as its project root, loads them.
// Absolute paths keep both independent of the spawned process's working dir.
const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const E2E_PROJECT_ROOT = resolve(REPO_ROOT, "test-project");
const REPO_SKILLS_DIR = resolve(REPO_ROOT, ".agents/skills");

/**
 * E2E config.
 *
 * Two dedicated servers are started by Playwright itself (ports 4580/4581, kept
 * clear of the dev server on 4567/4569):
 *   - the Hono API server, with INKOS_AGENT_LLM_STUB=1 so the authoring agent
 *     always uses the deterministic stub and never makes a real LLM call;
 *   - the Vite client, which proxies /api to the API server.
 *
 * Both are declared as separate `webServer` entries instead of the previous
 * single bash `A=1 cmd & B ; kill %1` line, which only worked on Unix. Playwright
 * starts each entry with the given `env` and tears them down after the run, so
 * this behaves the same on Windows, macOS and Linux.
 */
export default defineConfig({
  testDir: "./e2e",
  // Rebuild @actalk/inkos-core before starting the E2E server. The API server
  // (tsx watch src/api/index.ts) imports core via its compiled dist/index.js,
  // not the TypeScript source. A stale dist causes runtime behaviour to diverge
  // from the sources. See e2e/global-setup.ts for details.
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  // Run specs serially against the single shared dev server. The authoring
  // agent flow streams a long SSE turn; with parallel workers, concurrent
  // specs hammering the one server starve that turn into a 60s timeout.
  workers: 1,
  use: {
    baseURL: "http://localhost:4580",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npx tsx watch --clear-screen=false src/api/index.ts",
      url: "http://localhost:4581/api/v1/project",
      reuseExistingServer: false,
      timeout: 120_000,
      cwd: ".",
      env: {
        ...process.env,
        INKOS_AGENT_LLM_STUB: "1",
        INKOS_STUDIO_PORT: "4581",
        INKOS_PROJECT_ROOT: E2E_PROJECT_ROOT,
        INKOS_SKILL_DIRS: REPO_SKILLS_DIR,
      },
    },
    {
      command: "npx vite --host --port 4580",
      url: "http://localhost:4580",
      reuseExistingServer: false,
      timeout: 120_000,
      cwd: ".",
      env: {
        ...process.env,
        INKOS_AGENT_LLM_STUB: "1",
        INKOS_STUDIO_PORT: "4581",
      },
    },
  ],
});
