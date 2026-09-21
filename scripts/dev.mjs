#!/usr/bin/env node
/**
 * Novel Creation Studio — single-command dev launcher.
 *
 * Runs the API (tsx watch, port 4569) and the Vite client (port 4567) in ONE
 * terminal, prefixes their logs, and tears both down on Ctrl+C. This replaces
 * the Unix-only `dev` script in packages/studio/package.json
 * (`ENV=v cmd & vite ; kill %1`), which cannot run in PowerShell.
 *
 *   node scripts/dev.mjs        # start both
 *   Ctrl+C                      # stop both
 */
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const studio = resolve(root, "packages/studio");
const API_PORT = process.env.INKOS_STUDIO_PORT ?? "4569";
const WEB_PORT = process.env.INKOS_WEB_PORT ?? "4567";

/** Kill a process and its children (npx -> tsx -> node / node -> vite). */
function killTree(pid) {
  if (pid === undefined) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGTERM");
    }
  } catch {
    // Already gone.
  }
}

const children = [];
let shuttingDown = false;

function start(name, args, extraEnv) {
  const child = spawn("npx", args, {
    cwd: studio,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });
  children.push(child);
  const tag = name.padEnd(3);
  const pipe = (stream) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) process.stdout.write(`[${tag}] ${line}\n`);
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code) => {
    if (shuttingDown) return;
    process.stdout.write(`[${tag}] exited with code ${code}\n`);
    shutdown(code ?? 0);
  });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) killTree(child.pid);
  setTimeout(() => process.exit(code), 150);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(`Novel Creation Studio`);
console.log(`  web: http://localhost:${WEB_PORT}`);
console.log(`  api: http://127.0.0.1:${API_PORT}`);
console.log(`  (Ctrl+C stops both)\n`);

start("api", ["tsx", "watch", "--clear-screen=false", "src/api/index.ts"], {
  INKOS_STUDIO_PORT: API_PORT,
  INKOS_PROJECT_ROOT: root,
});
start("web", ["vite", "--port", WEB_PORT], {});
