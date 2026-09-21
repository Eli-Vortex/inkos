/**
 * 设置与关于 — model configuration entry, rules, diagnostics and product
 * information. Compatibility and open-source provenance remain available as
 * secondary disclosure instead of competing with the product identity.
 *
 * Capabilities that are not connected in production mode are listed explicitly
 * as 不可用. The demo switch is the only place the workbench may run on sample
 * data, and it says so everywhere it is on.
 */

import { useState } from "react";
import { Cpu, FlaskConical, Info, Moon, RotateCcw, Sun, Wrench } from "lucide-react";
import type { DemoState, Severity } from "../types";
import { useWorkbench } from "../state/store";
import { Alert, Badge, Btn, Empty, Tabs, type Tone } from "../ui";
import { formatDateTime } from "../format";

const SEVERITY_TONE: Record<Severity, Tone> = { block: "block", warn: "warn", suggest: "info" };
const SEVERITY_LABEL: Record<Severity, string> = { block: "阻断", warn: "警告", suggest: "建议" };

const DIAG_TONE = { ok: "ok", warn: "warn", block: "block", unavailable: "neutral" } as const;
const DIAG_LABEL = { ok: "正常", warn: "需注意", block: "阻断", unavailable: "不可用" } as const;

const SCENARIOS: ReadonlyArray<{ id: DemoState; label: string; detail: string }> = [
  { id: "normal", label: "正常", detail: "有作品、章节、候选与审核结果。" },
  { id: "empty", label: "空", detail: "没有任何作品，展示空态引导。" },
  { id: "loading", label: "加载中", detail: "骨架屏与载入提示。" },
  { id: "error", label: "失败", detail: "读取失败，提供重试。" },
  { id: "conflict", label: "冲突", detail: "保存返回版本不匹配，并保留本地文本。" },
  { id: "stale", label: "过期", detail: "基线变更后审核标记为过期。" },
  { id: "recovering", label: "恢复中", detail: "待恢复事务正在回滚。" },
];

type Tab = "model" | "rules" | "diagnostics" | "about";

