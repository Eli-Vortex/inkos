/**
 * 细纲与合同 — the chapter's agreed goal before prose is written.
 *
 * Approving records a version. Editing after approval shows "有未批准变更" and
 * marks the previous contract and its review as stale, exactly as docs/03 §3.2
 * requires. Editing here never rewrites an approved revision in place.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, FileSignature, ShieldQuestion, TriangleAlert } from "lucide-react";
import { useWorkbench } from "../state/store";
import { Alert, Badge, Btn, Empty, Field } from "../ui";
import { formatDateTime } from "../format";

export function OutlineContract() {
  const dataset = useWorkbench((state) => state.dataset);
  const activeBookId = useWorkbench((state) => state.activeBookId);
  const activeChapterId = useWorkbench((state) => state.activeChapterId);
  const selectChapter = useWorkbench((state) => state.selectChapter);
  const approveOutline = useWorkbench((state) => state.approveOutline);
  const pushToast = useWorkbench((state) => state.pushToast);

  const bookChapters = useMemo(
    () => (dataset?.chapters ?? []).filter((item) => item.bookId === activeBookId),
    [dataset, activeBookId],
  );
  const currentChapter = bookChapters.find((item) => item.id === activeChapterId)
    ?? bookChapters[0]
    ?? null;

  const contract = dataset?.outline ?? null;
  const [goal, setGoal] = useState(contract?.goal ?? "");
  const [goalError, setGoalError] = useState<string | undefined>();

  useEffect(() => {
    if (!contract) return;
    setGoal(contract.goal);
  }, [contract]);

  if (!dataset || !contract) {
    return (
      <div className="nc-page-body">
        <Empty
          icon={<FileSignature size={18} aria-hidden="true" />}
          title="没有可编辑的细纲"
          detail="选择一部作品并进入某一章后，这里会显示该章的细纲与合同。"
        />
      </div>
    );
  }

  const dirtyApproval = goal !== contract.goal;

  const approved = contract.approvedRevision !== null && !dirtyApproval;

  const submitApproval = () => {
    if (goal.trim().length < 6) {
      setGoalError("本章目标至少要写清楚一句可验证的话，至少 6 个字。");
      return;
    }
    // Save the edited goal before recording the approval, so the approved
    // revision describes the text the author actually sees.
    setGoalError(undefined);
    void approveOutline({ goal });
  };

  return (
    <>
      <header className="nc-page-head">
        <div>
          <h1 className="nc-page-title">细纲与合同</h1>
          <p className="nc-page-desc">
            目标、必达事件、人物、限制与批准状态。批准动作只针对当时那一版；批准后再编辑会出现「有未批准变更」，旧合同与对应审核自动标记过期。
          </p>
        </div>
        <div className="nc-btn-group">
          <Badge tone={approved ? "ok" : dirtyApproval ? "warn" : "neutral"}>
            {approved ? `已批准 r${contract.approvedRevision}` : dirtyApproval ? "有未批准变更" : "待批准"}
          </Badge>
          <Btn variant="primary" icon={<Check size={14} aria-hidden="true" />} onClick={submitApproval}>
            {approved ? "重新批准" : "批准细纲"}
          </Btn>
        </div>
      </header>

      {bookChapters.length > 0 && (
        <div className="nc-band" style={{ flexWrap: "wrap", gap: 12 }}>
          <div className="nc-row" style={{ padding: 0, gap: 6 }}>
            <label className="nc-meta" htmlFor="nc-outline-chapter" style={{ fontWeight: 600 }}>选择细纲章节</label>
            <select
              id="nc-outline-chapter"
              className="nc-select"
              style={{ width: "auto", minWidth: 180, maxWidth: 300 }}
              value={currentChapter?.id ?? ""}
              onChange={(e) => void selectChapter(e.target.value)}
            >
              {bookChapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  第 {ch.number} 章 · {ch.title} ({ch.outlineApproved ? "细纲已批准" : "细纲待批准"})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="nc-page-body">
        <div className="nc-cols">
          <div className="nc-stack" style={{ gap: 16 }}>
            {(dirtyApproval || contract.approvedRevision === null) && (
              <Alert tone="warn" title={contract.approvedRevision === null ? "该细纲尚未批准" : "有未批准变更"}>
                当前编辑内容与已批准的 r{contract.approvedRevision ?? "—"} 不一致。批准新版本之前，本章审核结果与旧合同都会被标记为过期。
              </Alert>
            )}

            <Field
              label="本章目标"
              required
              error={goalError}
              hint="一句话写清本章必须完成的事，后续审核会用它判断必达事件是否履约。"
            >
              {({ id, describedBy, invalid }) => (
                <textarea
                  id={id}
                  className="nc-textarea"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  value={goal}
                  onChange={(event) => { setGoal(event.target.value); if (goalError) setGoalError(undefined); }}
                />
              )}
            </Field>

            <section className="nc-stack" style={{ gap: 8 }} aria-label="必达事件">
              <div className="nc-row" style={{ padding: 0 }}>
                <h2 className="nc-h2">必达事件</h2>
                <span className="nc-spacer" />
                <span className="nc-meta">来自生成的细纲；必达事件缺失会被审核列为阻断项</span>
              </div>
              {/* Read-only: the beats are a projection of the generated plan, and
                  the backend has no endpoint to persist per-beat edits. Editing
                  them here used to look possible but was silently discarded, so
                  the approval then attested to a list the author never wrote. */}
              {contract.beats.length === 0 && (
                <p className="nc-meta">本章细纲还没有必达事件；先生成或重新规划细纲后再批准。</p>
              )}
              {contract.beats.map((beat) => (
                <div className="nc-row" key={beat.id} style={{ padding: "6px 0", gap: 10 }}>
                  <span className="nc-check-body" style={{ flex: 1 }}>
                    <span className="nc-em">{beat.text}</span>
                    <span className="nc-meta">{beat.mandatory ? "必达" : "可选"} · {beat.addressed ? "正文已写" : "正文未写"}</span>
                  </span>
                  <Badge tone={beat.addressed ? "ok" : beat.mandatory ? "block" : "neutral"}>
                    {beat.addressed ? "已写" : beat.mandatory ? "未写" : "可选"}
                  </Badge>
                </div>
              ))}
            </section>

            <section className="nc-stack" style={{ gap: 8 }} aria-label="人物与限制">
              <h2 className="nc-h2">人物</h2>
              {contract.characters.map((character) => (
                <div className="nc-row nc-row-top" key={character.id} style={{ padding: "6px 0" }}>
                  <Badge tone="neutral">{character.role}</Badge>
                  <span className="nc-row-fill">
                    <span className="nc-em">{character.name}</span>
                    <span className="nc-meta">{character.intent}</span>
                  </span>
                </div>
              ))}

              <h2 className="nc-h2" style={{ marginTop: 8 }}>限制</h2>
              {contract.constraints.map((constraint) => (
                <div className="nc-row" key={constraint.id} style={{ padding: "6px 0" }}>
                  <Badge tone="neutral">{constraint.kind}</Badge>
                  <span>{constraint.text}</span>
                </div>
              ))}
            </section>
          </div>

          <aside className="nc-stack" style={{ gap: 12 }}>
            <div className="nc-card nc-card-pad nc-stack" style={{ gap: 10 }}>
              <h2 className="nc-h2">版本与批准</h2>
              <dl className="nc-defs">
                <div>
                  <dt>当前编辑版本</dt>
                  <dd className="nc-num">r{contract.currentRevision}</dd>
                </div>
                <div>
                  <dt>已批准版本</dt>
                  <dd className="nc-num">{contract.approvedRevision === null ? "—" : `r${contract.approvedRevision}`}</dd>
                </div>
                <div>
                  <dt>批准时间</dt>
                  <dd>{formatDateTime(contract.approvedAt)}</dd>
                </div>
                <div>
                  <dt>批准人</dt>
                  <dd>{contract.approvedBy ?? "—"}</dd>
                </div>
                <div>
                  <dt>变更状态</dt>
                  <dd>
                    {dirtyApproval
                      ? <Badge tone="warn" icon={<TriangleAlert size={12} aria-hidden="true" />}>有未批准变更</Badge>
                      : <Badge tone="ok" icon={<Check size={12} aria-hidden="true" />}>与已批准版本一致</Badge>}
                  </dd>
                </div>
              </dl>
              <Btn
                variant="primary"
                icon={<FileSignature size={14} aria-hidden="true" />}
                onClick={submitApproval}
                disabled={!dirtyApproval}
                title={dirtyApproval ? "批准当前编辑版本并记录版本号" : "当前内容与已批准版本一致"}
              >
                批准细纲 r{contract.currentRevision}
              </Btn>
              <p className="nc-meta">
                批准只记录版本，不会修改正文；批准后继续编辑会出现新的未批准变更。
              </p>
            </div>

            <div className="nc-card nc-card-pad nc-stack" style={{ gap: 8 }}>
              <h2 className="nc-h2">
                <ShieldQuestion size={15} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> 合同约束
              </h2>
              <p className="nc-meta">本章审核中的「细纲履约」规则直接读取下面的必达事件与限制；修改后需要重新批准才会生效。</p>
              <Btn onClick={() => pushToast({ tone: "info", title: "已记录待重新审核", detail: "演示预览中不会触发真实的云端审核。" })}>
                标记为待重新审核
              </Btn>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
