import { spawn as nodeSpawn, type SpawnOptions } from "node:child_process";
import {
  defaultBlockingPolicy,
  type Finding,
  type FindingContext,
  type FindingProducer,
  type FindingSeverity,
  type FindingSource,
} from "../types.js";
import { findingId } from "../legacy.js";

/**
 * The governed way to take review input from outside this codebase.
 *
 * An external checker — the Oh Story deslop script is the first one — runs as a
 * separate process. That makes it untrusted by construction, so the rules here
 * are deliberately strict:
 *
 *   - the executable and its arguments are passed as an array; there is no shell
 *     string to interpolate into;
 *   - a timeout is mandatory, and the child is killed rather than abandoned;
 *   - output is bounded before it is parsed;
 *   - any failure — spawn, timeout, non-zero exit, unparsable or oversized
 *     output — becomes an `unverified` finding that blocks, because a check that
 *     did not run must never be indistinguishable from a check that passed.
 *
 * The probe can only ever *read* and *emit findings*. It holds no state and
 * cannot write canonical data, which is what keeps a second project from
 * growing a second store inside this one.
 */

export const EXTERNAL_PROBE_POLICY_VERSION = "external-probe-v1";

export type ExternalProbeFailure =
  | "spawn-failed"
  | "timeout"
  | "nonzero-exit"
  | "invalid-output"
  | "oversized-output";

export interface ExternalProbeSpec {
  readonly source: FindingSource;
  /** The executable to run. Never a shell command line. */
  readonly command: string;
  /** Arguments passed verbatim to the executable. */
  readonly args: readonly string[];
  readonly timeoutMs: number;
  /** Output above this size is discarded rather than parsed. */
  readonly maxOutputBytes: number;
  readonly policyVersion: string;
  readonly cwd?: string;
  /** Extra environment entries; merged over the inherited environment. */
  readonly env?: Readonly<Record<string, string>>;
}

export interface ExternalProbeOutcome {
  readonly findings: readonly Finding[];
  /** True only when the probe actually produced a verdict. */
  readonly verified: boolean;
  readonly failure?: ExternalProbeFailure;
}

/** Minimal spawn surface, injectable so the failure paths are testable. */
export type SpawnLike = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => {
  readonly stdout?: { on(event: "data", listener: (chunk: unknown) => void): void } | null;
  readonly stderr?: { on(event: "data", listener: (chunk: unknown) => void): void } | null;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: (code: number | null, signal: string | null) => unknown): unknown;
  kill(signal?: NodeJS.Signals | number): boolean;
};

function failureFinding(params: {
  readonly source: FindingSource;
  readonly policyVersion: string;
  readonly chapterNumber?: number;
  readonly failure: ExternalProbeFailure;
  readonly detail: string;
}): Finding {
  const message = `外部检查未完成（${params.failure}）：${params.detail}`;
  return {
    id: findingId({
      source: params.source,
      rule: `${params.source}.probe.${params.failure}`,
      chapterNumber: params.chapterNumber,
      message,
    }),
    source: params.source,
    rule: `${params.source}.probe.${params.failure}`,
    severity: "critical",
    // A check that did not run blocks. Treating "unknown" as "clean" is the one
    // failure mode this whole model exists to prevent.
    blocking: defaultBlockingPolicy("critical"),
    scope: params.chapterNumber === undefined ? "book" : "chapter",
    status: "unverified",
    message,
    suggestion: "确认外部检查工具可用后重试；也可显式豁免并说明理由。",
    evidence: params.chapterNumber === undefined ? {} : { chapterNumber: params.chapterNumber },
    policyVersion: params.policyVersion,
    createdAt: new Date(0).toISOString(),
  };
}

/**
 * Run an external checker and map its verdict into findings.
 *
 * `parse` receives the raw stdout and returns findings, or throws when the
 * payload is not what the adapter expects — a throw is treated as
 * `invalid-output`, never as "no findings".
 */