export function SettingsAbout({ theme, onToggleTheme, onOpenModelConfig }: {
  readonly theme: "light" | "dark";
  readonly onToggleTheme: () => void;
  readonly onOpenModelConfig?: () => void;
}) {
  const dataset = useWorkbench((state) => state.dataset);
  const demoMode = useWorkbench((state) => state.demoMode);
  const setDemoMode = useWorkbench((state) => state.setDemoMode);
  const scenario = useWorkbench((state) => state.scenario);
  const setScenario = useWorkbench((state) => state.setScenario);
  const toggleRule = useWorkbench((state) => state.toggleRule);
  const pushToast = useWorkbench((state) => state.pushToast);
  const [tab, setTab] = useState<Tab>("model");

  return (
    <>
      <header className="nc-page-head">
        <div>
          <h1 className="nc-page-title">设置与关于</h1>
          <p className="nc-page-desc">
            模型配置入口、规则严重度、诊断状态，以及品牌与开源来源。尚未接入的能力在这里明确标注为不可用，不会在执行时假装成功。
          </p>
        </div>
        <div className="nc-btn-group">
          <Badge tone={demoMode ? "warn" : "ok"}>{demoMode ? "演示数据模式" : "正式模式"}</Badge>
          <Btn
            icon={theme === "dark" ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
            onClick={onToggleTheme}
          >
            {theme === "dark" ? "切换浅色" : "切换深色"}
          </Btn>
        </div>
      </header>

      <Tabs
        label="设置分组"
        value={tab}
        onChange={setTab}
        items={[
          { id: "model", label: "模型配置" },
          { id: "rules", label: "规则", count: dataset?.rules.length },
          { id: "diagnostics", label: "诊断", count: dataset?.diagnostics.length },
          { id: "about", label: "关于" },
        ]}
      />

      <div className="nc-page-body nc-stack" style={{ gap: 16 }}>
        {tab === "model" && (
          <>
            <section className="nc-card nc-card-pad nc-stack" style={{ gap: 10 }} aria-label="模型配置">
              <h2 className="nc-h2"><Cpu size={15} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> 模型服务</h2>
              <p className="nc-meta">
                模型供应商、连接测试、价格来源与预算仍由宿主 Studio 的服务配置页面管理；本工作台只提供入口，不复制一套配置逻辑。
              </p>
              <div className="nc-btn-group">
                <Btn
                  variant="primary"
                  onClick={() => {
                    if (onOpenModelConfig) onOpenModelConfig();
                    else pushToast({ tone: "info", title: "请在宿主 Studio 中打开模型配置", detail: "独立预览不包含服务配置页面。" });
                  }}
                >
                  打开模型配置
                </Btn>
              </div>
            </section>

            <section className="nc-card nc-card-pad nc-stack" style={{ gap: 10 }} aria-label="演示数据">
              <h2 className="nc-h2"><FlaskConical size={15} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> 演示数据</h2>
              <label className="nc-row" style={{ padding: 0, gap: 10 }}>
                <input
                  type="checkbox"
                  checked={demoMode}
                  onChange={(event) => setDemoMode(event.target.checked)}
                  aria-label="启用演示数据模式"
                />
                <span className="nc-row-fill">
                  <span className="nc-em">启用演示数据模式</span>
                  <span className="nc-meta">
                    关闭后工作台进入正式模式：尚未接入的能力会明确报错为不可用，而不是显示模拟成功。
                  </span>
                </span>
              </label>
              <div className="nc-seg" role="group" aria-label="演示数据场景">
                {SCENARIOS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={scenario === item.id}
                    onClick={() => setScenario(item.id)}
                    title={item.detail}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="nc-meta">
                {SCENARIOS.find((item) => item.id === scenario)?.detail} 预览中的保存、提交与取消只改变模拟状态，绝不调用真实写接口。
              </p>
            </section>

            <section className="nc-card nc-card-pad nc-stack" style={{ gap: 10 }} aria-label="尚未接入的能力">
              <h2 className="nc-h2">尚未接入的能力</h2>
              <p className="nc-meta">以下能力在此版本中不可用；正式模式下请求它们会明确失败。</p>
              <div className="nc-list-flat">
                {(dataset?.unavailable ?? []).map((item) => (
                  <div className="nc-row nc-row-top" key={item.id} style={{ padding: "10px 0" }}>
                    <Badge tone="neutral">不可用</Badge>
                    <span className="nc-row-fill">
                      <span className="nc-em">{item.label}</span>
                      <span className="nc-meta">{item.reason}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === "rules" && (
          <section className="nc-stack" style={{ gap: 10 }} aria-label="规则列表">
            <Alert tone="info" title="规则严重度决定是否阻断提交">
              阻断级规则不允许在界面中忽略后提交；关闭一条规则只影响后续审核，不会改动已有审核记录。
            </Alert>
            {!dataset ? (
              <Empty icon={<Wrench size={18} aria-hidden="true" />} title="没有规则数据" detail="载入项目后这里会显示生效的规则包。" />
            ) : (
              dataset.rules.map((rule) => (
                <div className="nc-card nc-card-pad nc-row" key={rule.id}>
                  <span className="nc-row-fill">
                    <span className="nc-em">{rule.name}</span>
                    <span className="nc-meta">{rule.group} · {rule.source}</span>
                  </span>
                  <Badge tone={SEVERITY_TONE[rule.severity]}>{SEVERITY_LABEL[rule.severity]}</Badge>
                  <label className="nc-row" style={{ padding: 0, gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(event) => void toggleRule(rule.id, event.target.checked)}
                      aria-label={`启用规则 ${rule.name}`}
                    />
                    <span className="nc-meta">{rule.enabled ? "已启用" : "已停用"}</span>
                  </label>
                </div>
              ))
            )}
          </section>
        )}

        {tab === "diagnostics" && (
          <>
            <section className="nc-stack" style={{ gap: 10 }} aria-label="诊断状态">
              {(dataset?.diagnostics ?? []).map((entry) => (
                <div className="nc-card nc-card-pad nc-row nc-row-top" key={entry.id}>
                  <Badge tone={DIAG_TONE[entry.state]}>{DIAG_LABEL[entry.state]}</Badge>
                  <span className="nc-row-fill">
                    <span className="nc-em">{entry.label}</span>
                    <span className="nc-meta">{entry.detail}</span>
                  </span>
                </div>
              ))}
            </section>

            <section className="nc-card nc-card-pad nc-stack" style={{ gap: 10 }} aria-label="待恢复事务">
              <h2 className="nc-h2">提交链与恢复</h2>
              <p className="nc-meta">
                存在待恢复事务时，正式写操作会暂停。恢复流程会回滚到安全基线并重新建立索引，不会修改已经提交的正式章节。
              </p>
              <div className="nc-btn-group">
                <Btn
                  variant="primary"
                  icon={<RotateCcw size={14} aria-hidden="true" />}
                  onClick={() => {
                    setScenario("recovering");
                    pushToast({ tone: "info", title: "已切换到恢复中场景", detail: "演示预览不会执行真实的恢复流程。" });
                  }}
                >
                  模拟执行恢复
                </Btn>
              </div>
            </section>
          </>
        )}

        {tab === "about" && (
          <>
            <section className="nc-card nc-card-pad nc-stack" style={{ gap: 10 }} aria-label="品牌">
              <h2 className="nc-h2">Novel Creation</h2>
              <p className="nc-meta">
                面向中文小说作者的本地优先创作工作台。写作、审核、版本与提交都围绕作者本人的稿件展开。
              </p>
              <dl className="nc-defs">
                <div>
                  <dt>界面语言</dt>
                  <dd>简体中文（跟随宿主项目设置）</dd>
                </div>
              </dl>
            </section>

            <details className="nc-card nc-card-pad" aria-label="开源与兼容信息">
              <summary className="nc-row" style={{ padding: 0, cursor: "pointer" }}>
                <Info size={15} aria-hidden="true" />
                <span className="nc-em">开源与兼容信息</span>
              </summary>
              <div className="nc-stack" style={{ gap: 10, marginTop: 14 }}>
                <p className="nc-meta">
                  为兼容既有项目与工具链，配置文件、环境变量、包名和 CLI 命令继续沿用原技术标识。
                </p>
                <dl className="nc-defs">
                  <div>
                    <dt>技术标识</dt>
                    <dd>inkos.json、.inkos、INKOS_*、inkos CLI</dd>
                  </div>
                  <div>
                    <dt>上游程序</dt>
                    <dd>@actalk/inkos-studio</dd>
                  </div>
                  <div>
                    <dt>许可</dt>
                    <dd>AGPL-3.0-only</dd>
                  </div>
                  <div>
                    <dt>源码仓库</dt>
                    <dd>github.com/Narcooo/inkos（packages/studio）</dd>
                  </div>
                  <div>
                    <dt>界面资源</dt>
                    <dd>lucide-react · Geist Variable · 系统中文字体</dd>
                  </div>
                  <div>
                    <dt>本次载入</dt>
                    <dd>{formatDateTime(new Date().toISOString())}</dd>
                  </div>
                </dl>
                <p className="nc-meta">
                  演示数据为虚构作品，仅用于预览界面状态，不包含任何真实书稿内容。
                </p>
              </div>
            </details>
          </>
        )}
      </div>
    </>
  );
}
