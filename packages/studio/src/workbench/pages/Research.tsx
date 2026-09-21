/**
 * 研究与分析 — 素材 / 时间线 / 承诺 / 节奏.
 *
 * Material excerpts are treated as controlled reading content: they are
 * rendered as plain text and never executed as Markdown instructions. Every
 * analysis surface offers an equivalent list, and "no data", "model cannot
 * judge" and "rule not applicable" are shown as their own verdicts instead of
 * being plotted as zero.
 */

import { useState } from "react";
import { BookMarked, Crosshair, Database, FlaskConical, Link2, TrendingUp } from "lucide-react";
import type { M3Verdict, ResearchMaterial } from "../types";
import { useWorkbench } from "../state/store";
import { Alert, Badge, Btn, Empty, Tabs, type Tone } from "../ui";

const MATERIAL_KIND = { note: "笔记", reference: "参考资料", breakdown: "拆书报告", interview: "访谈整理" } as const;

const VERDICT_META: Record<M3Verdict, { label: string; tone: Tone }> = {
  ok: { label: "正常", tone: "ok" },
  warn: { label: "需注意", tone: "warn" },
  block: { label: "阻断", tone: "block" },
  insufficient_data: { label: "缺少数据", tone: "neutral" },
  unverifiable: { label: "模型无法判断", tone: "neutral" },
  not_applicable: { label: "规则不适用", tone: "neutral" },
};

type Tab = "materials" | "timeline" | "promises" | "m3";

