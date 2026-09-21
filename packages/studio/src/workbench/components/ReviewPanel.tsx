/**
 * Review panel — blocking / warning / suggestion findings with evidence.
 *
 * Rules encoded here (docs/03 §3.4):
 *  - Findings are grouped by severity and each row carries rule name, original
 *    evidence, suggestion and confidence as text, never colour alone.
 *  - A hard integrity error can never be waived from the UI; only recorded
 *    false-positive handling is allowed, and it must state a reason.
 *  - "Cannot judge" and "rule not applicable" are shown as their own states,
 *    never rendered as a zero score.
 */

import { useState } from "react";
import { AlertTriangle, Ban, Check, Crosshair, Info, PenLine, ShieldQuestion, Wand2 } from "lucide-react";
import type { Confidence, ReviewItem, ReviewStatus, Severity } from "../types";
import type { ReviewFilter } from "../state/store";
import { Badge, Btn, Dialog, Empty, Field, type Tone } from "../ui";

const SEVERITY_META: Record<Severity, { label: string; tone: Tone; icon: typeof AlertTriangle }> = {
  block: { label: "阻断", tone: "block", icon: Ban },
  warn: { label: "警告", tone: "warn", icon: AlertTriangle },
  suggest: { label: "建议", tone: "info", icon: Info },
};

const STATUS_LABEL: Record<ReviewStatus, string> = {
  open: "待处理",
  resolved: "已处理",
  waived: "已豁免",
  // Distinct from "待处理": the check itself did not complete, so there is no
  // verdict to show. Presenting it as an ordinary finding would imply we know
  // there is a problem; presenting it as absent would imply we know there is not.
  unverified: "未验证",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "置信：高",
  medium: "置信：中",
  unknown: "模型无法判断",
  not_applicable: "规则不适用",
};

export interface ReviewPanelProps {
  readonly items: readonly ReviewItem[];
  readonly filter: ReviewFilter;
  readonly onFilter: (patch: Partial<ReviewFilter>) => void;
  readonly onResolve: (itemId: string) => void;
  readonly onWaive: (itemId: string, reason: string) => void;
  readonly onLocate: (item: ReviewItem) => void;
  /** Ask the AI to locally fix just this finding. */
  readonly onFix?: (item: ReviewItem) => void;
  /** True while an AI revise is running: write actions are disabled. */
  readonly busy?: boolean;
}

