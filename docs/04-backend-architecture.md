# Novel Creation 后端架构与工程优化方案

文档版本：5.0 | 状态：目标设计 | 关联：[数据事务](05-data-and-transactions.md)、[API](06-api-contracts.md)

## 1. 架构决策

保留现有 TypeScript Monorepo、Core 创作引擎、Pi-agent Harness、Zod、Hono 和 SQLite。扩展现有服务与技能机制，不把 Oh Story、Webnovel Writer 作为并行主引擎，不引入 Python 常驻服务或第二个 Web 工作台。

```text
Studio / CLI / TUI / Agent / daemon / import / repair
                         |
            Application Commands + projectRoot
                         |
            Book Mutation Gateway (唯一写入口)
              /          |          \
       Draft/Contract   Review    Commit/Recovery
              \          |          /
         Host Harness + bounded Skill/Tool Adapters
                         |
     authoritative files + immutable commits + HEAD
                         |
          rebuildable SQLite / search projections
```

“唯一写入口”是所有作者数据变更的工程约束，不只是新增一个 HTTP 端点。路径直接写入、旧 CLI、修复命令和文件监听也要纳入覆盖矩阵。

## 2. 模块与职责

以下为建议模块边界，具体文件命名在实施时与现有代码对齐。

| 模块 | 所属位置建议 | 输入/输出 | 不负责 |
| --- | --- | --- | --- |
| MutationGateway | Core pipeline | 项目、作品、命令、条件 -> 结果 | 不调用 UI，不绕过锁 |
| ContractService | Core pipeline | 已批准计划、依赖 -> 版本化合同 | 不生成第二套主设定 |
| CandidateService | Core chapter workspace | 内容/修订 -> 候选 revision | 不推进正式索引 |
| ReviewService | Core agents/pipeline | 合同+候选+规则 -> 证据报告 | 不直接修改正文或 truth |
| CommitService | Core persistence | 有效候选+审核+确认 -> commitId | 不在发布锁内调用模型 |
| RecoveryService | Core persistence | HEAD+journal+archive -> 一致状态 | 不擅自删除损坏证据 |
| ProjectionService | Core state | 提交事件 -> SQLite/摘要投影 | 不成为权威事实来源 |
| AdapterRegistry | Core skills | 版本清单 -> 显式允许的方法/工具 | 不自动执行上游 hook |
| TaskCoordinator | Core 领域接口 + Studio 存储适配 | 任务 ID、租约、幂等、快照 | 不仅靠会话内存判断完成 |

API DTO 由 Zod schema 定义并导出类型；HTTP 层只做认证、路径/请求校验、任务分发和结果映射。领域服务不依赖 Hono Context 或 React store。

## 3. 与现有写流程的衔接

源码中的 Runner `writeDraft` 已调用 Writer 保存章节并保存索引，`writeNextChapter`、修订、导入、修复也会影响作品文件。直接在外围加“审核后点击提交”会使未审核内容提前成为事实。

改造分四步：

1. 列出所有正文、truth、runtime state、章节索引、快照与记忆的写调用；记录入口及锁范围。
2. 为生成、修订、审核注入只读基线与候选输出目的地，隔离模型可能触达的文件工具。
3. 将现有持久化能力拆为“准备写集”和“受治理发布”，由 CommitService 唯一调用正式写集。
4. 对已迁移作品，旧写入口转发统一命令或明确拒绝；不得 catch 新流程错误后 fallback 到旧直写。

MVP 可限制已迁移书仅允许修改最新章；不支持的旧 rollback/import 模式应返回可解释错误，不能保留暗门。

## 4. 统一命令合同

写命令包含 actor、projectRoot、bookId、operationId、requestId，以及操作需要的并发条件。候选保存用 revision/ETag；正式正文、设定和已版本化计划变更用 expectedHead，另按类型携带 contract/review 标识。所有路径由宿主 ID 解析器生成，不接受任意用户文件路径作为写入目标。

领域结果分为：完成结果、已持久接受的任务、业务拒绝、并发冲突、恢复阻断。后端日志与 API 返回均包含关联 ID，但不包含密钥或无必要的全文。

projectRoot 在启动或命令边界解析为真实绝对路径并固定，不让技能或客户端每次传入未验证目录。现有 CLI 默认使用 process.cwd()，仅设置 `INKOS_PROJECT_ROOT` 不能假定所有 CLI 已支持该环境变量。

## 5. 任务、并发与恢复

现有 Studio task-store 是 `.inkos/tasks` 下每会话一个快照，状态为 running/processing/completed/error，写入队列是进程内 Map。它提供可复用基础，但尚不是持久多任务队列或跨进程锁。

演进要求：

