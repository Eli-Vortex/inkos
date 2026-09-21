/**
 * 写作工作区 — the core surface.
 *
 * Layout: collapsible chapter tree + the author's text + a side review panel,
 * with the chapter's 细纲 / 正文 / 审核 / 历史 as tabs on the same chapter so
 * the reading position and the unsaved state survive a view switch.
 *
 * The formal text is read-only reference; editing always produces a candidate.
 * Switching chapters while the buffer is dirty is never silent.
 */

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CircleDot,
  Clock,
  GitCompare,
  ListChecks,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import type { WorkbenchArea } from "../types";
import { useWorkbench } from "../state/store";
import { useChapterBuffer, useSaveShortcut } from "../state/editor-buffer";
import { ChapterTree, chapterStageLabel } from "../components/ChapterTree";
import { ProseEditor } from "../components/ProseEditor";
import { ReviewPanel, reviewCounts } from "../components/ReviewPanel";
import { CommitDialog } from "../components/CommitDialog";
import { Alert, Badge, Btn, Dialog, Empty, IconButton, Skeleton, Tabs } from "../ui";
import { countCjk, formatDateTime, formatNumber, formatRelative } from "../format";

const SOURCE_LABEL = { hand: "手写", generated: "生成", revised: "修订", imported: "导入" } as const;

export interface WritingWorkspaceProps {
  readonly onOpenArea: (area: WorkbenchArea) => void;
}