export async function runExternalFindingProbe(params: {
  readonly spec: ExternalProbeSpec;
  readonly context: FindingContext;
  readonly parse: (stdout: string, context: FindingContext) => readonly Finding[];
  readonly spawnFn?: SpawnLike;
  readonly createdAt?: string;
}): Promise<ExternalProbeOutcome> {
  const { spec, context } = params;
  const spawnFn = (params.spawnFn ?? (nodeSpawn as unknown as SpawnLike));
  const createdAt = params.createdAt ?? new Date().toISOString();

  return new Promise<ExternalProbeOutcome>((resolve) => {
    let settled = false;
    let stdout = "";
    let oversized = false;
    // Declared before any failure path can run: a spawn error must be able to
    // settle the probe, and it happens before the timer would be assigned.
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (outcome: ExternalProbeOutcome) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(outcome);
    };

    const fail = (failure: ExternalProbeFailure, detail: string) => {
      finish({
        verified: false,
        failure,
        findings: [
          {
            ...failureFinding({
              source: spec.source,
              policyVersion: spec.policyVersion,
              chapterNumber: context.chapterNumber,
              failure,
              detail,
            }),
            createdAt,
          },
        ],
      });
    };

    let child: ReturnType<SpawnLike>;
    try {
      child = spawnFn(spec.command, [...spec.args], {
        shell: false,
        cwd: spec.cwd,
        env: { ...process.env, ...spec.env },
        windowsHide: true,
      });
    } catch (error) {
      fail("spawn-failed", error instanceof Error ? error.message : String(error));
      return;
    }

    timer = setTimeout(() => {
      // Kill rather than orphan: a hung checker must not outlive its turn.
      try {
        child.kill("SIGKILL");
      } catch {
        // Already gone.
      }
      fail("timeout", `超过 ${spec.timeoutMs}ms 未返回，已终止该检查进程。`);
    }, spec.timeoutMs);

    child.stdout?.on("data", (chunk) => {
      if (oversized) return;
      stdout += String(chunk);
      if (stdout.length > spec.maxOutputBytes) {
        oversized = true;
        try {
          child.kill("SIGKILL");
        } catch {
          // Already gone.
        }
        fail("oversized-output", `输出超过 ${spec.maxOutputBytes} 字节上限。`);
      }
    });
    child.stderr?.on("data", () => {
      // Diagnostics from the tool are not findings; the exit code decides.
    });

    child.on("error", (error) => {
      fail("spawn-failed", error.message);
    });

    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        fail("nonzero-exit", `检查进程以退出码 ${code ?? "null"} 结束。`);
        return;
      }
      let findings: readonly Finding[];
      try {
        findings = params.parse(stdout, context);
      } catch (error) {
        fail("invalid-output", error instanceof Error ? error.message : String(error));
        return;
      }
      finish({
        verified: true,
        findings: findings.map((finding) => ({ ...finding, createdAt })),
      });
    });
  });
}

/**
 * Map an upstream rule severity onto the finding vocabulary.
 *
 * Upstream "blocking" is advisory here by default. The reference project's
 * blocking rules are not automatically this product's non-waivable errors, and
 * style preferences must never stop an author from keeping an expression they
 * chose — so nothing mapped through this function blocks until calibration says
 * otherwise.
 */
export function mapExternalSeverity(raw: string | undefined): FindingSeverity {
  switch ((raw ?? "").trim().toLowerCase()) {
    case "blocking":
    case "critical":
    case "error":
      return "warning";
    case "advisory":
    case "info":
      return "info";
    default:
      return "warning";
  }
}

/** Build a finding from an external checker's own report shape. */
export function externalFinding(params: {
  readonly source: FindingSource;
  readonly rule: string;
  readonly severity: FindingSeverity;
  readonly chapterNumber?: number;
  readonly message: string;
  readonly suggestion?: string;
  readonly quote?: string;
  readonly policyVersion: string;
  readonly createdAt: string;
}): Finding {
  return {
    id: findingId({
      source: params.source,
      rule: params.rule,
      chapterNumber: params.chapterNumber,
      message: params.message,
    }),
    source: params.source,
    rule: params.rule,
    severity: params.severity,
    blocking: defaultBlockingPolicy(params.severity),
    scope: params.chapterNumber === undefined ? "book" : "chapter",
    status: "open",
    message: params.message,
    suggestion: params.suggestion ?? "",
    evidence: {
      ...(params.chapterNumber === undefined ? {} : { chapterNumber: params.chapterNumber }),
      ...(params.quote ? { quote: params.quote } : {}),
    },
    policyVersion: params.policyVersion,
    createdAt: params.createdAt,
  };
}

/** Wrap an external probe as a `FindingProducer`, the only shape core consumes. */
export function externalProbeProducer(params: {
  readonly spec: ExternalProbeSpec;
  readonly parse: (stdout: string, context: FindingContext) => readonly Finding[];
  readonly spawnFn?: SpawnLike;
}): FindingProducer {
  return {
    source: params.spec.source,
    async produce(context: FindingContext) {
      const outcome = await runExternalFindingProbe({
        spec: params.spec,
        context,
        parse: params.parse,
        spawnFn: params.spawnFn,
      });
      return outcome.findings;
    },
  };
}
