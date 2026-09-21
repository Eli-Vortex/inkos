/**
 * 审核视图 — the full-page review surface.
 *
 * Same rules as the side panel, with room for the chapter-wide picture:
 * severity grouping, evidence with 定位原文 (jumps back into the editor and
 * selects the quote), per-item handling state and recorded false-positive
 * waivers. Hard integrity errors cannot be ignored here either.
 */

import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useWorkbench } from "../state/store";
import { ReviewPanel, reviewCounts } from "../components/ReviewPanel";
import { Alert, Badge, Btn, Empty } from "../ui";
import { fetchJson } from "../../hooks/use-api";

export function ReviewView() {
  const dataset = useWorkbench((state) => state.dataset);
  const activeBookId = useWorkbench((state) => state.activeBookId);
  const activeChapterId = useWorkbench((state) => state.activeChapterId);
  const selectChapter = useWorkbench((state) => state.selectChapter);
  const reviewFilter = useWorkbench((state) => state.reviewFilter);
  const setReviewFilter = useWorkbench((state) => state.setReviewFilter);
  const resolveReviewItem = useWorkbench((state) => state.resolveReviewItem);
  const waiveReviewItem = useWorkbench((state) => state.waiveReviewItem);
  const fixReviewItem = useWorkbench((state) => state.fixReviewItem);
  const requestLocate = useWorkbench((state) => state.requestLocate);
  const revising = useWorkbench((state) => state.revising);
  const reload = useWorkbench((state) => state.load);
  const pushToast = useWorkbench((state) => state.pushToast);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const bookChapters = useMemo(
    () => (dataset?.chapters ?? []).filter((item) => item.bookId === activeBookId),
    [dataset, activeBookId],
  );
  const currentChapter = bookChapters.find((item) => item.id === activeChapterId)
    ?? bookChapters[0]
    ?? null;

  const decideChapter = async (kind: "approve" | "reject") => {
    if (!activeBookId || !currentChapter || busy) return;
    setBusy(kind);
    try {
      await fetchJson(
        `/books/${encodeURIComponent(activeBookId)}/chapters/${currentChapter.number}/${kind}`,
        { method: "POST" },
      );
      pushToast({
        tone: kind === "approve" ? "ok" : "warn",
        title: kind === "approve" ? "已提交本章" : "已驳回本章",
        detail: kind === "approve" ? "本章正式稿已确认。" : "本章已退回，可继续修订。",
      });
      await reload();
    } catch (error) {
      pushToast({
        tone: "block",
        title: kind === "approve" ? "提交失败" : "驳回失败",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  if (!dataset) {
    return (
      <div className="nc-page-body">
        <Empty
          icon={<ShieldCheck size={18} aria-hidden="true" />}
          title="没有可审核的内容"
          detail="选择一部作品与章节后，审核结果会显示在这里。"
        />
      </div>
    );
  }

  const counts = reviewCounts(dataset.reviewItems);
  const hasStale = dataset.chapters.some((chapter) => chapter.staleReview);

  return (
    <>
      <header className="nc-page-head">
        <div>
          <h1 className="nc-page-title">审核视图</h1>
          <p className="nc-page-desc">
            按阻断 / 警告 / 建议分组，每条包含规则名、原文证据、建议与置信状态。误报处理必须记录原因；硬性完整性错误不能在界面中忽略后提交。
          </p>
        </div>
        <div className="nc-btn-group">
          <Badge tone="block">阻断 {counts.block}</Badge>
          <Badge tone="warn">警告 {counts.warn}</Badge>
          <Badge tone="info">建议 {counts.suggest}</Badge>
          <Btn
            variant="primary"
            disabled={!currentChapter || busy !== null || revising}
            title={revising ? "正在修订中，请稍候" : undefined}
            onClick={() => void decideChapter("approve")}
          >
            {busy === "approve" ? "提交中…" : "通过本章"}
          </Btn>
          <Btn
            variant="danger"
            disabled={!currentChapter || busy !== null || revising}
            title={revising ? "正在修订中，请稍候" : undefined}
            onClick={() => void decideChapter("reject")}
          >
            {busy === "reject" ? "驳回中…" : "审核失败 / 驳回"}
          </Btn>
        </div>
      </header>

      {bookChapters.length > 0 && (
        <div className="nc-band" style={{ flexWrap: "wrap", gap: 12 }}>
          <div className="nc-row" style={{ padding: 0, gap: 6 }}>
            <label className="nc-meta" htmlFor="nc-review-chapter" style={{ fontWeight: 600 }}>当前审查章节</label>
            <select
              id="nc-review-chapter"
              className="nc-select"
              style={{ width: "auto", minWidth: 180, maxWidth: 300 }}
              value={currentChapter?.id ?? ""}
              onChange={(e) => void selectChapter(e.target.value)}
            >
              {bookChapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  第 {ch.number} 章 · {ch.title} {ch.openBlockers > 0 ? `(${ch.openBlockers} 阻断)` : ch.openWarnings > 0 ? `(${ch.openWarnings} 警告)` : "(无阻断)"}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="nc-page-body nc-stack" style={{ gap: 14 }}>
        {hasStale && (
          <Alert tone="warn" title="部分审核结果已过期">
            细纲合同或候选基线发生变更后，旧审核不再代表当前正文。切回写作工作区重新运行审核后，这里的结论才会更新。
          </Alert>
        )}

        {counts.block > 0 && (
          <Alert tone="block" title="阻断项未处理时无法提交">
            共有 {counts.block} 条阻断项。提交确认中的门禁清单会同步显示这些条目，处理完成后才能提交正式稿。
          </Alert>
        )}

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
      </div>
    </>
  );
}
