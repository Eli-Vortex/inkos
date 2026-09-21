/**
 * 导出 — 正文导出 (F-25).
 *
 * One rule drives this surface: the formal manuscript and the author's
 * candidates are different things. The scope therefore defaults to
 * 「已提交章节」 only; candidate text can join the export only through an
 * explicit opt-in, and it is then labelled 未提交 everywhere it appears —
 * preview, summary and history alike.
 *
 * The artifact is always bound to the HEAD revision it was taken from, and
 * because real file writing is not wired in this build the page says so
 * instead of pretending a file exists.
 */

import { useMemo, useState } from "react";
import { Check, Clock, Download, FileText, Info } from "lucide-react";
import type { ExportFormat } from "../types";
import { useWorkbench } from "../state/store";
import { Alert, Badge, Btn, Empty, type Tone } from "../ui";

const FORMAT_META: Record<ExportFormat, { label: string; hint: string; extension: string }> = {
  txt: { label: "TXT", hint: "纯文本，渠道最通用", extension: ".txt" },
  md: { label: "Markdown", hint: "保留标题层级，便于二次排版", extension: ".md" },
  epub: { label: "EPUB", hint: "电子书目录与分章", extension: ".epub" },
};

const SCOPE_LABEL = { submitted: "已提交章节", candidate: "候选稿（未提交）" } as const;

const HISTORY_STATE: Record<"ready" | "running" | "failed", { label: string; tone: Tone }> = {
  ready: { label: "已生成", tone: "ok" },
  running: { label: "生成中", tone: "info" },
  failed: { label: "失败", tone: "block" },
};

