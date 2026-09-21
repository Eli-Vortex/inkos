/**
 * Version comparison — side-by-side on wide screens, per-paragraph inline diff
 * on narrow ones, with the compared versions and their sources always stated.
 *
 * The diff is a plain paragraph-level LCS over the two candidate bodies. It is
 * a reading aid, not a merge tool: nothing here writes to either version.
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Columns2, Rows3 } from "lucide-react";
import type { Candidate } from "../types";
import { diffParagraphs, diffStats } from "../lib/diff";
import { Badge, Btn } from "../ui";
import { formatNumber } from "../format";

const SOURCE_LABEL: Record<Candidate["source"], string> = {
  hand: "手写",
  generated: "生成",
  revised: "修订",
  imported: "导入",
};

export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(max-width: 1024px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1024px)");
    const onChange = () => setNarrow(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export interface DiffViewProps {
  readonly base: Candidate;
  readonly target: Candidate;
  readonly onSwap: () => void;
}

export function DiffView({ base, target, onSwap }: DiffViewProps) {
  const narrow = useNarrowViewport();
  const [mode, setMode] = useState<"auto" | "side" | "inline">("auto");
  const effective = mode === "auto" ? (narrow ? "inline" : "side") : mode;

  const lines = useMemo(() => diffParagraphs(base.body, target.body), [base.body, target.body]);
  const stats = useMemo(() => diffStats(lines), [lines]);

  return (
    <div className="nc-stack" style={{ gap: 12 }}>
      <div className="nc-row" style={{ padding: 0, flexWrap: "wrap", gap: 8 }}>
        <VersionTag role="基线" candidate={base} />
        <Btn icon={<ArrowLeftRight size={14} aria-hidden="true" />} onClick={onSwap} title="交换比较方向">
          交换
        </Btn>
        <VersionTag role="对比" candidate={target} />
        <span className="nc-spacer" />
        <div className="nc-seg" role="group" aria-label="差异视图模式">
          <button type="button" aria-pressed={effective === "side"} onClick={() => setMode("side")}>
            <Columns2 size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> 左右对照
          </button>
          <button type="button" aria-pressed={effective === "inline"} onClick={() => setMode("inline")}>
            <Rows3 size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> 行内差异
          </button>
        </div>
      </div>

      <p className="nc-meta">
        共 {stats.total} 段，新增 <span className="nc-em nc-num">{stats.added}</span> 段，删除{" "}
        <span className="nc-em nc-num">{stats.removed}</span> 段，未变{" "}
        <span className="nc-em nc-num">{stats.unchanged}</span> 段。差异仅用于阅读，不会修改任一版本。
      </p>

      {effective === "inline" ? (
        <div className="nc-diff" aria-label="逐段行内差异">
          {lines.map((line, index) => (
            <div className="nc-diff-line" data-kind={line.kind} key={index}>
              <span className="nc-diff-no">
                {line.kind === "add" ? "＋" : line.kind === "del" ? "－" : ""}
              </span>
              <span className="nc-diff-text">{line.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="nc-diff-panel">
          <section aria-label={`${base.label} 全文`}>
            <div className="nc-diff-head">
              <Badge tone="neutral">{base.label}</Badge>
              <span className="nc-meta">{SOURCE_LABEL[base.source]}</span>
              <span className="nc-meta nc-num">{formatNumber(base.wordCount)} 字</span>
            </div>
            <div className="nc-diff">
              {lines.filter((line) => line.kind !== "add").map((line, index) => (
                <div className="nc-diff-line" data-kind={line.kind === "del" ? "del" : "same"} key={index}>
                  <span className="nc-diff-no">{line.leftNo ?? ""}</span>
                  <span className="nc-diff-text">{line.text}</span>
                </div>
              ))}
            </div>
          </section>
          <section aria-label={`${target.label} 全文`}>
            <div className="nc-diff-head">
              <Badge tone="brand">{target.label}</Badge>
              <span className="nc-meta">{SOURCE_LABEL[target.source]}</span>
              <span className="nc-meta nc-num">{formatNumber(target.wordCount)} 字</span>
            </div>
            <div className="nc-diff">
              {lines.filter((line) => line.kind !== "del").map((line, index) => (
                <div className="nc-diff-line" data-kind={line.kind === "add" ? "add" : "same"} key={index}>
                  <span className="nc-diff-no">{line.rightNo ?? ""}</span>
                  <span className="nc-diff-text">{line.text}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function VersionTag({ role, candidate }: { readonly role: string; readonly candidate: Candidate }) {
  return (
    <span className="nc-row" style={{ padding: 0, gap: 6 }}>
      <span className="nc-label">{role}</span>
      <Badge tone={role === "基线" ? "neutral" : "brand"}>{candidate.label}</Badge>
      <span className="nc-meta nc-num">r{candidate.revision}</span>
      <span className="nc-meta">{SOURCE_LABEL[candidate.source]}</span>
    </span>
  );
}
