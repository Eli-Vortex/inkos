/**
 * Commit confirmation.
 *
 * One action, one meaning: saving a candidate and committing the formal
 * chapter are different things, so this dialog never shares a button with the
 * editor's save. The result copy follows the backend mapping in docs/03 §6 —
 * a 202 is "queued", never "submitted", and a projection lag still reads as
 * committed.
 *
 * In demo preview mode the confirmation only changes simulated state and says
 * so; it never writes a real chapter.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, ClipboardCheck, Info, Loader2, ShieldAlert } from "lucide-react";
import type { CommitPreview } from "../types";
import { getWorkbenchSource, isUnavailable, type CommitOutcome } from "../data/adapter";
import { Alert, Badge, Btn, Dialog, Progress, type Tone } from "../ui";
import { formatSigned, formatWords } from "../format";

const GATE_TONE: Record<CommitPreview["gates"][number]["state"], Tone> = {
  pass: "ok",
  warn: "warn",
  block: "block",
};

const GATE_ICON = { pass: Check, warn: AlertTriangle, block: ShieldAlert } as const;

export interface CommitDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly preview: CommitPreview;
  readonly candidateLabel: string;
  readonly candidateRevision: number;
  readonly demoMode: boolean;
  readonly onBlocked: () => void;
  readonly onOpenDiagnostics: () => void;
  /** Called after the server accepted the commit, so the caller can refresh. */
  readonly onCommitted?: () => void;
}

interface Attempt {
  readonly key: string;
  readonly outcome: CommitOutcome;
}

export function CommitDialog({
  open,
  onClose,
  preview,
  candidateLabel,
  candidateRevision,
  demoMode,
  onBlocked,
  onOpenDiagnostics,
  onCommitted,
}: CommitDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // A successful commit closes the dialog from the parent (`onCommitted`), which
  // bypasses `reset`; without clearing the stale "accepted" attempt the next time
  // this dialog opens the confirm button stays disabled with no explanation.
  useEffect(() => {
    if (open) {
      setAttempt(null);
      setFailure(null);
      setSubmitting(false);
    }
  }, [open]);

  // One idempotency key per opened confirmation — a refresh reuses it.
  const idempotencyKey = useMemo(
    () => `nc-${candidateRevision}-${Math.abs(hashString(`${preview.candidateId}:${candidateRevision}`))}`,
    [preview.candidateId, candidateRevision],
  );

  const blocking = preview.gates.filter((gate) => gate.state === "block");
  const canConfirm = blocking.length === 0 && !submitting && attempt?.outcome.accepted !== true;

  const reset = () => {
    setAttempt(null);
    setFailure(null);
    setSubmitting(false);
  };

  const confirm = async () => {
    setSubmitting(true);
    setFailure(null);
    try {
      const outcome = await getWorkbenchSource(demoMode).commit({
        bookId: "current",
        chapterId: preview.candidateId,
        candidateId: preview.candidateId,
        revision: candidateRevision,
        idempotencyKey,
      });
      setAttempt({ key: idempotencyKey, outcome });
      // The commit changed the chapter's status on the server; without this the
      // page would keep showing the pre-commit stage and gate result.
      if (outcome.accepted) onCommitted?.();
      if (!outcome.accepted && (outcome.code === "422" || outcome.code === "409")) onBlocked();
    } catch (error) {
      setFailure(
        isUnavailable(error)
          ? "正式模式下提交尚未接入后端，本次没有写入任何内容。"
          : error instanceof Error ? error.message : "提交失败。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => { reset(); onClose(); }}
      size="lg"
      title="确认提交到正式稿"
      description={`候选 ${candidateLabel} · r${candidateRevision} · 基线 ${preview.baseline}`}
      footer={
        <>
          <Btn variant="ghost" onClick={() => { reset(); onClose(); }}>取消</Btn>
          <span className="nc-spacer" />
          <Btn
            variant="primary"
            onClick={() => void confirm()}
            disabled={!canConfirm}
            title={blocking.length > 0 ? "阻断项未处理，无法提交" : "提交该候选为正式稿"}
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="nc-spin" aria-hidden="true" />
                <span>提交中…</span>
              </>
            ) : (
              <>
                <ClipboardCheck size={14} aria-hidden="true" />
                <span>确认批准为正式稿</span>
              </>
            )}
          </Btn>
        </>
      }
    >
      <div className="nc-stack" style={{ gap: 16 }}>
        {demoMode && (
          <Alert tone="warn" title="演示数据">
            本次确认只改变模拟状态，不会调用真实写接口，也不会修改任何真实章节。
          </Alert>
        )}

        <dl className="nc-defs">
          <div>
            <dt>状态变更</dt>
            <dd>{preview.statusChange}</dd>
          </div>
          <div>
            <dt>字数变化</dt>
            <dd className="nc-num">{formatSigned(preview.wordDelta)} 字（提交后候选 {formatWords(preview.wordDelta)} 变化）</dd>
          </div>
          <div>
            <dt>提交对象</dt>
            <dd>{candidateLabel}，仅提交该明确候选版本</dd>
          </div>
        </dl>

        <section className="nc-stack" style={{ gap: 8 }} aria-label="提交门禁清单">
          <h3 className="nc-h3">门禁清单</h3>
          {preview.gates.map((gate) => {
            const Icon = GATE_ICON[gate.state];
            return (
              <div className="nc-row nc-row-top" key={gate.id} style={{ padding: 0 }}>
                <Badge tone={GATE_TONE[gate.state]} icon={<Icon size={12} aria-hidden="true" />}>
                  {gate.state === "pass" ? "通过" : gate.state === "warn" ? "需确认" : "阻断"}
                </Badge>
                <div className="nc-row-fill">
                  <span className="nc-em">{gate.label}</span>
                  <span className="nc-meta">{gate.detail}</span>
                </div>
              </div>
            );
          })}
        </section>

        {preview.pendingIndexTasks.length > 0 && (
          <section className="nc-stack" style={{ gap: 6 }} aria-label="尚未完成的索引任务">
            <h3 className="nc-h3">尚未完成的索引任务</h3>
            <ul className="nc-meta" style={{ display: "grid", gap: 3 }}>
              {preview.pendingIndexTasks.map((task) => (
                <li key={task}>· {task}</li>
              ))}
            </ul>
            <p className="nc-meta">索引任务未完成时，提交回执与索引投影可能短暂不一致，章节不会因此被标记为失败。</p>
          </section>
        )}

        {failure && <Alert tone="block" title="提交未完成">{failure}</Alert>}

        {attempt && <OutcomeReport attempt={attempt} onOpenDiagnostics={onOpenDiagnostics} />}

        <details className="nc-meta" style={{ fontSize: 11, color: "var(--nc-fg-subtle)", cursor: "pointer", marginTop: 4 }}>
          <summary>技术协议信息（幂等凭据与基线校验）</summary>
          <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: "2px solid var(--nc-hairline)", display: "grid", gap: 3 }}>
            <div>协议幂等键：<code>{idempotencyKey}</code></div>
            <div>提交基线：{preview.baseline} · 目标候选版本：r{candidateRevision}</div>
          </div>
        </details>
      </div>
    </Dialog>
  );
}

