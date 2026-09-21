/**
 * Novel Creation workbench — chapter editing buffer.
 *
 * Implements the autosave contract from docs/03 §4 without inventing an
 * editor kernel: a plain controlled textarea plus
 *
 *   loading -> clean -> dirty -> saving -> clean
 *                          \-> save_error
 *                          \-> conflict
 *
 * Guarantees enforced here:
 *  - An unfinished IME composition never triggers an autosave or a shortcut.
 *  - Input stops for ~800ms triggers a save; continuous input waits at most
 *    ~5s — but the 5s ceiling never truncates a composition.
 *  - Every request carries the revision it started from; a late response can
 *    only settle its own request, never overwrite newer buffer text.
 *  - A revision mismatch stops silent retries and surfaces the conflict.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getWorkbenchSource } from "../data/adapter";
import { createSaveSequencer, type SaveSequencer } from "./save-sequencer";
import {
  clearDraftMirror,
  findRecoverableDraft,
  saveDraftMirror,
  type DraftKey,
  type DraftRecord,
} from "./draft-store";
import type { SaveStatus } from "../types";

const DEBOUNCE_MS = 800;
const MAX_WAIT_MS = 5_000;
// How many times an autosave may auto-rebase onto a newer server revision and
// retry before it stops and asks the author. A stale base used to freeze saving
// permanently, which looked like "my edits never persist".
const MAX_AUTO_REBASE_ATTEMPTS = 3;

export interface ChapterBufferOptions {
  readonly bookId: string;
  readonly chapterId: string;
  readonly candidateId: string;
  readonly initialBody: string;
  readonly initialRevision: number;
  readonly demoMode: boolean;
  readonly onSaved?: (revision: number, savedAt: string) => void;
}

export interface ChapterBuffer {
  readonly text: string;
  readonly status: SaveStatus;
  readonly hasUnsavedChanges: boolean;
  onChange: (next: string) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
  /** Resolves true only when the current text reached the data source. */
  saveNow: () => Promise<boolean>;
  /** Keep the local text and rebase onto the server revision after a conflict. */
  rebase: () => void;
  /** Locally mirrored text from an interrupted session, offered back on load. */
  recoverableDraft: DraftRecord | null;
  recoverDraft: () => void;
  discardDraft: () => void;
}

