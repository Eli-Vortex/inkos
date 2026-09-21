/**
 * 版本比较 — compare two explicit versions with their provenance stated.
 *
 * Supports two distinct modes:
 *   1. 章内版本对比 (Intra-chapter diff): compare candidate drafts or historical revisions of the active chapter.
 *   2. 跨章节前后对照 (Cross-chapter diff): compare two consecutive or chosen chapters to inspect narrative pacing and continuity.
 *
 * Neither mode mutates any stored chapter or version.
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, BookOpen, Clock, FileText, GitCompare, Layers, PenLine } from "lucide-react";
import { useWorkbench } from "../state/store";
import { DiffView } from "../components/DiffView";
import { Alert, Badge, Btn, Empty, Tabs } from "../ui";
import { fetchJson } from "../../hooks/use-api";
import { countCjk, formatDateTime, formatNumber } from "../format";
import type { Candidate } from "../types";

type CompareMode = "intra" | "cross";

export function CompareView() {
  const dataset = useWorkbench((state) => state.dataset);
  const activeBookId = useWorkbench((state) => state.activeBookId);
  const activeChapterId = useWorkbench((state) => state.activeChapterId);
  const selectChapter = useWorkbench((state) => state.selectChapter);
  const compareBaseId = useWorkbench((state) => state.compareBaseId);
  const compareTargetId = useWorkbench((state) => state.compareTargetId);
  const setCompare = useWorkbench((state) => state.setCompare);
  const goArea = useWorkbench((state) => state.goArea);

  const [mode, setMode] = useState<CompareMode>("intra");

  const bookChapters = useMemo(
    () => (dataset?.chapters ?? []).filter((item) => item.bookId === activeBookId),
    [dataset, activeBookId],
  );
  const currentChapter = bookChapters.find((item) => item.id === activeChapterId)
    ?? bookChapters[0]
    ?? null;

  // ── Intra-chapter candidates ──────────────────────────────────────────────
  const candidates = dataset?.candidates ?? [];
  const base = candidates.find((item) => item.id === compareBaseId)
    ?? candidates.find((item) => item.isFormal)
    ?? candidates[0]
    ?? null;
  const target = candidates.find((item) => item.id === compareTargetId)
    ?? candidates.find((item) => item.id !== base?.id)
    ?? candidates[1]
    ?? null;

  // ── Cross-chapter state ───────────────────────────────────────────────────
  const [crossBaseNum, setCrossBaseNum] = useState<number>(() => currentChapter?.number ?? 1);
  const [crossTargetNum, setCrossTargetNum] = useState<number>(() => (currentChapter?.number ?? 1) + 1);
  const [crossBaseText, setCrossBaseText] = useState<string | null>(null);
  const [crossTargetText, setCrossTargetText] = useState<string | null>(null);
  const [crossLoading, setCrossLoading] = useState(false);

  useEffect(() => {
    if (mode !== "cross" || !activeBookId) return;
    let cancelled = false;
    setCrossLoading(true);

    const loadPair = async () => {
      try {
        const [r1, r2] = await Promise.all([
          fetchJson<{ content?: string }>(`/books/${encodeURIComponent(activeBookId)}/chapters/${crossBaseNum}`).catch(() => ({ content: "" })),
          fetchJson<{ content?: string }>(`/books/${encodeURIComponent(activeBookId)}/chapters/${crossTargetNum}`).catch(() => ({ content: "" })),
        ]);
        if (cancelled) return;
        setCrossBaseText(r1.content ?? "");
        setCrossTargetText(r2.content ?? "");
      } finally {
        if (!cancelled) setCrossLoading(false);
      }
    };

    void loadPair();
    return () => { cancelled = true; };
  }, [mode, activeBookId, crossBaseNum, crossTargetNum]);

  const crossBaseChapter = bookChapters.find((c) => c.number === crossBaseNum);
  const crossTargetChapter = bookChapters.find((c) => c.number === crossTargetNum);

  const crossBaseCandidate: Candidate | null = crossBaseChapter ? {
    id: `cross-ch-${crossBaseNum}`,
    label: `第 ${crossBaseNum} 章 · ${crossBaseChapter.title}`,
    revision: 1,
    source: "hand",
    updatedAt: crossBaseChapter.updatedAt,
    baseline: "章节正文",
    wordCount: countCjk(crossBaseText ?? ""),
    body: crossBaseText ?? "",
    isFormal: true,
  } : null;

  const crossTargetCandidate: Candidate | null = crossTargetChapter ? {
    id: `cross-ch-${crossTargetNum}`,
    label: `第 ${crossTargetNum} 章 · ${crossTargetChapter.title}`,
    revision: 1,
    source: "hand",
    updatedAt: crossTargetChapter.updatedAt,
    baseline: "章节正文",
    wordCount: countCjk(crossTargetText ?? ""),
    body: crossTargetText ?? "",
    isFormal: true,
  } : null;

  if (!dataset || bookChapters.length === 0) {
    return (
      <div className="nc-page-body">
        <Empty
          icon={<GitCompare size={18} aria-hidden="true" />}
          title="当前作品暂无章节"
          detail="先在写作工作区创建并编写章节，再回到这里进行版本比对。"
          action={<Btn variant="primary" onClick={() => goArea("writing")}>前往写作工作区</Btn>}
        />
      </div>
    );
  }

  return (
    <>
      <header className="nc-page-head">
        <div>
          <h1 className="nc-page-title">版本比较</h1>
          <p className="nc-page-desc">
            支持本章候选版本差异对照，以及跨章节前后文行内对照。比较属于只读视图，不会对任何正文进行修改。
          </p>
        </div>
        <div className="nc-btn-group">
          <Tabs
            label="比对模式"
            value={mode}
            items={[
              { id: "intra", label: "章内版本对比" },
              { id: "cross", label: "跨章节对照", count: bookChapters.length },
            ]}
            onChange={(val) => setMode(val as CompareMode)}
          />
        </div>
      </header>

      {/* ── Mode 1: Intra-chapter comparison ─────────────────────────────── */}
      {mode === "intra" && (
        <>
          <div className="nc-band" style={{ flexWrap: "wrap", gap: 12 }}>
            <div className="nc-row" style={{ padding: 0, gap: 6 }}>
              <label className="nc-meta" htmlFor="nc-chapter-picker" style={{ fontWeight: 600 }}>选择章节</label>
              <select
                id="nc-chapter-picker"
                className="nc-select"
                style={{ width: "auto", minWidth: 180, maxWidth: 280 }}
                value={currentChapter?.id ?? ""}
                onChange={(e) => void selectChapter(e.target.value)}
                title="切换要比对版本的章节"
              >
                {bookChapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    第 {ch.number} 章 · {ch.title}
                  </option>
                ))}
              </select>
            </div>

            {candidates.length >= 2 && base && target && (
              <>
                <span className="nc-crumb-sep" aria-hidden="true">|</span>
                <div className="nc-row" style={{ padding: 0, gap: 6 }}>
                  <label className="nc-meta" htmlFor="nc-diff-base">基线版本</label>
                  <select
                    id="nc-diff-base"
                    className="nc-select"
                    style={{ width: "auto", maxWidth: 220 }}
                    value={base.id}
                    onChange={(event) => setCompare(event.target.value, target.id)}
                  >
                    {candidates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} · r{item.revision}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="nc-row" style={{ padding: 0, gap: 6 }}>
                  <label className="nc-meta" htmlFor="nc-diff-target">对比版本</label>
                  <select
                    id="nc-diff-target"
                    className="nc-select"
                    style={{ width: "auto", maxWidth: 220 }}
                    value={target.id}
                    onChange={(event) => setCompare(base.id, event.target.value)}
                  >
                    {candidates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} · r{item.revision}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="nc-page-body nc-stack" style={{ gap: 14 }}>
            {candidates.length >= 2 && base && target ? (
              <>
                {base.id === target.id && (
                  <Alert tone="info" title="基线与对比选择的是同一版本">
                    请在上方切换基线或对比下拉框，以查看不同候选之间的行内变动。
                  </Alert>
                )}
                <DiffView base={base} target={target} onSwap={() => setCompare(target.id, base.id)} />
              </>
            ) : (
              <div className="nc-card nc-card-pad nc-stack" style={{ gap: 12 }}>
                <div className="nc-row" style={{ padding: 0 }}>
                  <div className="nc-stack" style={{ gap: 4 }}>
                    <div className="nc-row" style={{ padding: 0, gap: 8 }}>
                      <span className="nc-h2">第 {currentChapter?.number} 章 · {currentChapter?.title}</span>
                      <Badge tone="neutral">当前仅 1 个版本</Badge>
                      {base && <Badge tone="brand">r{base.revision}</Badge>}
                    </div>
                    <p className="nc-meta">
                      本章当前仅有一份正文（{formatNumber(base?.wordCount ?? currentChapter?.wordCount ?? 0)} 字）。
                      在写作区编辑保存新候选、或从历史版本中恢复旧稿后，即可在此进行多版本左右/行内差异对照。
                    </p>
                  </div>
                  <span className="nc-spacer" />
                  <div className="nc-btn-group">
                    <Btn variant="primary" icon={<PenLine size={14} aria-hidden="true" />} onClick={() => goArea("writing")}>
                      前往写作区编辑
                    </Btn>
                    <Btn icon={<ArrowLeftRight size={14} aria-hidden="true" />} onClick={() => setMode("cross")}>
                      跨章节前后对照
                    </Btn>
                  </div>
                </div>

                {base && base.body && (
                  <div style={{ marginTop: 8, borderTop: "1px solid var(--nc-hairline)", paddingTop: 12 }}>
                    <div className="nc-row" style={{ padding: "0 0 8px 0" }}>
                      <span className="nc-em" style={{ fontSize: 13 }}>当前版本文本预览</span>
                      <span className="nc-spacer" />
                      <span className="nc-meta">{formatDateTime(base.updatedAt)}</span>
                    </div>
                    <div
                      style={{
                        padding: "12px 16px",
                        background: "var(--nc-panel-2)",
                        borderRadius: "var(--nc-r-md)",
                        fontFamily: "var(--nc-font-serif)",
                        fontSize: 14,
                        lineHeight: 1.8,
                        maxHeight: "55vh",
                        overflowY: "auto",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {base.body}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Mode 2: Cross-chapter comparison ─────────────────────────────── */}
      {mode === "cross" && (
        <>
          <div className="nc-band" style={{ flexWrap: "wrap", gap: 12 }}>
            <div className="nc-row" style={{ padding: 0, gap: 6 }}>
              <label className="nc-meta" htmlFor="nc-cross-base">基准章节</label>
              <select
                id="nc-cross-base"
                className="nc-select"
                style={{ width: "auto", minWidth: 160 }}
                value={crossBaseNum}
                onChange={(e) => setCrossBaseNum(parseInt(e.target.value, 10))}
              >
                {bookChapters.map((ch) => (
                  <option key={ch.id} value={ch.number}>
                    第 {ch.number} 章 · {ch.title}
                  </option>
                ))}
              </select>
            </div>

            <Btn
              variant="ghost"
              icon={<ArrowLeftRight size={13} aria-hidden="true" />}
              onClick={() => {
                const temp = crossBaseNum;
                setCrossBaseNum(crossTargetNum);
                setCrossTargetNum(temp);
              }}
              title="交换前后章节"
            >
              对调
            </Btn>

            <div className="nc-row" style={{ padding: 0, gap: 6 }}>
              <label className="nc-meta" htmlFor="nc-cross-target">对照章节</label>
              <select
                id="nc-cross-target"
                className="nc-select"
                style={{ width: "auto", minWidth: 160 }}
                value={crossTargetNum}
                onChange={(e) => setCrossTargetNum(parseInt(e.target.value, 10))}
              >
                {bookChapters.map((ch) => (
                  <option key={ch.id} value={ch.number}>
                    第 {ch.number} 章 · {ch.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="nc-page-body nc-stack" style={{ gap: 14 }}>
            {crossLoading ? (
              <div className="nc-card nc-card-pad" style={{ textAlign: "center", padding: 32 }}>
                <span className="nc-meta">正在载入两章正文比对…</span>
              </div>
            ) : crossBaseCandidate && crossTargetCandidate && crossBaseNum !== crossTargetNum ? (
              <DiffView
                base={crossBaseCandidate}
                target={crossTargetCandidate}
                onSwap={() => {
                  const temp = crossBaseNum;
                  setCrossBaseNum(crossTargetNum);
                  setCrossTargetNum(temp);
                }}
              />
            ) : (
              <Alert tone="info" title="请选择两个不同的章节">
                当前选择的基准与对照为同一章节，请在上方选择不同的章节以查看承接与文风演进差异。
              </Alert>
            )}
          </div>
        </>
      )}
    </>
  );
}