export function Export() {
  const dataset = useWorkbench((state) => state.dataset);
  const pushToast = useWorkbench((state) => state.pushToast);
  const goArea = useWorkbench((state) => state.goArea);

  const [format, setFormat] = useState<ExportFormat>("txt");
  const [includeSubmitted, setIncludeSubmitted] = useState(true);
  const [includeCandidates, setIncludeCandidates] = useState(false);

  const exportData = dataset?.export ?? null;

  const selected = useMemo(() => {
    const blocks = exportData?.preview ?? [];
    return blocks.filter((block) => (block.submitted ? includeSubmitted : includeCandidates));
  }, [exportData, includeSubmitted, includeCandidates]);

  if (!dataset || !exportData) {
    return (
      <div className="nc-page-body">
        <Empty
          icon={<Download size={18} aria-hidden="true" />}
          title="没有可导出的正文"
          detail="导出依赖已提交的正式稿。先完成一次提交，再回到这里选择格式与范围。"
        />
      </div>
    );
  }

  const hasScope = selected.length > 0;
  const skippedCandidates = exportData.preview.filter((block) => !block.submitted).length;
  const realWriteCapability = dataset.unavailable.find((capability) => capability.label.includes("导出"));
  const selectedCandidates = selected.filter((block) => !block.submitted).length;

  return (
    <>
      <header className="nc-page-head">
        <div>
          <h1 className="nc-page-title">导出</h1>
          <p className="nc-page-desc">
            导出的是正式稿，不是正在改的候选。范围默认只含「已提交章节」；勾选候选稿后，导出的每一处都会标注「未提交」。
          </p>
        </div>
        <div className="nc-btn-group">
          <span className="nc-pill" data-tone="seal" title="本次导出绑定的正式稿版本">
            <span className="nc-em">HEAD</span>
            <span className="nc-num">{exportData.head}</span>
          </span>
          <span className="nc-pill" title="HEAD 对应的提交回执">
            <span className="nc-num">{exportData.headCommitId}</span>
          </span>
        </div>
      </header>

      <div className="nc-page-body nc-stack" style={{ gap: 14 }}>
        {realWriteCapability && (
          <Alert tone="warn" title={realWriteCapability.label}>
            {realWriteCapability.reason}
          </Alert>
        )}

        <section className="nc-card nc-card-pad nc-stack" style={{ gap: 12 }} aria-label="导出设置">
          <div className="nc-field">
            <span className="nc-field-label" id="nc-export-format-label">导出格式</span>
            <div className="nc-seg" role="group" aria-labelledby="nc-export-format-label">
              {(Object.keys(FORMAT_META) as ExportFormat[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={format === value}
                  onClick={() => setFormat(value)}
                  title={FORMAT_META[value].hint}
                >
                  {FORMAT_META[value].label}
                </button>
              ))}
            </div>
            <span className="nc-field-help">{FORMAT_META[format].hint}</span>
          </div>

          <div className="nc-field">
            <span className="nc-field-label">导出范围</span>
            <label className="nc-check">
              <input
                type="checkbox"
                checked={includeSubmitted}
                onChange={(event) => setIncludeSubmitted(event.target.checked)}
              />
              <span className="nc-check-body">
                <span className="nc-em">{SCOPE_LABEL.submitted}</span>
                <span className="nc-meta">
                  共 <span className="nc-num">{exportData.submittedChapters}</span> 章，正属于 HEAD {exportData.head}。
                </span>
              </span>
            </label>

            <label className="nc-check">
              <input
                type="checkbox"
                checked={includeCandidates}
                onChange={(event) => setIncludeCandidates(event.target.checked)}
              />
              <span className="nc-check-body">
                <span className="nc-em">{SCOPE_LABEL.candidate}</span>
                <span className="nc-meta">
                  共 <span className="nc-num">{exportData.candidateChapters}</span> 章尚无提交回执；勾选后必须由你显式确认，产物会带上「未提交」标记。
                </span>
              </span>
            </label>
          </div>

          <div className="nc-row" style={{ padding: 0, flexWrap: "wrap", gap: 8 }}>
            <span className="nc-meta">
              本次将导出 <span className="nc-em nc-num">{selected.length}</span> 章
              （已提交 <span className="nc-num">{selected.length - selectedCandidates}</span> · 未提交{" "}
              <span className="nc-num">{selectedCandidates}</span>）· 格式 {FORMAT_META[format].label} · 绑定 {exportData.head}
            </span>
            <span className="nc-spacer" />
            <Btn
              variant="primary"
              icon={<Download size={14} aria-hidden="true" />}
              disabled={!hasScope}
              title={hasScope ? "按当前格式与范围生成导出产物" : "至少选择一个范围才能导出"}
              onClick={() =>
                pushToast({
                  tone: "warn",
                  title: `导出未接入（${FORMAT_META[format].label}）`,
                  detail: `范围已选定 ${selected.length} 章并绑定 ${exportData.head}；真实写文件能力未接入，本次不会产生任何文件。`,
                })
              }
            >
              生成导出
            </Btn>
          </div>
          {!hasScope && (
            <span className="nc-field-error" role="alert">
              导出范围为空：请至少勾选「已提交章节」或「候选稿（未提交）」。
            </span>
          )}
        </section>

        <section className="nc-stack" style={{ gap: 8 }} aria-label="正文预览">
          <div className="nc-row" style={{ padding: 0, gap: 8, flexWrap: "wrap" }}>
            <h2 className="nc-h2">正文预览</h2>
            <span className="nc-spacer" />
            <span className="nc-meta">
              预览与实际导出使用同一份范围与同一套标记，不额外补内容。
            </span>
          </div>

          <div className="nc-list">
            {selected.map((block) => (
              <article className="nc-card nc-card-pad nc-stack" key={block.id} style={{ gap: 6 }}>
                <div className="nc-cluster">
                  <FileText size={14} aria-hidden="true" />
                  <span className="nc-em">{block.chapterLabel} · {block.heading}</span>
                  <Badge tone={block.submitted ? "ok" : "warn"}>{block.submitted ? "已提交" : "未提交"}</Badge>
                </div>
                <p className="nc-evidence">{block.body}</p>
              </article>
            ))}

            {selected.length === 0 && (
              <Empty
                icon={<FileText size={18} aria-hidden="true" />}
                title="预览为空"
                detail="当前范围没有可导出的章节。勾选「已提交章节」或在确认后勾选候选稿。"
              />
            )}
          </div>

          {!includeCandidates && skippedCandidates > 0 && (
            <p className="nc-meta">
              已按默认范围跳过 <span className="nc-num">{skippedCandidates}</span> 章候选稿——它们没有提交回执，不会静默进入导出。
            </p>
          )}
        </section>

        <section className="nc-stack" style={{ gap: 8 }} aria-label="导出历史">
          <div className="nc-row" style={{ padding: 0, gap: 8, flexWrap: "wrap" }}>
            <h2 className="nc-h2">导出历史</h2>
            <span className="nc-spacer" />
            <span className="nc-meta">
              <Clock size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> 每条记录保留当时的 HEAD 与是否含候选稿。
            </span>
          </div>

          <div className="nc-card" style={{ overflow: "hidden" }}>
            <table className="nc-table">
              <caption className="nc-visually-hidden">已产生的导出记录</caption>
              <thead>
                <tr>
                  <th scope="col">时间</th>
                  <th scope="col">格式</th>
                  <th scope="col">范围</th>
                  <th scope="col">绑定 HEAD</th>
                  <th scope="col">状态</th>
                  <th scope="col">产物</th>
                </tr>
              </thead>
              <tbody>
                {exportData.history.map((entry) => (
                  <tr key={entry.id}>
                    <th scope="row" className="nc-num nc-nowrap">{entry.createdAt}</th>
                    <td>{FORMAT_META[entry.format].label}</td>
                    <td>
                      <span className="nc-cluster">
                        <span>{entry.scopeLabel}</span>
                        {entry.includesCandidates && <Badge tone="warn">含未提交</Badge>}
                      </span>
                    </td>
                    <td className="nc-nowrap">{entry.head}</td>
                    <td>
                      <Badge tone={HISTORY_STATE[entry.state].tone}>{HISTORY_STATE[entry.state].label}</Badge>
                    </td>
                    <td>
                      <span className="nc-num nc-truncate" title={entry.artifact}>{entry.artifact}</span>
                    </td>
                  </tr>
                ))}
                {exportData.history.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <span className="nc-meta">还没有导出记录。范围与格式确定后，这里会列出每次产物的 HEAD 与是否含候选稿。</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="nc-stack" style={{ gap: 8 }} aria-label="下一步">
          <div className="nc-row" style={{ padding: 0, gap: 8, flexWrap: "wrap" }}>
            <Btn icon={<Check size={14} aria-hidden="true" />} onClick={() => goArea("commit")}>
              回到提交确认
            </Btn>
            <Btn icon={<Info size={14} aria-hidden="true" />} onClick={() => goArea("writing")}>
              回到写作工作区
            </Btn>
          </div>
          <p className="nc-meta" style={{ margin: 0 }}>
            候选稿没有被拒绝：它只是必须先经过提交确认，才能成为可导出的正式稿。
          </p>
        </section>
      </div>
    </>
  );
}
