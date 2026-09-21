/**
 * 连载分析 — 连续性 (F-20) / 伏笔与承诺 (F-21) / 爽点与节奏 (F-22).
 *
 * Everything on this page is read from the typed dataset:
 *   · continuity changes and narrative promises come from `dataset.analytics`;
 *   · the pacing curve reuses `dataset.research.m3` (one home for the series,
 *     a second entry that jumps to the same source rather than a rival copy);
 *   · emotional-debt records reuse packages/core PacingDebtEngine's own
 *     `EmotionalDebtRecord` shape, and the unresolved / overdue / payoff counts
 *     are derived from them — no chart number is authored here.
 *
 * "缺少数据", "模型无法判断" and "规则不适用" keep their own verdicts and are
 * never plotted or scored as zero. Every surface also offers an equivalent
 * table, and every row can jump back to the prose it came from.
 */

import { useMemo, useState } from "react";
import { Activity, Crosshair, Link2, ShieldAlert, TrendingUp } from "lucide-react";
import type { ContinuityVerdict, M3Point, M3Verdict, PromiseStage } from "../types";
import { useWorkbench } from "../state/store";
import { Alert, Badge, Btn, Empty, Tabs, type Tone } from "../ui";

const CONTINUITY_META: Record<ContinuityVerdict, { label: string; tone: Tone }> = {
  ok: { label: "一致", tone: "ok" },
  warn: { label: "需注意", tone: "warn" },
  block: { label: "冲突", tone: "block" },
  insufficient_data: { label: "缺少数据", tone: "neutral" },
};

const CONFLICT_LABEL = { persona: "人设", power: "力量", timeline: "时间线" } as const;

const STAGE_META: Record<PromiseStage, { label: string; tone: Tone }> = {
  introduced: { label: "已埋设", tone: "neutral" },
  advanced: { label: "推进中", tone: "info" },
  fulfilled: { label: "已兑现", tone: "ok" },
  deferred: { label: "已延期", tone: "warn" },
  abandoned: { label: "已放弃", tone: "neutral" },
};

const PACING_META: Record<M3Verdict, { label: string; tone: Tone }> = {
  ok: { label: "正常", tone: "ok" },
  warn: { label: "需注意", tone: "warn" },
  block: { label: "阻断", tone: "block" },
  insufficient_data: { label: "数据不足", tone: "neutral" },
  unverifiable: { label: "模型无法判断", tone: "neutral" },
  not_applicable: { label: "规则不适用", tone: "neutral" },
};

type Tab = "continuity" | "promises" | "pacing";

const CHART = { w: 720, h: 232, l: 46, r: 18, t: 24, b: 32 };

function isScored(verdict: M3Verdict): boolean {
  return verdict === "ok" || verdict === "warn" || verdict === "block";
}

function chapterNumber(label: string): number {
  const match = label.match(/\d+/);
  return match ? Number(match[0]) : Number.NaN;
}

/** Pure geometry over the existing series — it never invents a value. */
function buildChart(points: readonly M3Point[]) {
  const scored = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => isScored(point.verdict));
  const magnitude = Math.max(1, ...scored.map(({ point }) => Math.abs(point.net)));
  const plotW = CHART.w - CHART.l - CHART.r;
  const plotH = CHART.h - CHART.t - CHART.b;
  const x = (index: number) =>
    points.length <= 1 ? CHART.l + plotW / 2 : CHART.l + (plotW * index) / (points.length - 1);
  const y = (net: number) => CHART.t + plotH * (1 - (net + magnitude) / (2 * magnitude));

  const runs: Array<Array<{ x: number; y: number }>> = [];
  let run: Array<{ x: number; y: number }> = [];
  scored.forEach(({ point, index }, position) => {
    const previous = scored[position - 1];
    if (previous && index - previous.index !== 1) {
      if (run.length > 0) runs.push(run);
      run = [];
    }
    run.push({ x: x(index), y: y(point.net) });
  });
  if (run.length > 0) runs.push(run);

  const bridges = scored
    .slice(1)
    .map((entry, position) => [scored[position], entry] as const)
    .filter(([from, to]) => to.index - from.index !== 1);

  return { scored, x, y, zero: y(0), runs, bridges };
}

