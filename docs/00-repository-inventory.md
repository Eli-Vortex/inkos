# Novel Creation 源码盘点与工程基线

文档版本：5.0 | 核验日期：2026-09-15 | 状态：源码静态核验

## 1. 三个仓库

| 角色 | 本地路径 | 本地 HEAD | 许可证 |
| --- | --- | --- | --- |
| 宿主 InkOS | `E:\Desktop\Github\novel` | `091048383f411eb99948a8764f42b6fd13006f9b` | AGPL-3.0-only，根包及三个包声明一致 |
| Oh Story | `E:\Desktop\Github\novel\other\oh-story-claudecode` | `907cde183368076a3bf97aa64f27d24c22504510` | MIT |
| Webnovel Writer | `E:\Desktop\Github\novel\other\webnovel-writer` | `878ce26e1d544f5c9c7c210b710adf3587ab90d9` | LICENSE 为 GNU GPL v3，具体传播条件需结合逐文件声明审查 |

官方来源：

- InkOS：<https://github.com/Narcooo/inkos.git>
- Oh Story：<https://github.com/zenstory-ai/oh-story-claudecode.git>
- Webnovel Writer：<https://github.com/lingfengQAQ/webnovel-writer.git>

Webnovel Writer 本机 `origin` 配置为 `https://ghproxy.net/https://github.com/lingfengQAQ/webnovel-writer.git`。这是获取通道，不是新的上游身份。本轮没有修改任何 remote。后续引入资产应记录官方来源、实际获取通道、SHA 和文件哈希。

主仓库当前 HEAD 相比旧基线 `52075bb97422a07315a27094c666dd87e60506b7`，差异集中于三个 README 和火山引擎赞助图片，未涉及 packages 源码。以当前本地 SHA 开发，无需为复用旧文档倒退或重新克隆。

## 2. 实际目录

```text
E:\Desktop\Github\novel/
  .git/                           主仓库历史
  .github/                        CI 等上游工程配置
  packages/
    cli/                          命令行与 TUI，@actalk/inkos
    core/                         创作引擎，@actalk/inkos-core
      src/
      skills/                     15 个 inkos-* 内置技能定义
    studio/                       React + Vite 前端 / Hono API
  skills/
    SKILL.md                      外部集成技能入口
  scripts/
  assets/
  docs/                           本套重建文档
  test-project/
    inkos.json                    测试项目配置，不是正式根配置
  other/
    oh-story-claudecode/           独立 Git 仓库
      skills/                     13 个技能定义
        story-deslop/scripts/     静态风格检查脚本
        */references/             分布式方法、模板、示例
      demo/
      docs/
      scripts/
      tests/
    webnovel-writer/               独立 Git 仓库
      webnovel-writer/
        scripts/data_modules/     Python 合同、提交、索引与测试
        dashboard/                看板，含 frontend/
        templates/genres/         37 个 Markdown 题材模板
        references/taxonomy/      genre-index.csv 等
      docs/
      releases/
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  README.md
  README.en.md
  README.ja.md
  LICENSE
```

上图只展示与整合有关的目录，不代表完整文件列表。`other/` 不在 `packages/*` 工作区匹配范围内，不应为了“整合”直接纳入递归构建。

## 3. 对旧清单的修正

| 原描述容易造成的误解 | 实际情况与工程影响 |
| --- | --- |
| 主目录只有运行数据 | 现在已经是完整主仓库；直接在根目录构建，不再新增 `.integration/source/inkos` |
| Oh Story 根下有统一 references | 资料主要分散在 `skills/*/references/`，必须保留相对引用关系 |
| 100+ 理论就是 100+ 独立文件 | 本地统计有 289 个 references 路径下 Markdown 文件，含分发副本，不等于 289 篇独立理论 |
| Webnovel Writer 根下就是 dashboard | 实际是 `other/webnovel-writer/webnovel-writer/dashboard/` |
| 37 个题材都在根 docs | 实际模板位于内层 `webnovel-writer/templates/genres/` |
| 接入完整 Python 工程即可共用状态 | Python 项目有自己的状态与投影语义，直接并行运行会形成多写入者 |
| 框架有原子文件工具，因此章节已经具备事务性 | 原工具主要处理进程内异常回滚，缺少持久恢复协议与一致读协议 |
| 4567 以前启动过，现在仍运行 | 本次未观察到监听；需要重新构建和健康检查 |

## 4. 宿主关键接入点