export function ReviewPanel({ items, filter, onFilter, onResolve, onWaive, onLocate, onFix, busy }: ReviewPanelProps) {
  const [waiving, setWaiving] = useState<ReviewItem | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();

  const visible = items.filter((item) => {
    if (filter.severity !== "all" && item.severity !== filter.severity) return false;
    if (filter.status !== "all" && item.status !== filter.status) return false;
    if (filter.query.trim()) {
      const needle = filter.query.trim().toLowerCase();
      return `${item.rule} ${item.summary} ${item.suggestion} ${item.evidence.quote}`.toLowerCase().includes(needle);
    }
    return true;
  });

  const groups: Severity[] = ["block", "warn", "suggest"];

  const submitWaiver = () => {
    if (!waiving) return;
    if (reason.trim().length < 4) {
      setReasonError("请写明判断为误报的依据，至少 4 个字；该原因会进入审核记录。");
      return;
    }
    onWaive(waiving.id, reason.trim());
    setWaiving(null);
    setReason("");
    setReasonError(undefined);
  };

  return (
    <div className="nc-stack" style={{ gap: 10 }}>
      <div className="nc-field">
        <label className="nc-field-label" htmlFor="nc-review-search">筛选审核项</label>
        <input
          id="nc-review-search"
          className="nc-input"
          type="search"
          value={filter.query}
          placeholder="按规则、结论或原文搜索"
          onChange={(event) => onFilter({ query: event.target.value })}
        />
      </div>

      <div className="nc-row" style={{ padding: 0, gap: 8 }}>
        <div className="nc-seg" role="group" aria-label="按严重级筛选">
          {(["all", "block", "warn", "suggest"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter.severity === value}
              onClick={() => onFilter({ severity: value })}
            >
              {value === "all" ? "全部" : SEVERITY_META[value].label}
            </button>
          ))}
        </div>
        <span className="nc-spacer" />
        <label className="nc-visually-hidden" htmlFor="nc-review-status">按处理状态筛选</label>
        <select
          id="nc-review-status"
          className="nc-select"
          style={{ width: "auto" }}
          value={filter.status}
          onChange={(event) => onFilter({ status: event.target.value as ReviewFilter["status"] })}
        >
          <option value="open">待处理</option>
          <option value="resolved">已处理</option>
          <option value="waived">已豁免</option>
          <option value="all">全部状态</option>
        </select>
      </div>

      {visible.length === 0 && (
        <Empty
          icon={<Check size={18} aria-hidden="true" />}
          title="没有符合条件的审核项"
          detail="调整上面的筛选条件，或切换状态查看已处理与已豁免的记录。"
        />
      )}

      {groups.map((severity) => {
        const groupItems = visible.filter((item) => item.severity === severity);
        if (groupItems.length === 0) return null;
        const meta = SEVERITY_META[severity];
        const Icon = meta.icon;
        return (
          <section className="nc-review-group" key={severity} aria-label={`${meta.label}项`}>
            <div className="nc-review-head">
              <Icon size={14} aria-hidden="true" />
              <span className="nc-h3">{meta.label}</span>
              <span className="nc-num nc-meta">{groupItems.length}</span>
            </div>
            {groupItems.map((item) => (
              <article className="nc-review-item" key={item.id} data-severity={item.severity} data-status={item.status}>
                <div className="nc-review-main">
                  <div className="nc-review-rule">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className="nc-num nc-meta">{item.rule}</span>
                    <span className="nc-meta">· {item.ruleGroup}</span>
                    <span className="nc-spacer" />
                    <Badge tone={item.status === "open" ? "neutral" : item.status === "waived" ? "warn" : "ok"}>
                      {STATUS_LABEL[item.status]}
                    </Badge>
                  </div>
                  <p>{item.summary}</p>
                  <p className="nc-evidence">“{item.evidence.quote}”</p>
                  <p className="nc-meta">
                    <span className="nc-em">建议：</span>
                    {item.suggestion}
                  </p>
                  <div className="nc-row" style={{ padding: 0, gap: 8 }}>
                    <span className="nc-meta">{CONFIDENCE_LABEL[item.confidence]}</span>
                    <span className="nc-meta">· 出处 {item.evidence.chapterLabel}</span>
                  </div>
                  {item.waiverReason && (
                    <p className="nc-meta">豁免原因：{item.waiverReason}</p>
                  )}
                </div>
                {item.status === "open" && (
                  <div className="nc-review-foot">
                    <Btn icon={<Crosshair size={14} aria-hidden="true" />} onClick={() => onLocate(item)}>
                      定位原文
                    </Btn>
                    {onFix && (
                      <Btn
                        variant="primary"
                        icon={<Wand2 size={14} aria-hidden="true" />}
                        onClick={() => onFix(item)}
                        disabled={busy}
                        title={busy ? "正在修订中，请稍候" : "让 AI 只针对这一条问题做局部修改，其余内容不动"}
                      >
                        AI 修改
                      </Btn>
                    )}
                    <Btn
                      icon={<Check size={14} aria-hidden="true" />}
                      onClick={() => onResolve(item.id)}
                      // Marking a finding "handled" without touching the prose is not
                      // a supported operation: the backend has no per-finding resolve
                      // state, and inventing one client-side would show a chapter as
                      // clean while the text still has the problem. The button states
                      // what actually resolves it instead of failing on click.
                      disabled
                      title="在正文中修正后重新审核，审计通过时该条会自行消失"
                    >
                      标记已处理（需改正文后重审）
                    </Btn>
                    <span className="nc-spacer" />
                    {item.waivable ? (
                      <Btn
                        icon={<ShieldQuestion size={14} aria-hidden="true" />}
                        onClick={() => { setWaiving(item); setReason(""); setReasonError(undefined); }}
                        disabled={busy}
                        title={busy ? "正在修订中，请稍候再豁免" : "按误报豁免，必须记录原因"}
                      >
                        按误报豁免
                      </Btn>
                    ) : (
                      <span className="nc-meta" title="硬性完整性错误不能在界面中忽略后提交">
                        <Ban size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> 硬性错误不可豁免
                      </span>
                    )}
                  </div>
                )}
              </article>
            ))}
          </section>
        );
      })}

      <Dialog
        open={waiving !== null}
        onClose={() => setWaiving(null)}
        title="记录豁免原因"
        description="仅用于记录误报判断。硬性完整性错误不会被豁免，审核记录会保留本次原因。"
        footer={(
          <div className="nc-btn-group">
            <Btn variant="primary" onClick={submitWaiver}>提交豁免</Btn>
            <Btn variant="ghost" onClick={() => setWaiving(null)}>取消</Btn>
          </div>
        )}
      >
        {waiving && (
          <p className="nc-meta" style={{ marginBottom: 8 }}>
            <PenLine size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> {waiving.summary}
          </p>
        )}
        <Field label="原因" error={reasonError} required>
          {({ id, describedBy, invalid }) => (
            <textarea
              id={id}
              className="nc-textarea"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={reason}
              onChange={(event) => { setReason(event.target.value); if (reasonError) setReasonError(undefined); }}
              placeholder="例如：该日期在第 10 章已由作者确认为刻意的倒叙，不构成时间线冲突。"
            />
          )}
        </Field>
      </Dialog>
    </div>
  );
}

export function reviewCounts(items: readonly ReviewItem[]) {
  return {
    block: items.filter((item) => item.severity === "block" && item.status === "open").length,
    warn: items.filter((item) => item.severity === "warn" && item.status === "open").length,
    suggest: items.filter((item) => item.severity === "suggest" && item.status === "open").length,
  };
}