- 保留旧会话快照读取兼容，新增 schemaVersion、taskId 索引、operationId、inputHash、bookId、lease、attempt 和取消状态。
- 接受任务前先持久化幂等记录；`202` 只能在接受记录可靠保存后返回。
- 生产任务同会话默认一个；跨会话同书正式变更由书级锁串行。不同书可并发，初始上限 2，可按资源配置。
- 生成/审查在锁外读取固定快照并执行；正式发布前重新锁定、校验基线与依赖。不能持锁等待数分钟模型调用。
- 锁需跨 CLI 与 Studio 进程有效，带拥有者 token、租约和恢复检查。超时不能仅凭时间抢锁，先确认进程/事务状态；提交校验防止旧拥有者继续写入。
- 进程重启后由持久任务和事务记录判定完成/中断/待恢复。无 provider 幂等保证的模型请求不得声称 exactly-once，未知执行结果需提示可能已计费。
- 自动修订默认 1 轮，允许配置最多 2 轮；之后等待作者。重试与修订分别计数，禁止无限递归工具调用。

取消在候选/审核阶段可中断，已完成输出作为未确认产物保留；进入正式发布临界区后推迟取消，完成恢复安全点后报告真实结果。

## 6. 模型路由、上下文与成本

沿用宿主模型服务配置。按“规划、正文、审核、摘要”配置可选模型路由，但统一预算与调用台账，不让每个技能携带独立 API key。

上下文由固定的作者指令、批准合同、必要事实和最相关证据组成。技能 SKILL.md 是方法说明，不代表允许读取全部仓库或执行任意命令。详见[技能融合](07-integration-and-skills.md)。

预算包括输入/输出 token、模型返回用量、重试、缓存计费、工具调用上限、单任务/日预算和最大时间。价格来自可配置版本化表；未知价格标记为未知，可用 token 限额继续约束，不能按零成本放行。

长文本按章节和语义块检索；禁用“整本书+全部 37 模板+全部 references”进入一次请求。截断必须有报告，合同与作者硬约束不得静默丢弃。

## 7. 存储与索引

正式正文和主状态沿用宿主兼容路径，通过不可变提交归档和 HEAD 获得一致版本。SQLite 继续承担时序事实和 FTS5 查询；每个投影记录 lastAppliedCommit 和 schemaVersion，可在 DB 内使用单个事务应用一项提交。

不能把 SQLite 事务和文件 rename 包装成“同一个原子事务”。提交成功但投影落后时，读端使用提交快照或明确降级，后台重建；不得回滚已经公布的正式章节来迁就索引。

现有 `atomic-file-set.ts` 可复用底层 staging/rename 思路，但必须补持久恢复信息、失败归档保留和一致读。正式协议以 05 文档为准。

## 8. 安全与可靠性

| 风险 | 约束 |
| --- | --- |
| 本地 API 暴露 | M0 明确绑定 loopback；现有 serve 只传 port，不能凭 localhost 链接认定只监听本机 |
| 浏览器跨站访问 | 验证 Host/Origin，限制 CORS；写操作需要会话保护，cookie 模式需 CSRF 防护 |
| 路径遍历 | UUID/合法 ID + realpath 边界校验；阻止 `..`、UNC、盘符跳转、symlink/junction 越界 |
| 导入/导出攻击 | 文件数/大小/解压预算、zip slip 防护、编码检查、原始文件只读留存 |
| 命令注入 | 不用 shell 拼接输入；显式 executable/args、超时、输出上限、工作目录 |
| 提示注入 | 书稿/网页/技能资料是非可信数据，不获得工具授权或上层指令优先级 |
| 原稿外发 | 明确模型服务与输入范围，外网搜索/采集默认关闭；保密模式禁止发送 |
| 密钥泄露 | 服务端存储、响应遮罩、日志脱敏；禁止浏览器持久化明文 key |
| 无限资源 | 队列背压、全局/单书并发、内存/输出限制、预算及超时 |

正式部署前补齐身份和网络边界。不得直接开放 `0.0.0.0` 或公网反代后仍以“本地工具”作为安全说明。

## 9. 可观测性与性能

统一日志字段：requestId、taskId、operationId、bookId、commitId、阶段、耗时、重试次数、错误码。书名和正文默认不进日志；原始模型载荷仅在作者显式诊断模式下有限期保留。

指标覆盖：排队时间、生成/审核时长、保存延迟、提交临界区耗时、锁冲突、恢复次数、索引落后量、失效审核率、规则误报和真实用量。

本地无模型操作目标：常用列表 p95 <= 300ms、候选持久保存 p95 <= 500ms、单章提交临界区 p95 <= 2s；硬件和样本见测试文档。目录扫描要排除 `other/`、`.git/`、`node_modules/`、`.integration/backups/` 和发布副本。

## 10. 技术验收门槛

所有新书正式写操作可在静态调用图及动态测试中追溯到统一 MutationGateway；断网不影响本地编辑/读取/导出；kill 进程后无半章可见；两个进程同时提交仅一个基线成功；投影删除后可重建；旧项目和旧任务快照按兼容策略读取。

无法达到这些要求时允许继续只读方法试用，不允许开启 enforce 生产写入。