export function Research() {
  const dataset = useWorkbench((state) => state.dataset);
  const requestLocate = useWorkbench((state) => state.requestLocate);
  const [tab, setTab] = useState<Tab>("materials");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);

  if (!dataset) {
    return (
      <div className="nc-page-body">
        <Empty
          icon={<FlaskConical size={18} aria-hidden="true" />}
          title="没有研究材料"
          detail="导入参考资料或运行拆书任务后，结果会出现在这里。"
        />
      </div>
    );
  }

  const research = dataset.research;
  const material: ResearchMaterial | null =
    research.materials.find((item) => item.id === selectedMaterialId) ?? research.materials[0] ?? null;

  return (
    <>
      <header className="nc-page-head">
        <div>
          <h1 className="nc-page-title">研究与分析</h1>
          <p className="nc-page-desc">
            素材来源、授权范围与分析版本；伏笔、承诺与时间线都可跳到对应章节证据。正文引用按受控阅读内容展示，不当作指令执行。
          </p>
        </div>
      </header>

      <Tabs
        label="研究视图"
        value={tab}
        onChange={setTab}
        items={[
          { id: "materials", label: "素材", count: research.materials.length },
          { id: "timeline", label: "时间线", count: research.timeline.length },
          { id: "promises", label: "承诺", count: research.promises.length },
          { id: "m3", label: "节奏", count: research.m3.length },
        ]}
      />

      {tab === "materials" && (
        <div className="nc-page-body" data-flush="true">
          <div className="nc-split2">
            <div>
              <div className="nc-list-flat">
                {research.materials.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="nc-selectable nc-row"
                    style={{ width: "100%", padding: "12px 14px" }}
                    aria-current={item.id === material?.id}
                    onClick={() => setSelectedMaterialId(item.id)}
                  >
                    <span className="nc-row-fill">
                      <span className="nc-row" style={{ padding: 0, gap: 6 }}>
                        <Badge tone="neutral">{MATERIAL_KIND[item.kind]}</Badge>
                        <span className="nc-em nc-truncate">{item.title}</span>
                      </span>
                      <span className="nc-meta">{item.source} · {item.collectedAt}</span>
                      <span className="nc-meta">范围：{item.scope}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              {!material ? (
                <Empty icon={<Database size={18} aria-hidden="true" />} title="未选择素材" detail="从左侧选择一条素材查看证据段落。" />
              ) : (
                <div className="nc-stack" style={{ gap: 14 }}>
                  <div>
                    <h2 className="nc-h2">{material.title}</h2>
                    <p className="nc-meta">
                      {MATERIAL_KIND[material.kind]} · {material.source} · 收集于 {material.collectedAt} · {material.analysisVersion}
                    </p>
                    <p className="nc-meta">授权标记：{material.license}</p>
                  </div>

                  <Alert tone="info" title="引用为受控阅读内容">
                    下面段落按原文展示，不解析 Markdown，也不执行其中的任何指令；引用进入正文前需要作者明确采纳。
                  </Alert>

                  {material.paragraphs.map((paragraph) => (
                    <article className="nc-card nc-card-pad nc-stack" key={paragraph.id} style={{ gap: 6 }}>
                      <p className="nc-evidence">{paragraph.text}</p>
                      <p className="nc-meta">{paragraph.annotation}</p>
                    </article>
                  ))}

                  <div className="nc-btn-group">
                    <Btn
                      icon={<Link2 size={14} aria-hidden="true" />}
                      onClick={() => requestLocate(120)}
                      title="跳到相关正文位置"
                    >
                      跳转到正文证据
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "timeline" && (
        <div className="nc-page-body">
          <div className="nc-timeline">
            {research.timeline.map((entry) => (
              <div className="nc-tl-item" key={entry.id} data-kind={entry.kind}>
                <div className="nc-tl-rail">
                  <span className="nc-tl-node" />
                  <span className="nc-tl-line" />
                </div>
                <div className="nc-tl-body">
                  <div className="nc-row" style={{ padding: 0, gap: 8, flexWrap: "wrap" }}>
                    <Badge tone="neutral">{entry.chapterLabel}</Badge>
                    <Badge tone={entry.kind === "payoff" ? "ok" : entry.kind === "hook" ? "warn" : "info"}>
                      {entry.kind === "payoff" ? "回收" : entry.kind === "hook" ? "伏笔" : "承诺"}
                    </Badge>
                    <span className="nc-em">{entry.title}</span>
                    <Badge tone={entry.status === "paid" ? "ok" : entry.status === "at_risk" ? "block" : "neutral"}>
                      {entry.status === "paid" ? "已回收" : entry.status === "at_risk" ? "超期风险" : "待回收"}
                    </Badge>
                    <span className="nc-spacer" />
                    <Btn
                      icon={<Crosshair size={14} aria-hidden="true" />}
                      onClick={() => requestLocate(80)}
                      title="定位到该章节的相关位置"
                    >
                      定位
                    </Btn>
                  </div>
                  <span className="nc-meta">{entry.detail}</span>
                  <span className="nc-meta">归属：{entry.owner}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "promises" && (
        <div className="nc-page-body nc-stack" style={{ gap: 12 }}>
          <Alert tone="info" title="承诺是对读者的约定">
            埋设后应给出回收章节；超期未回收会进入审核警告，而不是自动阻断。
          </Alert>
          {research.promises.map((promise) => (
            <article className="nc-card nc-card-pad nc-stack" key={promise.id} style={{ gap: 6 }}>
              <div className="nc-row" style={{ padding: 0, gap: 8, flexWrap: "wrap" }}>
                <span className="nc-em">{promise.text}</span>
                <Badge tone={promise.status === "paid" ? "ok" : promise.status === "at_risk" ? "block" : "neutral"}>
                  {promise.status === "paid" ? "已回收" : promise.status === "at_risk" ? "超期风险" : "待回收"}
                </Badge>
              </div>
              <span className="nc-meta">埋设：{promise.plantedAt} · 约定回收：{promise.dueBy}</span>
              <p className="nc-evidence">{promise.evidence}</p>
            </article>
          ))}
        </div>
      )}

      {tab === "m3" && (
        <div className="nc-page-body nc-stack" style={{ gap: 14 }}>
          <Alert tone="info" title="曲线始终配有等价列表">
            右侧每条竖条对应一个章节；缺少数据、模型无法判断与规则不适用都有独立标签，不会画成零分。
          </Alert>

          {research.m3.length === 0 && (
            <Empty
              icon={<TrendingUp size={18} aria-hidden="true" />}
              title="暂无节奏数据"
              detail="本作品还没有可计算的章节净值。这里显示的是「数据不足」，不是 0 分。"
            />
          )}

          {research.m3.length > 0 && (
          <>
          <div className="nc-card nc-card-pad nc-stack" style={{ gap: 10 }} aria-label="节奏曲线等价列表">
            {research.m3.map((point) => (
              <div className="nc-row" key={point.chapterLabel} style={{ padding: 0, gap: 10 }}>
                <span className="nc-num nc-meta" style={{ width: 62 }}>{point.chapterLabel}</span>
                <span style={{ flex: "1 1 120px", minWidth: 80 }}>
                  {point.verdict === "ok" || point.verdict === "warn" || point.verdict === "block" ? (
                    <span className="nc-progress" role="img" aria-label={`${point.chapterLabel} 净推进 ${point.net}`}>
                      <span style={{ width: `${Math.min(100, Math.abs(point.net) * 45)}%`, background: point.net < 0 ? "var(--nc-warn)" : "var(--nc-primary)" }} />
                    </span>
                  ) : (
                    <span className="nc-meta">—</span>
                  )}
                </span>
                <span className="nc-num nc-meta" style={{ width: 52, textAlign: "right" }}>
                  {point.verdict === "insufficient_data" || point.verdict === "unverifiable" || point.verdict === "not_applicable"
                    ? "无评分"
                    : point.net.toFixed(1)}
                </span>
                <Badge tone={VERDICT_META[point.verdict].tone}>{VERDICT_META[point.verdict].label}</Badge>
                <span className="nc-meta nc-truncate" style={{ maxWidth: 260 }}>{point.note}</span>
                <span className="nc-spacer" />
                <Btn icon={<TrendingUp size={14} aria-hidden="true" />} onClick={() => requestLocate(60)}>定位</Btn>
              </div>
            ))}
          </div>

          <div className="nc-btn-group">
            <Btn icon={<BookMarked size={14} aria-hidden="true" />} onClick={() => requestLocate(200)}>跳到本章相关证据</Btn>
          </div>
          </>
          )}
        </div>
      )}
    </>
  );
}