export function WritingWorkspace({ onOpenArea }: WritingWorkspaceProps) {
  const dataset = useWorkbench((state) => state.dataset);
  const demoMode = useWorkbench((state) => state.demoMode);
  const view = useWorkbench((state) => state.view);
  const setView = useWorkbench((state) => state.setView);
  const activeBookId = useWorkbench((state) => state.activeBookId);
  const activeChapterId = useWorkbench((state) => state.activeChapterId);
  const activeCandidateId = useWorkbench((state) => state.activeCandidateId);
  const selectChapter = useWorkbench((state) => state.selectChapter);
  const selectCandidate = useWorkbench((state) => state.selectCandidate);
  const reviewFilter = useWorkbench((state) => state.reviewFilter);
  const setReviewFilter = useWorkbench((state) => state.setReviewFilter);
  const resolveReviewItem = useWorkbench((state) => state.resolveReviewItem);
  const waiveReviewItem = useWorkbench((state) => state.waiveReviewItem);
  const fixReviewItem = useWorkbench((state) => state.fixReviewItem);
  const adoptCandidate = useWorkbench((state) => state.adoptCandidate);
  const createCandidateFromVersion = useWorkbench((state) => state.createCandidateFromVersion);
  const planNextChapter = useWorkbench((state) => state.planNextChapter);
  const generateNextChapter = useWorkbench((state) => state.generateNextChapter);
  const auditChapter = useWorkbench((state) => state.auditChapter);
  const reviseChapter = useWorkbench((state) => state.reviseChapter);
  const revising = useWorkbench((state) => state.revising);
  const pushToast = useWorkbench((state) => state.pushToast);
  const pendingLocate = useWorkbench((state) => state.pendingLocate);
  const requestLocate = useWorkbench((state) => state.requestLocate);

  const [treeCollapsed, setTreeCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 1024,
  );
  const [sideOpen, setSideOpen] = useState(true);
  const [commitOpen, setCommitOpen] = useState(false);

  const book = dataset?.books.find((item) => item.id === activeBookId) ?? null;
  // The chapter tree is scoped to the active book: a chapter from another book
  // must never be rendered as this book's current chapter.
  const bookChapters = useMemo(
    () => (dataset?.chapters ?? []).filter((item) => item.bookId === activeBookId),
    [dataset, activeBookId],
  );
  const chapter = bookChapters.find((item) => item.id === activeChapterId) ?? null;
  const candidate = dataset?.candidates.find((item) => item.id === activeCandidateId) ?? null;

  const buffer = useChapterBuffer({
    bookId: book?.id ?? "none",
    chapterId: chapter?.id ?? "none",
    candidateId: candidate?.id ?? "none",
    initialBody: candidate?.body ?? "",
    initialRevision: candidate?.revision ?? 0,
    demoMode,
    // After a save the chapter's revision and review state have changed on the
    // server. The store used to never hear about it, so the compare view kept
    // the old text and the commit page kept the old baseline.
    onSaved: () => {
      void refreshChapterContext();
      // A change that arrived mid-edit was parked; now that the text is safe,
      // apply it.
      void flushDeferredServerEvent();
    },
  });
  useSaveShortcut(buffer.saveNow);

  const chapterContextState = useWorkbench((state) => state.chapterContextState);
  const chapterContextError = useWorkbench((state) => state.chapterContextError);
  const refreshChapterContext = useWorkbench((state) => state.refreshChapterContext);
  const flushDeferredServerEvent = useWorkbench((state) => state.flushDeferredServerEvent);

  // While this workspace holds unsaved prose, it owns the guard that every
  // navigation consults, so leaving cannot discard text silently.
  const setTransitionGuard = useWorkbench((state) => state.setTransitionGuard);
  useEffect(() => {
    setTransitionGuard({
      hasUnsavedWork: () => buffer.hasUnsavedChanges,
      save: () => buffer.saveNow(),
    });
    return () => setTransitionGuard(null);
  }, [buffer.hasUnsavedChanges, buffer.saveNow, setTransitionGuard]);

  const counts = useMemo(() => reviewCounts(dataset?.reviewItems ?? []), [dataset]);

  if (!dataset || !book || !chapter || !candidate) {
    const noBooks = !dataset || dataset.books.length === 0;
    const noChapters = !noBooks && bookChapters.length === 0;
    const switching = !noBooks && !noChapters && chapterContextState === "loading";
    if (chapterContextState === "error") {
      return (
        <div className="nc-page-body">
          <Alert tone="block" title="本章数据读取失败">
            <span>{chapterContextError ?? "未知错误。"}</span>
            <span className="nc-btn-group" style={{ marginTop: 8 }}>
              <button type="button" className="nc-btn" onClick={() => void refreshChapterContext()}>
                重试
              </button>
            </span>
          </Alert>
        </div>
      );
    }
    return (
      <div className="nc-page-body">
        {switching ? (
          <Skeleton rows={6} label="正在载入本章数据" />
        ) : (
          <Empty
            icon={<BookOpen size={18} aria-hidden="true" />}
            title={noBooks ? "还没有作品" : noChapters ? "这部作品还没有章节" : "没有可写的章节"}
            detail={
              noBooks
                ? "先在作品列表新建一部作品，再回到写作工作区。"
                : noChapters
                  ? `《${book?.title ?? ""}》还没有建立章节。先写细纲与章节，再回到这里写正文。`
                  : "章节树里暂时没有可编辑的章节，先建立细纲与章节。"
            }
          />
        )}
      </div>
    );
  }

  const preview = dataset.commitPreview;

  return (
    <div className="nc-split">
      <ChapterTree
        chapters={bookChapters}
        activeChapterId={chapter.id}
        collapsed={treeCollapsed}
        onToggle={() => setTreeCollapsed((value) => !value)}
        onSelect={(nextId) => { if (nextId !== chapter.id) void selectChapter(nextId); }}
        onNewChapter={() => void planNextChapter()}
        dirtyChapterId={buffer.hasUnsavedChanges ? chapter.id : null}
      />

      <div className="nc-pane">
        <Tabs
          label="章节视图"
          value={view}
          onChange={setView}
          items={[
            { id: "outline", label: "细纲" },
            { id: "prose", label: "正文" },
            { id: "review", label: "审核", count: counts.block + counts.warn + counts.suggest },
            { id: "history", label: "历史", count: dataset.candidates.length },
          ]}
        />

        <div className="nc-row" style={{ padding: "6px 12px", gap: 8, borderBottom: "1px solid var(--nc-border)", flexWrap: "wrap" }}>
          <span className="nc-num nc-meta">第 {chapter.number} 章</span>
          <span className="nc-em nc-truncate" style={{ maxWidth: "22em" }}>{chapter.title}</span>
          <Badge tone="neutral">{chapterStageLabel(chapter.stage)}</Badge>
          {chapter.outlineDirty && <Badge tone="warn" title="细纲有未批准变更">细纲有未批准变更</Badge>}
          <span className="nc-spacer" />

          <label className="nc-visually-hidden" htmlFor="nc-candidate-select">候选版本</label>
          <select
            id="nc-candidate-select"
            className="nc-select"
            style={{ width: "auto", maxWidth: 260 }}
            value={candidate.id}
            onChange={(event) => selectCandidate(event.target.value)}
          >
            {dataset.candidates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {SOURCE_LABEL[item.source]} · r{item.revision}
                {item.isFormal ? "（正式稿）" : ""}
              </option>
            ))}
          </select>

          <Btn
            icon={<Zap size={14} aria-hidden="true" />}
            onClick={() => void generateNextChapter()}
            title="触发 AI 按照已批准的细纲编写下一章正文"
          >
            写下一章
          </Btn>
          <Btn icon={<GitCompare size={14} aria-hidden="true" />} onClick={() => onOpenArea("compare")}>版本比较</Btn>
          <IconButton
            label={sideOpen ? "收起审核面板" : "展开审核面板"}
            pressed={sideOpen}
            icon={sideOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            onClick={() => setSideOpen((value) => !value)}
          />
        </div>

        <div className="nc-split" style={{ minHeight: 0 }}>
          <div className="nc-pane">
            {view === "outline" && (
              <div className="nc-pane-body">
                <div className="nc-stack" style={{ padding: 16 }}>
                  <div className="nc-row" style={{ padding: 0 }}>
                    <h2 className="nc-h2">本章目标</h2>
                    <span className="nc-spacer" />
                    <Btn onClick={() => onOpenArea("outline")}>打开细纲与合同</Btn>
                  </div>
                  <p>{dataset.outline.goal}</p>

                  <h3 className="nc-h3">必达事件</h3>
                  <div className="nc-list">
                    {dataset.outline.beats.map((beat) => (
                      <div className="nc-row" key={beat.id} style={{ padding: "6px 0" }}>
                        <Badge tone={beat.addressed ? "ok" : beat.mandatory ? "block" : "neutral"}>
                          {beat.addressed ? "已写" : beat.mandatory ? "必达未写" : "可选"}
                        </Badge>
                        <span className="nc-em">{beat.text}</span>
                      </div>
                    ))}
                  </div>

                  <h3 className="nc-h3">限制</h3>
                  <div className="nc-list">
                    {dataset.outline.constraints.map((constraint) => (
                      <div className="nc-row" key={constraint.id} style={{ padding: "6px 0" }}>
                        <Badge tone="neutral">{constraint.kind}</Badge>
                        <span>{constraint.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {view === "prose" && (
              <>
                {buffer.recoverableDraft && (
                  <div style={{ padding: "10px 14px 0" }}>
                    <Alert tone="warn" title="发现上次未保存的正文">
                      <span>
                        上次编辑在保存前中断（{formatDateTime(buffer.recoverableDraft.savedAt)}）。
                        可恢复这份本地草稿，或保留当前服务端版本。
                      </span>
                      <span className="nc-btn-group" style={{ marginTop: 8 }}>
                        <Btn variant="primary" onClick={buffer.recoverDraft}>恢复草稿</Btn>
                        <Btn onClick={buffer.discardDraft}>丢弃草稿</Btn>
                      </span>
                    </Alert>
                  </div>
                )}
                <ProseEditor
                candidate={candidate}
                buffer={buffer}
                reviewCounts={counts}
                staleReview={chapter.staleReview}
                locate={pendingLocate}
                onOpenCompare={() => onOpenArea("compare")}
                onOpenReview={() => setSideOpen(true)}
                onCreateCandidateFrom={() => void createCandidateFromVersion(candidate.id)}
                onReaudit={() => void auditChapter()}
                onRevise={(mode, force) => void reviseChapter(mode, force)}
                busy={revising}
              />
              </>
            )}

            {view === "review" && (
              <div className="nc-pane-body" style={{ padding: 14 }}>
                <ReviewPanel
                  items={dataset.reviewItems}
                  filter={reviewFilter}
                  onFilter={setReviewFilter}
                  onResolve={(id) => void resolveReviewItem(id)}
                  onWaive={(id, reason) => void waiveReviewItem(id, reason)}
                  onLocate={(item) => requestLocate(item.evidence.offset)}
                />
              </div>
            )}

            {view === "history" && (
              <div className="nc-pane-body" style={{ padding: 14 }}>
                <div className="nc-stack" style={{ gap: 10 }}>
                  <p className="nc-meta">
                    <Clock size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> 正式稿只读查看，编辑产生候选；生成内容落在独立预览中，采纳只新增候选，不覆盖正在编辑的正文。
                  </p>
                  {dataset.candidates.map((item) => (
                    <article className="nc-card nc-card-pad nc-stack" key={item.id} style={{ gap: 8 }}>
                      <div className="nc-row" style={{ padding: 0, flexWrap: "wrap", gap: 8 }}>
                        <Badge tone={item.isFormal ? "ok" : "brand"}>{item.label}</Badge>
                        <Badge tone="neutral">{SOURCE_LABEL[item.source]}</Badge>
                        <span className="nc-num nc-meta">r{item.revision}</span>
                        <span className="nc-meta">{formatNumber(countCjk(item.body))} 字</span>
                        <span className="nc-meta">· {formatRelative(item.updatedAt)}</span>
                        <span className="nc-spacer" />
                        {item.isFormal ? (
                          <span className="nc-meta">正式稿 · 只读参考</span>
                        ) : item.archived ? (
                          <Btn
                            variant="primary"
                            onClick={() => void createCandidateFromVersion(item.id)}
                            title="以这一版历史归档为基础创建新候选并编辑"
                          >
                            基于此版本创建候选
                          </Btn>
                        ) : (
                          <>
                            <Btn onClick={() => selectCandidate(item.id)} disabled={item.id === candidate.id}>
                              {item.id === candidate.id ? "正在编辑" : "切换编辑"}
                            </Btn>
                            {item.source === "generated" && (
                              <Btn
                                icon={<Sparkles size={14} aria-hidden="true" />}
                                onClick={() => void adoptCandidate(item.id)}
                                title="采纳为新候选，不覆盖当前正文"
                              >
                                采纳为新候选
                              </Btn>
                            )}
                          </>
                        )}
                      </div>
                      <p className="nc-meta">基线：{item.baseline} · 更新于 {formatDateTime(item.updatedAt)}</p>
                      {item.source === "generated" && (
                        <p className="nc-evidence">{item.body.split("\n").filter(Boolean).at(-1)}</p>
                      )}
                    </article>
                  ))}

                  {demoMode && (
                    <>
                      <h3 className="nc-h3">
                        <ListChecks size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> 模拟操作记录（演示）
                      </h3>
                      <div className="nc-timeline">
                        <TimelineRow label="候选 r8 已保存" detail="2026-09-16 09:12 · 手改候选" tone="ok" />
                        <TimelineRow label="审核标记为过期" detail="细纲 r6 相对已批准的 r5 有变更" tone="warn" />
                        <TimelineRow label="生成候选 g3 完成" detail="任务 t-8842 · 未采纳" tone="info" />
                        <TimelineRow label="正式稿 r7 提交" detail="2026-09-14 23:05 · commit 已落盘" tone="ok" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <aside className="nc-side" data-open={sideOpen} aria-label="审核面板">
            <div className="nc-side-head">
              <span className="nc-label" style={{ flex: 1 }}>审核</span>
              <Badge tone="block">{counts.block}</Badge>
              <Badge tone="warn">{counts.warn}</Badge>
              <Badge tone="info">{counts.suggest}</Badge>
              <IconButton label="收起审核面板" icon={<PanelRightClose size={15} />} onClick={() => setSideOpen(false)} />
            </div>
            <div className="nc-side-body">
              {/* The review tab already shows the full panel in the main pane;
                  rendering it here too produced two interactive copies. */}
              {view === "review" ? (
                <p className="nc-meta">审核项已在主区域展开，可在此面板收起后专注正文。</p>
              ) : (
                <ReviewPanel
                  items={dataset.reviewItems}
                  filter={reviewFilter}
                  onFilter={setReviewFilter}
                  onResolve={(id) => void resolveReviewItem(id)}
                  onWaive={(id, reason) => void waiveReviewItem(id, reason)}
                  onLocate={(item) => requestLocate(item.evidence.offset)}
                  onFix={(item) => void fixReviewItem(item.id)}
                  busy={revising}
                />
              )}
            </div>
          </aside>
        </div>

        <div className="nc-statebar">
          <span className="nc-meta">
            <CircleDot size={12} aria-hidden="true" style={{ verticalAlign: "-2px" }} />
            {" "}保存候选与提交正式稿是两件事
          </span>
          <span className="nc-spacer" />
          <Btn
            variant="primary"
            icon={<Save size={14} aria-hidden="true" />}
            onClick={() => setCommitOpen(true)}
            title="打开提交确认，核对门禁清单后提交"
          >
            提交确认
          </Btn>
        </div>
      </div>

      <CommitDialog
        open={commitOpen}
        onClose={() => setCommitOpen(false)}
        preview={preview}
        candidateLabel={candidate.label}
        candidateRevision={candidate.revision}
        demoMode={demoMode}
        onBlocked={() => setSideOpen(true)}
        onCommitted={() => { setCommitOpen(false); void refreshChapterContext(); }}
        onOpenDiagnostics={() => { setCommitOpen(false); onOpenArea("settings"); }}
      />
    </div>
  );
}

function TimelineRow({ label, detail, tone }: { readonly label: string; readonly detail: string; readonly tone: "ok" | "warn" | "info" }) {
  return (
    <div className="nc-tl-item" data-kind={tone === "info" ? "promise" : tone}>
      <div className="nc-tl-rail">
        <span className="nc-tl-node" />
        <span className="nc-tl-line" />
      </div>
      <div className="nc-tl-body">
        <span className="nc-em">{label}</span>
        <span className="nc-meta">{detail}</span>
      </div>
    </div>
  );
}




