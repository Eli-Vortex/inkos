#!/usr/bin/env node
/**
 * Stop the Novel Creation Studio dev servers by killing whatever is listening
 * on the web (4567) and api (4569) ports. Pairs with scripts/dev.mjs for the
 * case where the launcher was started detached (no Ctrl+C to press).
 */
import { execSync } from "node:child_process";

const ports = [
  process.env.INKOS_WEB_PORT ?? "4567",
  process.env.INKOS_STUDIO_PORT ?? "4569",
];

for (const port of ports) {
  let pids = [];
  try {
    const out = execSync(`netstat -ano -p tcp`, { encoding: "utf8" });
    pids = [...new Set(
      out.split(/\r?\n/)
        .filter((line) => line.includes("LISTENING") && line.includes(`:${port} `))
        .map((line) => line.trim().split(/\s+/).pop())
        .filter((pid) => pid && pid !== "0"),
    )];
  } catch {
    // netstat unavailable
  }
  if (pids.length === 0) {
    console.log(`:${port} not listening`);
    continue;
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
      console.log(`stopped pid ${pid} (:${port})`);
    } catch {
      console.log(`could not stop pid ${pid} (:${port})`);
    }
  }
}
