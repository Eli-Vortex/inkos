import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { TranscriptEventSchema, type TranscriptEvent } from "./session-transcript-schema.js";
import type { SessionKind, TranscriptRole } from "./session-transcript-schema.js";
import { commitAtomicFileSet } from "../utils/atomic-file-set.js";

const SESSIONS_DIR = ".inkos/sessions";
const appendQueues = new Map<string, Promise<void>>();

/**
 * Parsed-transcript cache keyed by session.
 *
 * The transcript is read (and Zod-parsed line by line) on every append and on
 * every turn's `latestCommittedSeq`. That made a session O(n²) over its life.
 * A JSONL file only ever grows by append, so a size+mtime match means the cached
 * parse is still current and the expensive read/parse can be skipped.
 */
interface TranscriptCacheEntry {
  readonly events: TranscriptEvent[];
  readonly size: number;
  readonly mtimeMs: number;
}
const transcriptCache = new Map<string, TranscriptCacheEntry>();

/** Drop the cached parse for a session after an out-of-band rewrite/delete. */
export function invalidateTranscriptCache(projectRoot: string, sessionId: string): void {
  transcriptCache.delete(`${projectRoot}:${sessionId}`);
}

/**
 * A cheap change token for a session transcript (`size:mtime`), or null when the
 * file is absent. Callers cache derived values against this instead of re-reading
 * the whole transcript on every list refresh.
 */
export async function transcriptVersion(
  projectRoot: string,
  sessionId: string,
): Promise<string | null> {
  try {
    const fileStat = await stat(transcriptPath(projectRoot, sessionId));
    return `${fileStat.size}:${fileStat.mtimeMs}`;
  } catch {
    return null;
  }
}

export function sessionsDir(projectRoot: string): string {
  return join(projectRoot, SESSIONS_DIR);
}

export function transcriptPath(projectRoot: string, sessionId: string): string {
  return join(sessionsDir(projectRoot), `${sessionId}.jsonl`);
}

export function legacyBookSessionPath(projectRoot: string, sessionId: string): string {
  return join(sessionsDir(projectRoot), `${sessionId}.json`);
}

export async function readTranscriptEvents(
  projectRoot: string,
  sessionId: string,
): Promise<TranscriptEvent[]> {
  const key = `${projectRoot}:${sessionId}`;
  const path = transcriptPath(projectRoot, sessionId);

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(path);
  } catch {
    transcriptCache.delete(key);
    return [];
  }
  const cached = transcriptCache.get(key);
  if (cached && cached.size === fileStat.size && cached.mtimeMs === fileStat.mtimeMs) {
    return cached.events;
  }

  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    transcriptCache.delete(key);
    return [];
  }

  const events: TranscriptEvent[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = TranscriptEventSchema.safeParse(JSON.parse(line));
      if (parsed.success) events.push(parsed.data);
    } catch {
      continue;
    }
  }

  const sorted = events.sort((a, b) => a.seq - b.seq);
  transcriptCache.set(key, { events: sorted, size: fileStat.size, mtimeMs: fileStat.mtimeMs });
  return sorted;
}

export async function nextTranscriptSeq(projectRoot: string, sessionId: string): Promise<number> {
  const events = await readTranscriptEvents(projectRoot, sessionId);
  return events.reduce((max, event) => Math.max(max, event.seq), 0) + 1;
}

export async function appendTranscriptEvent(
  projectRoot: string,
  event: TranscriptEvent,
): Promise<void> {
  await appendTranscriptEvents(projectRoot, event.sessionId, () => [event]);
}

