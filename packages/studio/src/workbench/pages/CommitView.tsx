/**
 * 提交确认 — the dedicated pre-commit surface.
 *
 * Shows what exactly is about to become the formal chapter: the candidate, its
 * baseline, the word-count delta, the review result and the gate checklist.
 * An author can select any chapter and candidate directly from this cockpit.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ClipboardCheck, PenLine, ShieldAlert } from "lucide-react";
import { useWorkbench } from "../state/store";
import { CommitDialog, CommitNote } from "../components/CommitDialog";
import { reviewCounts } from "../components/ReviewPanel";
import { Alert, Badge, Btn, Empty, type Tone } from "../ui";
import { formatNumber, formatSigned, formatWords } from "../format";

const GATE_TONE: Record<"pass" | "warn" | "block", Tone> = { pass: "ok", warn: "warn", block: "block" };
const GATE_ICON = { pass: Check, warn: AlertTriangle, block: ShieldAlert } as const;

export function CommitView() {
  const dataset = useWorkbench((state) => state.dataset);
  const demoMode = useWorkbench((state) => state.demoMode);
  const activeBookId = useWorkbench((state) => state.activeBookId);
  const activeChapterId = useWorkbench((state) => state.activeChapterId);
  const selectChapter = useWorkbench((state) => state.selectChapter);
  const activeCandidateId = useWorkbench((state) => state.activeCandidateId);
  const selectCandidate = useWorkbench((state) => state.selectCandidate);
  const goArea = useWorkbench((state) => state.goArea);
  const refreshChapterContext = useWorkbench((state) => state.refreshChapterContext);
  const [open, setOpen] = useState(false);

  const bookChapters = useMemo(
    () => (dataset?.chapters ?? []).filter((item) => item.bookId === activeBookId),
    [dataset, activeBookId],
  );
  const currentChapter = bookChapters.find((item) => item.id === activeChapterId)
    ?? bookChapters[0]
    ?? null;

  const candidates = dataset?.candidates ?? [];
  const candidate = candidates.find((item) => item.id === activeCandidateId)
    ?? candidates.find((item) => !item.isFormal)
    ?? candidates[0]
    ?? null;

  if (!dataset || bookChapters.length === 0) {
    return (
      <div className="nc-page-body">
        <Empty
          icon={<ClipboardCheck size={18} aria-hidden="true" />}
          title="当前作品暂无章节"
          detail="先在写作工作区创建并编写章节，再回到这里核对提交门禁。"
          action={<Btn variant="primary" onClick={() => goArea("writing")}>前往写作工作区</Btn>}
        />
      </div>
    );
  }

  const preview = dataset.commitPreview;
  const counts = reviewCounts(dataset.reviewItems);
  const blockingGates = preview.gates.filter((gate) => gate.state === "block");

  return (
    <>
      <header className="nc-page-head">
        <div>
          <h1 className="nc-page-title">提交确认</h1>
          <p className="nc-page-desc">
            审查章节候选版本，核对门禁指标与字数变动，正式批准为定稿。
          </p>
        </div>
        {candidate && (
          <div className="nc-btn-group">
            <Badge tone={candidate.isFormal ? "ok" : "brand"}>{candidate.label}</Badge>
            <Badge tone="neutral">r{candidate.revision}</Badge>
          </div>
        )}
      </header>

      {/* ── Control Band: Chapter and Candidate Pickers ───────────────────── */}
      <div className="nc-band" style={{ flexWrap: "wrap", gap: 12 }}>
        <div className="nc-row" style={{ padding: 0, gap: 6 }}>
          <label className="nc-meta" htmlFor="nc-commit-chapter" style={{ fontWeight: 600 }}>选择章节</label>
          <select
            id="nc-commit-chapter"
            className="nc-select"
            style={{ width: "auto", minWidth: 180, maxWidth: 280 }}
            value={currentChapter?.id ?? ""}
            onChange={(e) => void selectChapter(e.target.value)}
          >
            {bookChapters.map((ch) => (
              <option key={ch.id} value={ch.id}>
                第 {ch.number} 章 · {ch.title} ({ch.stage === "approved" || ch.stage === "committed" ? "正式稿" : "待审"})
              </option>
            ))}
          </select>
        </div>

        {candidates.length > 1 && (
          <>
            <span className="nc-crumb-sep" aria-hidden="true">|</span>
            <div className="nc-row" style={{ padding: 0, gap: 6 }}>
              <label className="nc-meta" htmlFor="nc-commit-candidate">选择提交候选</label>
              <select
                id="nc-commit-candidate"
                className="nc-select"
                style={{ width: "auto", maxWidth: 240 }}
                value={candidate?.id ?? ""}
                onChange={(e) => selectCandidate(e.target.value)}
              >
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} · r{c.revision} ({c.wordCount}字)
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      <div className="nc-page-body nc-stack" style={{ gap: 16 }}>
        {!candidate ? (
          <div className="nc-card nc-card-pad nc-stack" style={{ gap: 12 }}>
            <div className="nc-row" style={{ padding: 0 }}>
              <div className="nc-stack" style={{ gap: 4 }}>
                <span className="nc-h2">第 {currentChapter?.number} 章 · {currentChapter?.title} 尚未编写正文</span>
                <p className="nc-meta">本章处于已规划阶段，尚未产生候选稿，请先进入写作工作区完成初稿。</p>
              </div>
              <span className="nc-spacer" />
              <Btn variant="primary" icon={<PenLine size={14} aria-hidden="true" />} onClick={() => goArea("writing")}>
                前往写作工作区
              </Btn>
            </div>
          </div>
        ) : (
          <>
            {blockingGates.length > 0 && (
              <Alert tone="block" title={`${blockingGates.length} 项门禁未通过`}>
                存在阻断项时不可提交正式稿。请先在审核视图中处理对应证据或重新审核，再行确认。
              </Alert>
            )}

            <div className="nc-cols">
              <div className="nc-stack" style={{ gap: 14 }}>
                <section className="nc-card nc-card-pad nc-stack" style={{ gap: 10 }} aria-label="门禁清单">
                  <h2 className="nc-h2">门禁清单</h2>
                  {preview.gates.map((gate) => {
                    const Icon = GATE_ICON[gate.state];
                    return (
                      <div className="nc-row nc-row-top" key={gate.id} style={{ padding: 0 }}>
                        <Badge tone={GATE_TONE[gate.state]} icon={<Icon size={12} aria-hidden="true" />}>
                          {gate.state === "pass" ? "通过" : gate.state === "warn" ? "需确认" : "阻断"}
                        </Badge>
                        <span className="nc-row-fill">
                          <span className="nc-em">{gate.label}</span>
                          <span className="nc-meta">{gate.detail}</span>
                        </span>
                      </div>
                    );
                  })}
                </section>

                <section className="nc-card nc-card-pad nc-stack" style={{ gap: 8 }} aria-label="审核结果摘要">
                  <h2 className="nc-h2">审核结果</h2>
                  <div className="nc-row" style={{ padding: 0, gap: 8 }}>
                    <Badge tone="block">阻断 {counts.block}</Badge>
                    <Badge tone="warn">警告 {counts.warn}</Badge>
                    <Badge tone="info">建议 {counts.suggest}</Badge>
                  </div>
                  <p className="nc-meta">
                    仅统计待处理项。已处理与已豁免的记录可在审核视图中按状态查看。
                  </p>
                  <Btn onClick={() => goArea("review")}>打开审核视图</Btn>
                </section>

                {preview.pendingIndexTasks.length > 0 && (
                  <section className="nc-card nc-card-pad nc-stack" style={{ gap: 8 }} aria-label="尚未完成的索引任务">
                    <h2 className="nc-h2">尚未完成的索引任务</h2>
                    <ul className="nc-meta" style={{ display: "grid", gap: 4 }}>
                      {preview.pendingIndexTasks.map((task) => <li key={task}>· {task}</li>)}
                    </ul>
                  </section>
                )}
              </div>

              <aside className="nc-stack" style={{ gap: 12 }}>
                <div className="nc-card nc-card-pad nc-stack" style={{ gap: 12 }}>
                  <h2 className="nc-h2">提交方案</h2>
                  <dl className="nc-defs">
                    <div>
                      <dt>提交章节</dt>
                      <dd>第 {currentChapter?.number} 章 · {currentChapter?.title}</dd>
                    </div>
                    <div>
                      <dt>选定版本</dt>
                      <dd>{candidate.label} · r{candidate.revision}</dd>
                    </div>
                    <div>
                      <dt>基线对比</dt>
                      <dd>{preview.baseline}</dd>
                    </div>
                    <div>
                      <dt>字数变动</dt>
                      <dd className="nc-num">{formatSigned(preview.wordDelta)} 字</dd>
                    </div>
                    <div>
                      <dt>最终字数</dt>
                      <dd className="nc-num">{formatNumber(candidate.wordCount)} 字</dd>
                    </div>
                    <div>
                      <dt>状态流转</dt>
                      <dd>{preview.statusChange}</dd>
                    </div>
                  </dl>
                  <Btn
                    variant="primary"
                    icon={<ClipboardCheck size={14} aria-hidden="true" />}
                    onClick={() => setOpen(true)}
                    disabled={blockingGates.length > 0}
                    title={blockingGates.length > 0 ? "存在未通过的阻断门禁，无法提交" : "核对并提交该候选为正式稿"}
                  >
                    确认提交到正式稿
                  </Btn>
                  <CommitNote />
                </div>

                {demoMode && (
                  <Alert tone="warn" title="演示数据模式">
                    演示预览中的提交只改变模拟状态，不会写入真实章节，也不会触发真实索引任务。
                  </Alert>
                )}
              </aside>
            </div>
          </>
        )}
      </div>

      {candidate && (
        <CommitDialog
          open={open}
          onClose={() => setOpen(false)}
          preview={preview}
          candidateLabel={candidate.label}
          candidateRevision={candidate.revision}
          demoMode={demoMode}
          onCommitted={() => { void refreshChapterContext(); }}
          onBlocked={() => goArea("review")}
          onOpenDiagnostics={() => goArea("settings")}
        />
      )}
    </>
  );
}
