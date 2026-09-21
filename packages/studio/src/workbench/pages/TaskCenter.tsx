/**
 * 任务中心 — queued, running, awaiting-author, done, failed and cancelled work.
 *
 * Cancellation is two-phase: the request is acknowledged, and the row only
 * reads "已取消" once the service confirms. A task that has entered a
 * non-interruptible phase is shown as finishing instead of pretending the
 * cancel succeeded. Progress is never guessed from log line counts.
 */

import { useState } from "react";
import {
  Ban,
  Check,
  CircleSlash,
  Clock,
  Loader2,
  PlayCircle,
  RefreshCw,
  TriangleAlert,
  UserRoundCheck,
} from "lucide-react";
import type { TaskState, WorkTask } from "../types";
import { useWorkbench } from "../state/store";
import { Alert, Badge, Btn, Empty, Progress, Tabs, type Tone } from "../ui";
import { formatDateTime } from "../format";

const STATE_META: Record<TaskState, { label: string; tone: Tone }> = {
  queued: { label: "排队中", tone: "neutral" },
  running: { label: "运行中", tone: "info" },
  awaiting: { label: "等待作者", tone: "warn" },
  done: { label: "已完成", tone: "ok" },
  failed: { label: "失败", tone: "block" },
  canceling: { label: "正在取消", tone: "warn" },
  canceled: { label: "已取消", tone: "neutral" },
};

function StateIcon({ state }: { readonly state: TaskState }) {
  const size = 15;
  if (state === "running") return <Loader2 size={size} className="nc-spin" aria-hidden="true" />;
  if (state === "queued") return <Clock size={size} aria-hidden="true" />;
  if (state === "awaiting") return <UserRoundCheck size={size} aria-hidden="true" />;
  if (state === "done") return <Check size={size} aria-hidden="true" />;
  if (state === "failed") return <TriangleAlert size={size} aria-hidden="true" />;
  if (state === "canceling") return <Loader2 size={size} className="nc-spin" aria-hidden="true" />;
  return <CircleSlash size={size} aria-hidden="true" />;
}

type Filter = "active" | "awaiting" | "finished" | "all";