function OutcomeReport({ attempt, onOpenDiagnostics }: {
  readonly attempt: Attempt;
  readonly onOpenDiagnostics: () => void;
}) {
  const { outcome } = attempt;

  if (outcome.accepted) {
    return (
      <Alert tone="info" title="已提交">
        <span>
          提交回执 {outcome.commitId}。正式稿已更新，索引投影正在更新中；在投影完成前，分析结果可能仍是上一版。
        </span>
      </Alert>
    );
  }

  if (outcome.code === "202") {
    return (
      <div className="nc-stack" style={{ gap: 8 }}>
        <Alert tone="info" title="已排队，尚未提交">
          <span>{outcome.message}任务完成后才会产生正式提交回执，现在不能视为已提交。</span>
        </Alert>
        <Progress value={0.05} label="排队进度" />
      </div>
    );
  }

  if (outcome.code === "409") {
    return (
      <Alert tone="warn" title="基线已更新（STALE_BASE）">
        <span>{outcome.message}候选已保留。请先重新运行审核与差异比较，再决定是否提交。</span>
      </Alert>
    );
  }

  if (outcome.code === "412") {
    return (
      <Alert tone="warn" title="版本不匹配（REVISION_MISMATCH）">
        <span>{outcome.message}已进入编辑冲突处理，本地文本没有被覆盖。</span>
      </Alert>
    );
  }

  if (outcome.code === "422") {
    return (
      <Alert tone="block" title="审核未通过（REVIEW_BLOCKED）">
        <span>{outcome.message}请在审核视图中处理对应证据后再试。</span>
      </Alert>
    );
  }

  return (
    <div className="nc-stack" style={{ gap: 8 }}>
      <Alert tone="block" title="需要先恢复（RECOVERY_REQUIRED）">
        <span>{outcome.message}正式写操作已暂停，不建议反复点击提交。</span>
      </Alert>
      <div className="nc-btn-group">
        <Btn icon={<ArrowRight size={14} aria-hidden="true" />} onClick={onOpenDiagnostics}>
          打开诊断
        </Btn>
      </div>
    </div>
  );
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

export function CommitNote() {
  return (
    <p className="nc-meta">
      <Info size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> 保存候选与提交正式稿是两件事：编辑器里的保存只写入候选，正式提交必须在这个确认框中逐项核对。
    </p>
  );
}

