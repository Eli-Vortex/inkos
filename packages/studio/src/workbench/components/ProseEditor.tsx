/**
 * Prose editor — the author's own text buffer.
 *
 * The formal chapter text is read-only reference; editing produces a candidate.
 * Model output never lands here: generated text arrives as a separate candidate
 * the author compares and adopts explicitly. Native textarea undo/redo and IME
 * behaviour are intentionally preserved — no custom editor kernel.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, GitCompare, Plus, RefreshCw, Save, ShieldCheck, Wand2 } from "lucide-react";
import type { Candidate } from "../types";
import type { ChapterBuffer } from "../state/editor-buffer";
import { Badge, Btn, IconButton } from "../ui";
import { countCjk, formatNumber, formatTime } from "../format";

const SOURCE_LABEL: Record<Candidate["source"], string> = {
  hand: "手写",
  generated: "生成",
  revised: "修订",
  imported: "导入",
};

export interface ProseEditorProps {
  readonly candidate: Candidate;
  readonly buffer: ChapterBuffer;
  readonly reviewCounts: { readonly block: number; readonly warn: number; readonly suggest: number };
  readonly staleReview: boolean;
  /** Set by the review panel's 定位原文 action: caret + scroll into the quote. */
  readonly locate?: { readonly offset: number; readonly token: number } | null;
  readonly onOpenCompare: () => void;
  readonly onOpenReview: () => void;
  /** Offers to seed a new candidate from an archived version. */
  readonly onCreateCandidateFrom?: () => void;
  /** Re-runs the audit for a chapter whose prose changed after its last review. */
  readonly onReaudit?: () => void;
  /** Ask the AI to revise this chapter's prose. `force` overwrites regardless of audit. */
  readonly onRevise?: (mode: ReviseMode, force: boolean) => void;
  /** True while a revise is already running: the controls are disabled. */
  readonly busy?: boolean;
}

export type ReviseMode = "spot-fix" | "polish" | "rewrite" | "rework" | "anti-detect";