export function useChapterBuffer(options: ChapterBufferOptions): ChapterBuffer {
  const { bookId, chapterId, candidateId, initialBody, initialRevision, demoMode, onSaved } = options;

  const [text, setText] = useState(initialBody);
  const [status, setStatus] = useState<SaveStatus>({
    state: "loading",
    revision: initialRevision,
    savedAt: null,
    message: "正在载入候选…",
    isComposing: false,
    pendingSince: null,
  });

  const textRef = useRef(initialBody);
  const revisionRef = useRef(initialRevision);
  const baseRevisionRef = useRef(initialRevision);
  const conflictRevisionRef = useRef(initialRevision);
  const seqRef = useRef<SaveSequencer | null>(null);
  if (seqRef.current === null) seqRef.current = createSaveSequencer();
  const sequencer = seqRef.current;
  const debounceRef = useRef<number | null>(null);
  const maxWaitRef = useRef<number | null>(null);
  const firstDirtyRef = useRef<number | null>(null);
  const composingRef = useRef(false);
  const conflictRef = useRef(false);
  const rebaseAttemptsRef = useRef(0);
  const mountedRef = useRef(true);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  /** Latest status, readable from effects that must not re-run on every edit. */
  const statusRef = useRef(status);
  statusRef.current = status;
  /** Identity of the candidate the buffer currently holds. */
  const identityRef = useRef<string | null>(null);

  // A crash-safe mirror of the in-editor text, keyed by the chapter and the
  // revision it belongs to.
  const draftKey = useMemo<DraftKey>(
    () => ({ bookId, chapterId, candidateId }),
    [bookId, chapterId, candidateId],
  );
  const [recoverableDraft, setRecoverableDraft] = useState<DraftRecord | null>(null);

  const clearTimers = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (maxWaitRef.current !== null) {
      window.clearTimeout(maxWaitRef.current);
      maxWaitRef.current = null;
    }
    firstDirtyRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  // A new candidate / chapter resets the buffer onto that candidate's own text.
  //
  // A mere refresh of the SAME candidate (the autosave echo that follows
  // `onSaved`, a gate refresh) must NOT reset the buffer: resetting overwrote
  // text typed while the save was in flight and `clearTimers()` cancelled the
  // queued follow-up save, silently losing keystrokes. Same-candidate updates
  // only adopt the server text when this buffer is clean and idle.
  useEffect(() => {
    const identity = `${bookId}\u0000${chapterId}\u0000${candidateId}`;
    const identityChanged = identityRef.current !== identity;

    if (!identityChanged) {
      const idle = statusRef.current.state === "clean" && !composingRef.current;
      if (!idle || textRef.current === initialBody) return;
      textRef.current = initialBody;
      revisionRef.current = initialRevision;
      baseRevisionRef.current = initialRevision;
      conflictRevisionRef.current = initialRevision;
      setText(initialBody);
      setStatus((prev) => ({
        ...prev,
        state: "clean",
        revision: initialRevision,
        message: "候选已就绪",
      }));
      return;
    }

    identityRef.current = identity;
    textRef.current = initialBody;
    revisionRef.current = initialRevision;
    baseRevisionRef.current = initialRevision;
    conflictRevisionRef.current = initialRevision;
    conflictRef.current = false;
    setText(initialBody);
    clearTimers();
    // Offer back any locally mirrored text that the server does not have yet,
    // but never apply it silently — it may be a draft the author abandoned.
    setRecoverableDraft(findRecoverableDraft({
      key: draftKey,
      baseRevision: initialRevision,
      serverBody: initialBody,
    }));
    setStatus({
      state: "clean",
      revision: initialRevision,
      savedAt: null,
      message: "候选已就绪",
      isComposing: false,
      pendingSince: null,
    });
  }, [bookId, candidateId, chapterId, initialBody, initialRevision, clearTimers, draftKey]);

  const persist = useCallback(async () => {
    // A 412 is an author decision point. Until they explicitly rebase, edits
    // remain local and no timer may turn them into a silent retry.
    if (composingRef.current || conflictRef.current) return false;
    clearTimers();
    const seq = sequencer.begin();

    const bodyAtRequest = textRef.current;
    const revisionAtRequest = revisionRef.current;
    const baseAtRequest = baseRevisionRef.current;

    setStatus((prev) => ({
      ...prev,
      state: "saving",
      message: "正在保存候选…",
      pendingSince: null,
    }));

    let result;
    try {
      result = await getWorkbenchSource(demoMode).saveDraft({
        bookId,
        chapterId,
        candidateId,
        body: bodyAtRequest,
        revision: revisionAtRequest,
        baseRevision: baseAtRequest,
      });
    } catch (error) {
      result = { ok: false as const, error: error instanceof Error ? error.message : "保存失败。" };
    }

    // A late response may only settle its own request.
    if (!mountedRef.current || !sequencer.isCurrent(seq)) return false;

    if (result.ok) {
      rebaseAttemptsRef.current = 0;
      revisionRef.current = result.revision ?? revisionAtRequest;
      baseRevisionRef.current = result.revision ?? baseAtRequest;
      conflictRevisionRef.current = revisionRef.current;
      const savedAt = result.savedAt ?? new Date().toISOString();
      const stillDirty = textRef.current !== bodyAtRequest;
      setStatus({
        state: stillDirty ? "dirty" : "clean",
        revision: revisionRef.current,
        savedAt,
        message: stillDirty ? "保存完成，仍有新的改动待保存" : "候选已保存",
        isComposing: false,
        pendingSince: stillDirty ? Date.now() : null,
      });
      onSavedRef.current?.(revisionRef.current, savedAt);
      if (stillDirty) {
        firstDirtyRef.current = Date.now();
        debounceRef.current = window.setTimeout(() => void persist(), DEBOUNCE_MS);
      } else {
        // The server has this text, so the crash mirror is no longer needed.
        clearDraftMirror(draftKey);
      }
      return !stillDirty;
    }

    if (result.conflict) {
      // A stale base (e.g. the workspace read failed and we guessed the revision
      // from the version count) must not freeze saving forever. Adopt the
      // server's revision and retry — the local text is the author's intent.
      // Bounded so two writers ping-ponging still surface a real conflict.
      if (rebaseAttemptsRef.current < MAX_AUTO_REBASE_ATTEMPTS) {
        rebaseAttemptsRef.current += 1;
        const nextBase = result.conflictRevision ?? revisionRef.current;
        revisionRef.current = nextBase;
        baseRevisionRef.current = nextBase;
        conflictRevisionRef.current = nextBase;
        setStatus((prev) => ({
          ...prev,
          state: "dirty",
          message: "服务端版本已更新，正在自动对齐并重试保存…",
          pendingSince: prev.pendingSince ?? Date.now(),
        }));
        debounceRef.current = window.setTimeout(() => void persist(), DEBOUNCE_MS);
        return false;
      }
      // Stop retrying silently; the author resolves the mismatch.
      conflictRef.current = true;
      conflictRevisionRef.current = result.conflictRevision ?? revisionRef.current;
      clearTimers();
      setStatus((prev) => ({
        ...prev,
        state: "conflict",
        message: result.error ?? "服务端版本已更新，本地文本没有被覆盖。",
        pendingSince: null,
      }));
      return false;
    }

    setStatus((prev) => ({
      ...prev,
      state: "save_error",
      message: result.error ?? "保存失败，本地文本仍在编辑器中。",
      pendingSince: Date.now(),
    }));
    return false;
  }, [bookId, chapterId, candidateId, demoMode, clearTimers, draftKey]);

  const schedule = useCallback(() => {
    if (composingRef.current || conflictRef.current) return;
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void persist(), DEBOUNCE_MS);

    // Mirror on the same debounce rather than on every keystroke: a synchronous
    // localStorage write of the whole chapter per character is real jank on a
    // long chapter, and the crash window it protects is the same either way.
    saveDraftMirror({
      key: draftKey,
      baseRevision: baseRevisionRef.current,
      body: textRef.current,
    });

    if (maxWaitRef.current === null) {
      maxWaitRef.current = window.setTimeout(() => {
        maxWaitRef.current = null;
        // The ceiling never cuts an active composition.
        if (composingRef.current) return;
        void persist();
      }, MAX_WAIT_MS);
    }
  }, [persist, draftKey]);

  const onChange = useCallback((next: string) => {
    textRef.current = next;
    setText(next);
    setStatus((prev) => {
      if (prev.state === "conflict") return prev;
      return {
        ...prev,
        state: "dirty",
        message: composingRef.current ? "输入法组合中，暂不保存" : "有未保存的改动",
        isComposing: composingRef.current,
        pendingSince: prev.pendingSince ?? Date.now(),
      };
    });
    // Keep typing responsive after a conflict, but never schedule a retry
    // until the author has chosen to rebase the local candidate.
    if (!conflictRef.current) schedule();
  }, [schedule]);

  /** Apply the locally mirrored text after an interrupted session. */
  const recoverDraft = useCallback(() => {
    const record = recoverableDraft;
    if (!record) return;
    textRef.current = record.body;
    setText(record.body);
    setRecoverableDraft(null);
    setStatus((prev) => ({
      ...prev,
      state: "dirty",
      message: "已恢复上次未保存的正文，请确认后保存",
      pendingSince: prev.pendingSince ?? Date.now(),
    }));
    schedule();
  }, [recoverableDraft, schedule]);

  const discardDraft = useCallback(() => {
    clearDraftMirror(draftKey);
    setRecoverableDraft(null);
  }, [draftKey]);

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
    // Drop pending timers: a composition in flight must not be interrupted.
    clearTimers();
    setStatus((prev) => ({ ...prev, isComposing: true, message: "输入法组合中，暂不保存" }));
  }, [clearTimers]);

  const onCompositionEnd = useCallback(() => {
    composingRef.current = false;
    setStatus((prev) => ({ ...prev, isComposing: false, message: "有未保存的改动" }));
    firstDirtyRef.current = Date.now();
    schedule();
  }, [schedule]);

  const saveNow = useCallback(async () => {
    if (composingRef.current) return false;
    return persist();
  }, [persist, draftKey]);

  const rebase = useCallback(() => {
    conflictRef.current = false;
    revisionRef.current = conflictRevisionRef.current;
    baseRevisionRef.current = conflictRevisionRef.current;
    setStatus((prev) => ({
      ...prev,
      state: "dirty",
      revision: conflictRevisionRef.current,
      message: "已按服务端版本重新对齐基线，请再保存一次",
    }));
  }, []);

  const hasUnsavedChanges = status.state === "dirty" || status.state === "save_error" || status.state === "conflict";

  // beforeunload only warns — it never claims the buffer reached the server.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // Flush the mirror synchronously: the debounce may not have fired yet, and
      // this is the last chance to keep the text.
      saveDraftMirror({
        key: draftKey,
        baseRevision: baseRevisionRef.current,
        body: textRef.current,
      });
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges, draftKey]);

  return useMemo(
    () => ({
      text, status, hasUnsavedChanges, onChange, onCompositionStart, onCompositionEnd,
      saveNow, rebase, recoverableDraft, recoverDraft, discardDraft,
    }),
    [
      text, status, hasUnsavedChanges, onChange, onCompositionStart, onCompositionEnd,
      saveNow, rebase, recoverableDraft, recoverDraft, discardDraft,
    ],
  );
}

/** Ctrl/⌘+S saves the buffer without waiting for the debounce. */
export function useSaveShortcut(save: () => Promise<unknown>, enabled = true) {
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void saveRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}