export async function appendTranscriptEvents(
  projectRoot: string,
  sessionId: string,
  buildEvents: (context: {
    readonly events: ReadonlyArray<TranscriptEvent>;
    readonly nextSeq: number;
  }) => ReadonlyArray<TranscriptEvent> | Promise<ReadonlyArray<TranscriptEvent>>,
): Promise<TranscriptEvent[]> {
  const key = `${projectRoot}:${sessionId}`;
  const previous = appendQueues.get(key) ?? Promise.resolve();
  let result: TranscriptEvent[] = [];

  const next = previous.then(async () => {
    const events = await readTranscriptEvents(projectRoot, sessionId);
    const nextSeq = events.reduce((max, event) => Math.max(max, event.seq), 0) + 1;
    const built = await buildEvents({ events, nextSeq });
    result = built.map((event) => TranscriptEventSchema.parse(event));
    if (result.length === 0) return;

    await mkdir(sessionsDir(projectRoot), { recursive: true });
    const path = transcriptPath(projectRoot, sessionId);
    await appendFile(
      path,
      `${result.map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf-8",
    );
    // Refresh the parse cache in place so the next append/turn does not re-read
    // and re-parse the whole file. `events` is already the current full history.
    try {
      const after = await stat(path);
      transcriptCache.set(key, {
        events: [...events, ...result],
        size: after.size,
        mtimeMs: after.mtimeMs,
      });
    } catch {
      invalidateTranscriptCache(projectRoot, sessionId);
    }
  });

  appendQueues.set(key, next.catch(() => undefined));
  await next;
  return result;
}

/**
 * Drop the last `dropTurns` request turns from a session transcript.
 *
 * This is chat "rewind": an unsatisfactory reply — and the user turn that
 * prompted it — is removed so the author can send a different message. Whole
 * request turns are removed together (request_started/message/toolResult/
 * request_committed all carry the same `requestId`), so the transcript stays
 * reconstructable. The rewrite is atomic and the parse cache is invalidated.
 */
export async function truncateTranscriptTurns(
  projectRoot: string,
  sessionId: string,
  dropTurns: number,
): Promise<number> {
  const events = await readTranscriptEvents(projectRoot, sessionId);
  const requestIds: string[] = [];
  for (const event of events) {
    const requestId = (event as { requestId?: unknown }).requestId;
    if (typeof requestId === "string" && !requestIds.includes(requestId)) {
      requestIds.push(requestId);
    }
  }
  const dropCount = Math.max(0, Math.min(requestIds.length, Math.floor(dropTurns)));
  if (dropCount === 0) return 0;

  const drop = new Set(requestIds.slice(requestIds.length - dropCount));
  const kept = events.filter((event) => {
    const requestId = (event as { requestId?: unknown }).requestId;
    return typeof requestId !== "string" || !drop.has(requestId);
  });

  await commitAtomicFileSet({
    rootDir: sessionsDir(projectRoot),
    writes: [{
      relativePath: `${sessionId}.jsonl`,
      content: kept.length > 0 ? `${kept.map((event) => JSON.stringify(event)).join("\n")}\n` : "",
    }],
  });
  invalidateTranscriptCache(projectRoot, sessionId);
  return dropCount;
}

export function transcriptRoleForMessage(message: AgentMessage): TranscriptRole | null {
  if (!message || typeof message !== "object" || !("role" in message)) return null;
  const role = (message as { role?: unknown }).role;
  return role === "user" || role === "assistant" || role === "toolResult" || role === "system"
    ? role
    : null;
}

export function messageTimestamp(message: AgentMessage): number {
  if (message && typeof message === "object") {
    const timestamp = (message as { timestamp?: unknown }).timestamp;
    if (typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp >= 0) {
      return Math.floor(timestamp);
    }
  }
  return Date.now();
}

export function toolCallIdForMessage(message: AgentMessage): string | undefined {
  if (!message || typeof message !== "object") return undefined;
  if ((message as { role?: unknown }).role === "toolResult") {
    const toolCallId = (message as { toolCallId?: unknown }).toolCallId;
    return typeof toolCallId === "string" && toolCallId.length > 0 ? toolCallId : undefined;
  }

  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  const block = content.find(
    (item): item is { type: "toolCall"; id: string } =>
      !!item &&
      typeof item === "object" &&
      (item as { type?: unknown }).type === "toolCall" &&
      typeof (item as { id?: unknown }).id === "string",
  );
  return block?.id;
}

export async function appendManualSessionMessages(
  projectRoot: string,
  sessionId: string,
  messages: ReadonlyArray<AgentMessage>,
  input = "",
  options: {
    readonly sessionKind?: SessionKind;
    readonly legacyDisplay?: {
      readonly thinking?: string;
      readonly toolExecutions?: readonly unknown[];
    };
  } = {},
): Promise<void> {
  const persistedMessages = messages
    .map((message) => ({ message, role: transcriptRoleForMessage(message) }))
    .filter((entry): entry is { message: AgentMessage; role: TranscriptRole } => entry.role !== null);
  if (persistedMessages.length === 0) return;

  const requestId = randomUUID();
  await appendTranscriptEvents(projectRoot, sessionId, ({ nextSeq }) => {
    let seq = nextSeq;
    const events: TranscriptEvent[] = [{
      type: "request_started",
      version: 1,
      sessionId,
      requestId,
      seq: seq++,
      timestamp: Date.now(),
      ...(options.sessionKind ? { sessionKind: options.sessionKind } : {}),
      input,
    }];

    let parentUuid: string | null = null;
    let lastAssistantUuid: string | null = null;
    for (const { message, role } of persistedMessages) {
      const uuid = randomUUID();
      const isToolResult = role === "toolResult";
      const toolCallId = toolCallIdForMessage(message);
      const legacyDisplay = role === "assistant" && options.legacyDisplay
        ? {
            ...(options.legacyDisplay.thinking ? { thinking: options.legacyDisplay.thinking } : {}),
            ...(options.legacyDisplay.toolExecutions?.length
              ? { toolExecutions: [...options.legacyDisplay.toolExecutions] }
              : {}),
          }
        : undefined;
      events.push({
        type: "message",
        version: 1,
        sessionId,
        requestId,
        uuid,
        parentUuid: isToolResult && lastAssistantUuid ? lastAssistantUuid : parentUuid,
        seq: seq++,
        role,
        timestamp: messageTimestamp(message),
        ...(toolCallId ? { toolCallId } : {}),
        ...(isToolResult && lastAssistantUuid
          ? { sourceToolAssistantUuid: lastAssistantUuid }
          : {}),
        ...(legacyDisplay && (legacyDisplay.thinking || legacyDisplay.toolExecutions?.length)
          ? { legacyDisplay }
          : {}),
        message,
      });
      if (role === "assistant") lastAssistantUuid = uuid;
      parentUuid = uuid;
    }

    events.push({
      type: "request_committed",
      version: 1,
      sessionId,
      requestId,
      seq,
      timestamp: Date.now(),
    });
    return events;
  });
}