export function Analytics() {
  const dataset = useWorkbench((state) => state.dataset);
  const requestLocate = useWorkbench((state) => state.requestLocate);
  const [tab, setTab] = useState<Tab>("continuity");

  const analytics = dataset?.analytics ?? null;
  const pacing = dataset?.research.m3 ?? [];

  const derived = useMemo(() => {
    const debts = analytics?.debts ?? [];
    const unresolved = debts.filter((debt) => debt.status === "pending");
    const overdue = unresolved.filter((debt) => (analytics?.currentChapter ?? 0) >= debt.dueChapter);
    const fulfilled = debts.filter((debt) => debt.status === "fulfilled" && debt.fulfilledChapter !== undefined);
    const payoffsByChapter = new Map<number, number>();
    for (const debt of fulfilled) {
      const chapter = debt.fulfilledChapter as number;
      payoffsByChapter.set(chapter, (payoffsByChapter.get(chapter) ?? 0) + 1);
    }
    const scored = pacing.filter((point) => isScored(point.verdict));
    const unscored = pacing.filter((point) => !isScored(point.verdict));
    return { unresolved, overdue, fulfilled, payoffsByChapter, scored, unscored };
  }, [analytics, pacing]);

  if (!dataset || !analytics) {
    return (
      <div className="nc-page-body">
        <Empty
          icon={<Activity size={18} aria-hidden="true" />}
          title="没有可分析的数据"
          detail="连载分析依赖已写入的章节、候选与审核记录。先建立作品与章节，再回到这里。"
        />
      </div>
    );
  }

  const nothingToAnalyze =
    analytics.continuity.length === 0 && analytics.promises.length === 0 && pacing.length === 0;

  if (nothingToAnalyze) {
    return (
      <div className="nc-page-body">
        <Empty
          icon={<Activity size={18} aria-hidden="true" />}
          title="数据不足，暂时无法分析"
          detail="本作品还没有可分析的正文与索引。这里是「数据不足」，不是 0 分——补齐章节并建立索引后再查看。"
        />
      </div>
    );
  }

  const chart = buildChart(pacing);
  const maxPayoff = Math.max(1, ...Array.from(derived.payoffsByChapter.values()));

  return (
    <>
      <header className="nc-page-head">
        <div>
          <h1 className="nc-page-title">连载分析</h1>
          <p className="nc-page-desc">
            把连续性、伏笔承诺与追读节奏放在同一处复盘。曲线始终配有等价表格，缺数据、模型无法判断与规则不适用各有独立标签，不会画成 0 分；每一行都能跳回正文证据。
          </p>
        </div>
        <div className="nc-btn-group">
          <Badge tone={derived.overdue.length > 0 ? "block" : "ok"}>
            逾期债务 {derived.overdue.length}
          </Badge>
          <Badge tone="neutral">当前第 {analytics.currentChapter} 章</Badge>
        </div>
      </header>

      <Tabs
        label="连载分析视图"
        value={tab}
        onChange={setTab}
        items={[
          { id: "continuity", label: "连续性", count: analytics.continuity.length },
          { id: "promises", label: "伏笔与承诺", count: analytics.promises.length },
          { id: "pacing", label: "爽点与节奏", count: pacing.length },
        ]}
      />

      {tab === "continuity" && (
        <div className="nc-page-body">
          <div className="nc-stack" style={{ gap: 12 }}>
            <Alert tone="info" title="连续性按章节列出实体状态变化">
              每条变化给出冲突轴（人设 / 力量 / 时间线）、变更前后的说法与正文证据。缺少正文的章节标为「缺少数据」，不参与判定。
            </Alert>

            <div className="nc-timeline">
              {analytics.continuity.map((change) => {
                const meta = CONTINUITY_META[change.verdict];
                return (
                  <div
                    className="nc-tl-item"
                    key={change.id}
                    data-kind={change.verdict === "block" ? "hook" : change.verdict === "ok" ? "payoff" : "promise"}
                  >
                    <div className="nc-tl-rail">
                      <span className="nc-tl-node" aria-hidden="true" />
                      <span className="nc-tl-line" aria-hidden="true" />
                    </div>
                    <div className="nc-tl-body">
                      <div className="nc-cluster">
                        <Badge tone="neutral">{change.chapterLabel}</Badge>
                        <Badge tone="info">{CONFLICT_LABEL[change.conflict]}</Badge>
                        <span className="nc-em">{change.subject}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <span className="nc-spacer" />
                        <Btn
                          icon={<Crosshair size={14} aria-hidden="true" />}
                          onClick={() => requestLocate(change.offset)}
                          title="跳到该章节的正文证据"
                        >
                          定位原文
                        </Btn>
                      </div>
                      <p className="nc-meta" style={{ margin: "2px 0 0" }}>
                        <span className="nc-em">变更前：</span>
                        {change.before}
                      </p>
                      <p className="nc-meta" style={{ margin: 0 }}>
                        <span className="nc-em">变更后：</span>
                        {change.after}
                      </p>
                      <p className="nc-meta" style={{ margin: 0 }}>{change.note}</p>
                      <p className="nc-evidence">“{change.quote}”</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "promises" && (
        <div className="nc-page-body nc-stack" style={{ gap: 12 }}>
          <Alert tone="info" title="承诺是对读者的约定">
            状态覆盖已埋设 / 推进中 / 已兑现 / 已延期 / 已放弃；每条都标明埋设章与约定回收章。已放弃是作者的显式决定，不计为逾期。
          </Alert>

          <div className="nc-pill-row">
            {(Object.keys(STAGE_META) as PromiseStage[]).map((stage) => {
              const count = analytics.promises.filter((promise) => promise.stage === stage).length;
              return (
                <span className="nc-pill" key={stage}>
                  <span className="nc-em">{STAGE_META[stage].label}</span>
                  <span className="nc-num">{count}</span>
                </span>
              );
            })}
          </div>

          <div className="nc-list">
            {analytics.promises.map((promise) => (
              <article className="nc-card nc-card-pad nc-stack" key={promise.id} style={{ gap: 6 }}>
                <div className="nc-cluster">
                  <span className="nc-em">{promise.text}</span>
                  <Badge tone={STAGE_META[promise.stage].tone}>{STAGE_META[promise.stage].label}</Badge>
                </div>
                <div className="nc-cluster">
                  <span className="nc-meta">
                    plantedAt：<span className="nc-num">{promise.plantedAt}</span>
                  </span>
                  <span className="nc-meta">·</span>
                  <span className="nc-meta">
                    dueBy：<span className="nc-num">{promise.dueBy}</span>
                  </span>
                  <span className="nc-meta">· 证据章 {promise.chapterLabel}</span>
                </div>
                <p className="nc-evidence">“{promise.evidence}”</p>
                <div className="nc-btn-group">
                  <Btn
                    icon={<Crosshair size={14} aria-hidden="true" />}
                    onClick={() => requestLocate(promise.offset)}
                  >
                    定位原文
                  </Btn>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {tab === "pacing" && (
        <div className="nc-page-body nc-stack" style={{ gap: 14 }}>
          <Alert tone="info" title="曲线始终配有等价表格">
            折线是阅读辅助，下面的表格是同一份数据的完整表达。标为「数据不足」的章节不参与连线，也不会被计成 0。
          </Alert>

          <div className="nc-pill-row">
            <span className="nc-pill" data-tone="brand">
              <span className="nc-em">已评分章</span>
              <span className="nc-num">{derived.scored.length}</span>
            </span>
            <span className="nc-pill">
              <span className="nc-em">数据不足章</span>
              <span className="nc-num">{derived.unscored.length}</span>
            </span>
            <span className="nc-pill">
              <span className="nc-em">未兑现债务</span>
              <span className="nc-num">{derived.unresolved.length}</span>
            </span>
            <span className="nc-pill" data-tone={derived.overdue.length > 0 ? "seal" : "ok"}>
              <span className="nc-em">已逾期</span>
              <span className="nc-num">{derived.overdue.length}</span>
            </span>
            <span className="nc-pill">
              <span className="nc-em">已兑现</span>
              <span className="nc-num">{derived.fulfilled.length}</span>
            </span>
          </div>

          <section className="nc-card nc-card-pad nc-stack" style={{ gap: 10 }} aria-label="每章情绪净值曲线">
            <div className="nc-cluster">
              <h2 className="nc-h2">每章情绪净值</h2>
              <span className="nc-spacer" />
              <span className="nc-meta">
                <span className="nc-chart-swatch" data-tone="pos" aria-hidden="true" /> 净值 ≥ 0
              </span>
              <span className="nc-meta">
                <span className="nc-chart-swatch" data-tone="neg" aria-hidden="true" /> 净值 &lt; 0
              </span>
              <span className="nc-meta">
                <span className="nc-chart-swatch" data-tone="gap" aria-hidden="true" /> 缺数据断开
              </span>
            </div>

            <svg
              className="nc-chart"
              viewBox={`0 0 ${CHART.w} ${CHART.h}`}
              role="img"
              aria-label={`第 1 至第 ${pacing.length} 章的情绪净值折线，共 ${derived.scored.length} 章有评分，${derived.unscored.length} 章数据不足`}
            >
              <line
                className="nc-chart-axis"
                x1={CHART.l}
                x2={CHART.w - CHART.r}
                y1={chart.zero}
                y2={chart.zero}
              />
              {chart.bridges.map(([from, to]) => (
                <line
                  key={`gap-${from.index}-${to.index}`}
                  className="nc-chart-gap"
                  x1={chart.x(from.index)}
                  y1={chart.y(from.point.net)}
                  x2={chart.x(to.index)}
                  y2={chart.y(to.point.net)}
                />
              ))}
              {chart.runs.map((points, index) =>
                points.length > 1 ? (
                  <polyline
                    key={`run-${index}`}
                    className="nc-chart-line"
                    points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                  />
                ) : null,
              )}
              {chart.scored.map(({ point, index }) => (
                <circle
                  key={point.chapterLabel}
                  className="nc-chart-point"
                  data-neg={point.net < 0 ? "true" : "false"}
                  cx={chart.x(index)}
                  cy={chart.y(point.net)}
                  r={4}
                />
              ))}
              {pacing.map((point, index) => (
                <text
                  key={`tick-${point.chapterLabel}`}
                  className="nc-chart-tick"
                  data-muted={isScored(point.verdict) ? "false" : "true"}
                  x={chart.x(index)}
                  y={CHART.h - 10}
                  textAnchor="middle"
                >
                  {index + 1}
                </text>
              ))}
            </svg>
            <p className="nc-meta" style={{ margin: 0 }}>
              横轴为章节序号（1–{pacing.length}），纵轴为情绪净值，刻度对称到 ±{Math.max(1, ...chart.scored.map(({ point }) => Math.abs(point.net)))}。
            </p>
          </section>

          <section className="nc-card nc-card-pad nc-stack" style={{ gap: 10 }} aria-label="每章兑现次数">
            <h2 className="nc-h2">每章兑现次数</h2>
            <div className="nc-chart-bars">
              {pacing.map((point) => {
                const number = chapterNumber(point.chapterLabel);
                const count = derived.payoffsByChapter.get(number) ?? 0;
                return (
                  <div className="nc-chart-bar" key={`bar-${point.chapterLabel}`}>
                    <span className="nc-chart-bar-track">
                      <span
                        className="nc-chart-bar-fill"
                        style={{ height: `${(count / maxPayoff) * 100}%` }}
                      />
                    </span>
                    <span className="nc-num nc-meta">{count}</span>
                    <span className="nc-meta nc-truncate" title={point.chapterLabel}>
                      {point.chapterLabel.replace("第 ", "").replace(" 章", "")}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="nc-meta" style={{ margin: 0 }}>
              兑现次数来自已兑现的情绪债务记录（<span className="nc-num">fulfilledChapter</span>），不是另行统计的数字。
            </p>
          </section>

          <section className="nc-stack" style={{ gap: 8 }} aria-label="节奏曲线等价表格">
            <h2 className="nc-h2">等价表格</h2>
            <div className="nc-card" style={{ overflow: "hidden" }}>
              <table className="nc-table">
                <caption className="nc-visually-hidden">每章情绪净值、判定、兑现次数与备注</caption>
                <thead>
                  <tr>
                    <th scope="col">章节</th>
                    <th scope="col">情绪净值</th>
                    <th scope="col">判定</th>
                    <th scope="col">兑现次数</th>
                    <th scope="col">备注</th>
                    <th scope="col">正文</th>
                  </tr>
                </thead>
                <tbody>
                  {pacing.map((point) => {
                    const scored = isScored(point.verdict);
                    return (
                      <tr key={point.chapterLabel}>
                        <th scope="row" className="nc-nowrap">{point.chapterLabel}</th>
                        <td className="nc-num">{scored ? point.net.toFixed(1) : "—"}</td>
                        <td>
                          <Badge tone={PACING_META[point.verdict].tone}>{PACING_META[point.verdict].label}</Badge>
                        </td>
                        <td className="nc-num">
                          {derived.payoffsByChapter.get(chapterNumber(point.chapterLabel)) ?? 0}
                        </td>
                        <td>{point.note}</td>
                        <td>
                          <Btn
                            icon={<Crosshair size={14} aria-hidden="true" />}
                            onClick={() => requestLocate(60)}
                          >
                            定位
                          </Btn>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="nc-stack" style={{ gap: 8 }} aria-label="情绪债务与预警">
            <h2 className="nc-h2">情绪债务与预警</h2>
            <div className="nc-list">
              {analytics.pacingAlerts.map((notice) => (
                <div className="nc-alert" key={notice} data-tone="warn">
                  <TrendingUp size={15} aria-hidden="true" style={{ marginTop: 2, flex: "none" }} />
                  <div className="nc-alert-body">
                    <span>{notice}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="nc-card" style={{ overflow: "hidden" }}>
              <table className="nc-table">
                <caption className="nc-visually-hidden">情绪债务记录</caption>
                <thead>
                  <tr>
                    <th scope="col">债务类型</th>
                    <th scope="col">埋设章</th>
                    <th scope="col">约定兑现</th>
                    <th scope="col">状态</th>
                    <th scope="col">来源上下文</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.debts.map((debt) => (
                    <tr key={debt.id}>
                      <th scope="row" className="nc-nowrap">{debt.type}</th>
                      <td className="nc-num">第 {debt.chapter} 章</td>
                      <td className="nc-num">
                        第 {debt.dueChapter} 章
                        {debt.status === "fulfilled" && debt.fulfilledChapter !== undefined
                          ? `（实际第 ${debt.fulfilledChapter} 章）`
                          : ""}
                      </td>
                      <td>
                        <Badge
                          tone={
                            debt.status === "fulfilled"
                              ? "ok"
                              : debt.status === "cancelled"
                                ? "neutral"
                                : debt.status === "overdue"
                                  ? "block"
                                  : "warn"
                          }
                        >
                          {debt.status === "fulfilled"
                            ? "已兑现"
                            : debt.status === "cancelled"
                              ? "已取消"
                              : debt.status === "overdue"
                                ? "已逾期"
                                : "待兑现"}
                        </Badge>
                      </td>
                      <td>{debt.sourceContext}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export function AnalyticsNote() {
  return (
    <p className="nc-meta">
      <Link2 size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> 连续性、伏笔承诺与节奏都跳到同一份正文证据；
      <ShieldAlert size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> 硬性冲突会进入审核阻断，而不是只在这里提示。
    </p>
  );
}