export function ProseEditor({
  candidate,
  buffer,
  reviewCounts,
  staleReview,
  locate,
  onOpenCompare,
  onOpenReview,
  onCreateCandidateFrom,
  onReaudit,
  onRevise,
  busy,
}: ProseEditorProps) {
  const { text, status, onChange, onCompositionStart, onCompositionEnd, saveNow, rebase } = buffer;
  const words = countCjk(text);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [reviseMode, setReviseMode] = useState<ReviseMode>("spot-fix");
  const [forceRevise, setForceRevise] = useState(false);

  // An archived version and an approved formal draft are both records. Editing
  // either in place would let one keystroke replace the live chapter with old
  // text, so they are read-only: a new candidate has to be created explicitly.
  const readOnly = candidate.archived === true || candidate.isFormal === true;
  const readOnlyReason = candidate.archived
    ? "历史版本是只读记录"
    : "正式稿只读；如需修改请先创建修订候选";

  // Jump to the evidence the author picked, without stealing the selection
  // while they are typing.
  useEffect(() => {
    if (!locate) return;
    const area = areaRef.current;
    if (!area) return;
    const start = Math.max(0, Math.min(text.length, locate.offset));
    const end = Math.min(text.length, start + 36);
    area.focus();
    area.setSelectionRange(start, end);
    const linesBefore = text.slice(0, start).split("\n").length;
    area.scrollTop = Math.max(0, linesBefore * 34 - area.clientHeight / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locate?.token]);

  return (
    <>
      <div className="nc-pane-toolbar">
        <Badge tone="brand">{candidate.label}</Badge>
        <Badge tone="neutral">{SOURCE_LABEL[candidate.source]}</Badge>
        <span className="nc-pill nc-num">r{candidate.revision}</span>
        <span className="nc-pill">{formatNumber(words)} 字</span>
        {staleReview && <Badge tone="warn" title="基线变更后需要重新审核">审核已过期</Badge>}
        {readOnly && (
          <Badge tone="neutral" title={readOnlyReason}>只读</Badge>
        )}
        <span className="nc-spacer" />
        {staleReview && !readOnly && (
          <Btn
            variant="primary"
            icon={<ShieldCheck size={14} aria-hidden="true" />}
            onClick={onReaudit}
            title="正文改动后原审核已失效；重新审核才能提交"
          >
            重新审核
          </Btn>
        )}
        {readOnly && onCreateCandidateFrom && (
          <Btn
            variant="primary"
            icon={<Plus size={14} aria-hidden="true" />}
            onClick={onCreateCandidateFrom}
            title="以这一版为基础创建新候选，然后就能编辑"
          >
            基于此版本创建候选
          </Btn>
        )}
        {onRevise && (
          <>
            <label className="nc-visually-hidden" htmlFor="nc-revise-mode">AI 修订模式</label>
            <select
              id="nc-revise-mode"
              className="nc-select"
              style={{ width: "auto" }}
              value={reviseMode}
              disabled={busy}
              onChange={(event) => setReviseMode(event.target.value as ReviseMode)}
              title="选择 AI 修订强度：局部微修 / 润色 / 重写 / 大改 / 去 AI 感"
            >
              <option value="spot-fix">局部微修</option>
              <option value="polish">润色</option>
              <option value="rewrite">重写本章</option>
              <option value="rework">大改</option>
              <option value="anti-detect">去 AI 感</option>
            </select>
            <label
              className="nc-meta"
              style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}
              title="勾选后即使复核问题没有减少，也直接用新稿覆盖本章"
            >
              <input
                type="checkbox"
                checked={forceRevise}
                onChange={(event) => setForceRevise(event.target.checked)}
              />
              强制覆盖
            </label>
            <Btn
              variant="primary"
              icon={<Wand2 size={14} aria-hidden="true" />}
              onClick={() => onRevise(reviseMode, forceRevise)}
              disabled={busy}
              title={busy ? "正在修订中，请稍候" : "调用 AI 修订本章正文"}
            >
              {busy ? "修订中…" : "AI 修订"}
            </Btn>
          </>
        )}
        <Btn icon={<GitCompare size={14} aria-hidden="true" />} onClick={onOpenCompare}>比较版本</Btn>
        <Btn
          icon={<ShieldCheck size={14} aria-hidden="true" />}
          onClick={onOpenReview}
          title="打开右侧审核面板"
        >
          审核 {reviewCounts.block + reviewCounts.warn + reviewCounts.suggest}
        </Btn>
      </div>

      <div className="nc-prose-wrap">
        <textarea
          ref={areaRef}
          className="nc-prose"
          data-warn={reviewCounts.block > 0}
          value={text}
          spellCheck={false}
          readOnly={readOnly}
          aria-readonly={readOnly || undefined}
          aria-label={`${candidate.label} 正文`}
          title={readOnly ? readOnlyReason : undefined}
          onChange={(event) => onChange(event.target.value)}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          placeholder={readOnly ? "只读：这一版不可直接编辑。" : "从一个具体的时刻开始写。"}
        />
      </div>

      <div className="nc-statebar" role="status" aria-live="polite">
        <SaveStateReadout buffer={buffer} />
        <span className="nc-spacer" />
        {(status.state === "save_error" || status.state === "conflict") && (
          <Btn
            icon={<RefreshCw size={14} aria-hidden="true" />}
            onClick={status.state === "conflict" ? rebase : () => void saveNow()}
            title={status.state === "conflict" ? "按服务端版本重新对齐基线" : "重试保存"}
          >
            {status.state === "conflict" ? "对齐基线" : "重试"}
          </Btn>
        )}
        <IconButton
          label="立即保存候选（Ctrl 或 ⌘ + S）"
          icon={<Save size={15} aria-hidden="true" />}
          onClick={() => void saveNow()}
          disabled={!buffer.hasUnsavedChanges}
        />
      </div>
    </>
  );
}

function SaveStateReadout({ buffer }: { readonly buffer: ChapterBuffer }) {
  const { status } = buffer;
  const time = formatTime(status.savedAt);

  if (status.state === "loading") {
    return (
      <span className="nc-statesync nc-meta" data-state="loading">
        <span className="nc-live" data-state="loading" aria-hidden="true" />
        正在载入候选…
      </span>
    );
  }
  if (status.state === "saving") {
    return (
      <span className="nc-statesync nc-meta" data-state="saving">
        <span className="nc-live" data-state="saving" aria-hidden="true" />
        正在保存候选…
      </span>
    );
  }
  if (status.state === "clean") {
    return (
      <span className="nc-statesync nc-meta" data-state="clean">
        <span className="nc-live" data-state="clean" aria-hidden="true" />
        候选已保存 · r{status.revision} · {time}
      </span>
    );
  }
  if (status.state === "dirty") {
    return (
      <span className="nc-statesync nc-meta" data-state="dirty">
        <span className="nc-live" data-state="dirty" aria-hidden="true" />
        {status.isComposing ? "输入法组合中，暂不保存" : "有未保存的改动"}
      </span>
    );
  }
  if (status.state === "save_error") {
    return (
      <span className="nc-statesync nc-meta" data-state="save_error">
        <AlertTriangle size={13} aria-hidden="true" style={{ color: "var(--nc-block)" }} />
        <span style={{ color: "var(--nc-block)" }}>{status.message}</span>
      </span>
    );
  }
  return (
    <span className="nc-statesync nc-meta" data-state="conflict">
      <AlertTriangle size={13} aria-hidden="true" style={{ color: "var(--nc-block)" }} />
      <span style={{ color: "var(--nc-block)" }}>{status.message} 本地文本未被覆盖。</span>
    </span>
  );
}