| 源码 | 已有职责 | 整合改造点 |
| --- | --- | --- |
| [runner.ts](../packages/core/src/pipeline/runner.ts) | writeDraft/writeNextChapter、锁、Agent 上下文、章节流程 | 统一候选、合同、审核、提交，收敛所有写入口 |
| [writer.ts](../packages/core/src/agents/writer.ts) | 正文生成与持久化交互 | 让治理生成落入候选区，不提前写正式章节 |
| [chapter-persistence.ts](../packages/core/src/pipeline/chapter-persistence.ts) | 正文、truth、索引、快照、记忆顺序持久化 | 接入持久日志与唯一发布点 |
| [atomic-file-set.ts](../packages/core/src/utils/atomic-file-set.ts) | 暂存、备份、rename 和异常回滚 | 补齐崩溃恢复、保留失败证据、Windows 故障测试 |
| [persisted-governed-plan.ts](../packages/core/src/pipeline/persisted-governed-plan.ts) | 解析持久化章节计划 | 合同输入来自 `.plan.md`，不从显示型 `.intent.md` 猜测 |
| [manager.ts](../packages/core/src/state/manager.ts) | 作品、章节索引、快照与回退 | 兼容接口下统一治理写入，防止旧回退路径绕过提交链 |
| [runtime-state-store.ts](../packages/core/src/state/runtime-state-store.ts) | 结构化运行状态读写 | 为兼容状态定义版本、哈希、重建和读屏障 |
| [memory-db.ts](../packages/core/src/state/memory-db.ts) | `story/memory.db`、时序事实、FTS | 按提交号构建投影，落后可重建 |
| [registry.ts](../packages/core/src/skills/registry.ts) | 技能发现与加载 | 受控注册第三方方法；不扫描 entire other 目录 |
| [server.ts](../packages/studio/src/api/server.ts) | 现有 Hono 路由、会话和任务 | 复用鉴权/会话边界，抽取路由而不另写完整服务 |
| [task-store.ts](../packages/studio/src/api/task-store.ts) | 每会话一个任务快照、内存串行写 | 演进持久幂等、多进程协调、恢复和任务 ID 索引 |
| [utils.ts](../packages/cli/src/utils.ts) | CLI 项目根目录取 process.cwd() | 显式传 projectRoot，不误以为环境变量影响所有命令 |

当前 `writeDraft` 会保存章节并更新章节索引；这与本方案“候选不入正式状态”存在实际差异，必须改造。现有 `atomic-file-set` 在异常时尝试回滚并清理事务临时目录，不能直接用于宣称断电后一定恢复完整。

## 5. 参考项目关键资产

Oh Story：

- [去 AI 味检查器](../other/oh-story-claudecode/skills/story-deslop/scripts/check-ai-patterns.js)：CommonJS，只读检查，输出 blocking/advisory；支持 `--check --json --fail-on=blocking|all`。
- [风格白名单](../other/oh-story-claudecode/skills/story-deslop/scripts/style-whitelist.js)：需要纳入规则版本，白名单更新会使旧审查失效。
- [细纲 hook](../other/oh-story-claudecode/skills/story-setup/references/templates/hooks/guard-outline-before-prose.sh)：学习其拦截规则，不能直接作为 PowerShell/Windows 的正式安全门禁。
- `.agents/skills` 在 Git 中是符号链接；宿主技能加载器会拒绝符号链接资源。正式适配包需使用受审查实体文件。
- 根 package.json 主要服务 Dashboard 测试，不是需要注入宿主的后端依赖集合。

Webnovel Writer：

- [合同构造](../other/webnovel-writer/webnovel-writer/scripts/data_modules/runtime_contract_builder.py)：从主设定、卷纲等形成章节约束。
- [提交结构](../other/webnovel-writer/webnovel-writer/scripts/data_modules/chapter_commit_schema.py)、[提交服务](../other/webnovel-writer/webnovel-writer/scripts/data_modules/chapter_commit_service.py)：审查、履约、消歧、事件与待投影输出。
- [叙事债务模块](../other/webnovel-writer/webnovel-writer/scripts/data_modules/index_debt_mixin.py)：提供概念与样例，不直接成为宿主数据库写入者。
- 相关 `data_modules/tests/` 可作为差异测试依据；必须记录采用规则和有意不采用的部分。

## 6. 环境与仓库管理

已核验 Node `v24.6.0`，版本约束见[根 package.json](../package.json)。PNPM 应满足 `>=9.0.0`，具体锁定版本、依赖安装、完整测试尚待 M0 执行。

文档重建前主仓库 `git status --short` 只有 `?? other/`，两个参考仓库工作区干净。此处是检查快照，不是对后续状态的永久保证。

开发前必须决定 `other/` 的版本管理方式：默认维持参考库独立、只记录来源与 SHA；若需要可重复拉取，再经评审正式引入 submodule 或资产清单。**禁止直接 `git add .` 把嵌套仓库误提交为 gitlink。** 本轮不改变其追踪方式。

未来 `.integration/`、`radar/` 等运行产物的 Git 排除规则需在 M0 加入并验证。本轮仅加入 docs 的精确例外，不顺带修改运行数据政策。

## 7. 尚未验证

- 三包全量构建、类型检查、测试与本机 SQLite/FTS5。
- 工作台健康、现有模型配置、真实付费模型调用。
- 上游各入口的完整写入覆盖率、当前 UI 的运行截图。
- GPL/AGPL 组合分发、网络服务和第三方素材的最终合规结论。
- 真实书稿质量提升、追读力指标与性能目标。

这些项目进入 M0 或后续验收，不以文档中的目标设计替代验证。