export function TaskCenter() {
  const dataset = useWorkbench((state) => state.dataset);
  const cancelTask = useWorkbench((state) => state.cancelTask);
  const goArea = useWorkbench((state) => state.goArea);
  const [filter, setFilter] = useState<Filter>("active");
  const [detail, setDetail] = useState<WorkTask | null>(null);

  if (!dataset) {
    return (
      <div className="nc-page-body">
        <Empty
          icon={<PlayCircle size={18} aria-hidden="true" />}
          title="没有任务"
          detail="生成、审核、索引与提交任务都会出现在这里。"
        />
      </div>
    );
  }

  const tasks = dataset.tasks;
  const visible = tasks.filter((task) => {
    if (filter === "all") return true;
    if (filter === "awaiting") return task.state === "awaiting";
    if (filter === "finished") return task.state === "done" || task.state === "failed" || task.state === "canceled";
    return task.state === "queued" || task.state === "running" || task.state === "canceling";
  });

  const counts = {
    active: tasks.filter((task) => task.state === "queued" || task.state === "running" || task.state === "canceling").length,
    awaiting: tasks.filter((task) => task.state === "awaiting").length,
    finished: tasks.filter((task) => task.state === "done" || task.state === "failed" || task.state === "canceled").length,
    all: tasks.length,
  };

  return (
    <>
      <header className="nc-page-head">
        <div>
          <h1 className="nc-page-title">任务中心</h1>
          <p className="nc-page-desc">
            排队、运行、等待作者、完成、失败与取消。取消为两阶段：先发送请求，服务端确认后才会显示为已取消。
          </p>
        </div>
      </header>

      <Tabs
        label="任务筛选"
        value={filter}
        onChange={setFilter}
        items={[
          { id: "active", label: "进行中", count: counts.active },
          { id: "awaiting", label: "等待作者", count: counts.awaiting },
          { id: "finished", label: "已结束", count: counts.finished },
          { id: "all", label: "全部", count: counts.all },
        ]}
      />

      <div className="nc-page-body nc-stack" style={{ gap: 12 }}>
        {visible.length === 0 && (
          <Empty
            icon={<Check size={18} aria-hidden="true" />}
            title="这个分类下没有任务"
            detail="切换上方标签查看其他状态的任务，或回到写作工作区发起新的生成与审核。"
            action={<Btn onClick={() => goArea("writing")}>前往写作工作区</Btn>}
          />
        )}

        {visible.map((task) => {
          const meta = STATE_META[task.state];
          return (
            <article className="nc-card" key={task.id}>
              <div className="nc-task">
                <span className="nc-task-icon" data-state={task.state}>
                  <StateIcon state={task.state} />
                </span>

                <div className="nc-row-fill">
                  <div className="nc-row" style={{ padding: 0, gap: 8, flexWrap: "wrap" }}>
                    <span className="nc-em">{task.title}</span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <Badge tone="neutral">{task.kind}</Badge>
                  </div>
                  <span className="nc-meta">{task.target} · 开始 {task.startedAt ? formatDateTime(task.startedAt) : "—"} · 用时 {task.elapsed}</span>
                  <span className="nc-meta">{task.note}</span>
                  {(task.state === "running" || task.state === "canceling") && (
                    <span style={{ display: "block", marginTop: 6, maxWidth: 320 }}>
                      <Progress value={task.progress} label={`${task.title} 进度`} />
                    </span>
                  )}
                </div>

                <div className="nc-btn-group">
                  <Btn onClick={() => setDetail(task)}>详情</Btn>
                  {task.cancellable && task.state !== "canceling" && (
                    <Btn
                      variant="danger"
                      icon={<Ban size={14} aria-hidden="true" />}
                      onClick={() => void cancelTask(task.id)}
                      title="发送取消请求；服务端确认后才会显示为已取消"
                    >
                      取消
                    </Btn>
                  )}
                  {task.state === "failed" && (
                    <Btn
                      icon={<RefreshCw size={14} aria-hidden="true" />}
                      onClick={() => goArea("settings")}
                      title="失败任务通常需要先处理待恢复事务"
                    >
                      处理恢复
                    </Btn>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {counts.awaiting > 0 && filter !== "awaiting" && (
          <Alert tone="warn" title={`有 ${counts.awaiting} 个任务在等待作者`}>
            审核发现的问题需要作者处理；在等待期间不会有新的模型请求产生费用。
          </Alert>
        )}

        {detail && (
          <section className="nc-card nc-card-pad nc-stack" style={{ gap: 12 }} aria-label={`${detail.title} 详情`}>
            <div className="nc-row" style={{ padding: 0 }}>
              <h2 className="nc-h2">{detail.title}</h2>
              <span className="nc-spacer" />
              <Btn variant="ghost" onClick={() => setDetail(null)}>收起详情</Btn>
            </div>
            <dl className="nc-defs">
              <div>
                <dt>任务编号</dt>
                <dd className="nc-num">{detail.id}</dd>
              </div>
              <div>
                <dt>类型</dt>
                <dd>{detail.kind}</dd>
              </div>
              <div>
                <dt>作用对象</dt>
                <dd>{detail.target}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd><Badge tone={STATE_META[detail.state].tone}>{STATE_META[detail.state].label}</Badge></dd>
              </div>
              <div>
                <dt>说明</dt>
                <dd>{detail.note}</dd>
              </div>
            </dl>
            <h3 className="nc-h3">执行步骤</h3>
            <div className="nc-list">
              {detail.steps.map((step) => (
                <div className="nc-row" key={step.id} style={{ padding: "4px 0" }}>
                  <Badge
                    tone={step.state === "done" ? "ok" : step.state === "active" ? "info" : step.state === "failed" ? "block" : "neutral"}
                  >
                    {step.state === "done" ? "完成" : step.state === "active" ? "进行中" : step.state === "failed" ? "失败" : "待执行"}
                  </Badge>
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
