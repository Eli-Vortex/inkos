# Novel Creation 数据模型、章节提交与恢复协议

文档版本：5.0 | 状态：目标协议，尚未实现 | 本文是数据一致性的权威设计

## 1. 一致性目标与边界

正文、设定、章节索引、运行状态和记忆不能分别成功后就被视为同一次完整提交。系统必须让读者看到提交前或提交后的一个完整版本，而不是两者混合。

本方案采用：**不可变版本归档 + 持久事务日志 + 唯一 HEAD 发布点 + 统一读写服务 + 可重建投影**。不是使用真正的 Git 命令保存书稿，也不是假装文件与 SQLite 共享事务。

M2 必须验证进程崩溃恢复。对整机断电、磁盘损坏、网络盘、Windows 文件系统 flush/rename 的持久性不作未经测试的保证；明确支持本地 NTFS，同卷暂存，辅以离线备份和校验。网络盘与同步盘默认不支持生产写入。

## 2. 权威与派生

| 数据 | 权威来源 | 派生/缓存 |
| --- | --- | --- |
| 已提交正文 | HEAD 可达的不可变提交归档 | 兼容 `chapters/` 文件、展示缓存 |
| 正式设定、truth、结构化运行状态 | 同一提交快照内保存的版本 | 工作目录兼容副本、查询 DTO |
| 批准细纲 | 已版本化的 `story/runtime/chapter-NNNN.plan.md` 及批准记录 | `.intent.md` 仅供展示 |
| 章节合同 | 固定输入的合同文件和依赖指纹 | 页面摘要、状态卡 |
| 候选稿 | 候选内容版本及元数据 | 编辑器缓冲、本地恢复稿 |
| 审查证据 | 绑定候选/合同/规则版本的报告 | 分组列表和曲线 |
| 连续性事实、承诺事件 | 已接受提交事件与证据 | SQLite、统计、全文/向量索引 |
| 任务 | 持久任务快照及幂等记录 | SSE、浏览器状态 |

未迁移作品继续遵循宿主现有权威路径；迁移完成后管理读端必须通过 HEAD 快照解析器。不能同时宣布原始文件和另一个数据库各自拥有最终解释权。

## 3. 建议运行目录

以下位于实际运行项目根目录，**不在 `other/` 写运行数据**。这些新增文件是拟建结构，本轮未创建。

```text
books/<bookId>/
  chapters/                         兼容正文与 index.json
  story/
    runtime/                        兼容持久化章节计划
    memory.db                       可重建 SQLite 投影
    fusion/
      mode.json                     migrationVersion / observe|enforce
      HEAD.json                     唯一已公布提交指针
      drafts/<draftId>/
        revisions/<revision>.md     不可变 UTF-8 候选版本
        revisions/<revision>.json   哈希、来源、基线、时间
        current.json                候选当前 revision 指针
      contracts/<contractId>.json
      reviews/<reviewId>.json
      commits/<commitId>/
        commit.json                 父提交、事件、审核、写集 manifest
        before/                     被修改/删除对象的旧字节
        after/                      新字节与新增对象
      transactions/<operationId>/
        journal.json                持久阶段与恢复指令
        staging/                    待发布内容，同卷
      projections.json              索引 schemaVersion / lastAppliedCommit
.inkos/
  tasks/                            保留旧快照兼容入口
  fusion/
    operations/                     持久幂等记录与结果
    locks/                          跨进程协调信息
```

路径均由服务端生成，资源 ID 不允许成为任意文件路径。bookId 与归档 manifest 路径必须二次 realpath/边界校验，禁止 junction/symlink 导向项目外。

## 4. 基础模型

| 模型 | 必需字段 | 约束 |
| --- | --- | --- |
| DraftRevision | schemaVersion, bookId, chapterId, draftId, revision, contentHash, baseCommit, source, createdAt | 内容不可变，编辑新建 revision |
| PlanApproval | planRevision, planHash, approver, approvedAt | 计划修改即需再次批准 |
| ChapterContract | contractId, schemaVersion, baseCommit, chapterId, planHash, dependencyHash, policyHash, requirements, prohibitions, inputRefs | 必达点有稳定 ID，来源可追溯 |
| ReviewReport | reviewId, contractId, draftId, draftRevision, contentHash, baseCommit, dependencyHash, policyHash, findings, verdict, usage | 不能只凭 reviewId 认定可提交 |
| Finding | findingId, ruleId, severity, evidence, confidence, disposition | 不确定性不伪装成确定错误 |
| BookCommit | schemaVersion, commitId, parentCommit, operationId, kind, acceptedEvents, manifest, createdAt | kind 为 genesis/settings/plan/chapter/revert；仅 genesis 的父指针为空 |
| ChapterCommit | BookCommit 的 chapter 分支，加 chapterId, contentHash, contractId, reviewId | 章节分支必需审核证据；其他类型有各自校验，不能伪造空审核通过 |
| ProjectionState | projectionName, schemaVersion, lastAppliedCommit, status, error | 落后不改变正式提交结果 |
| OperationRecord | scope, idempotencyKey, inputHash, status, taskId, commitId, result | 相同键不同输入必须冲突 |

时间统一保存 UTC ISO 8601，界面按时区显示。哈希使用 SHA-256；JSON 用确定性序列化。正文先按明确的 UTF-8/LF 策略保存，再对实际保存字节取哈希，不能用 trim 后文本掩盖改动。正文证据位置定义见 API 文档。

### 4.1 正文之外的变更

新治理作品首先创建全量 genesis，后续所有正式变更具有基线。设定保存、持久化计划保存/批准以 settings/plan 类型使用同一 journal/HEAD 协议，不推进章节数量；计划批准记录随计划版本归档，修改计划即撤销该版本之后的批准状态。它们不要求正文审核，但必须有作者动作、结构校验、版本条件和依赖失效处理。

候选保存、只读分析和审查报告不推进 HEAD。全局规则配置使用独立版本化配置和 policyHash，由同一受控配置服务更新；提交前再次验证配置版本。不能把任意文件的 mtime 当作版本。

写集采用明确的权威资源白名单。归档不得递归包含自身 `commits/`、`transactions/`、HEAD、候选缓存、数据库、锁、任务或密钥。合同/审核通过固定 ID 和哈希引用并按引用关系保留；genesis 的“全量”仅指权威书稿/设定/计划及其批准元数据，不是全目录备份。

## 5. 合同构造与门禁

合同从严格解析且已批准的 `.plan.md`、主设定、卷纲、当前正式快照和选定规则构造。现有计划解析失败可能返回 null；必须返回业务错误，不能把 null 当作无约束写作授权。

合同至少包含：章节目标、必须发生的变化、禁止事项、出场角色/身份、时间与空间约束、待回应承诺、字数/风格偏好、证据输入、批准记录和依赖指纹。

依赖指纹覆盖实际参与的设定/纲要版本、规则配置、适配器版本和白名单。来源改变、候选改变、HEAD 前进、计划撤销批准均使旧审核失效。与当前章无关的资料更新可以不失效，但必须由显式依赖集合判定，不能靠文件更新时间猜测。

失效规则：

| 改动 | 处理 |
| --- | --- |
| 正文候选任意字节变化 | 新 revision；旧审核 stale |
| 批准细纲或硬约束变化 | 新批准与合同，重新审核 |
| 角色设定/已提交事实变化 | 新基线，重新计算相关合同依赖 |
| 规则版本、白名单或严重度变化 | 新 policyHash，重新审核或明确规则迁移 |
| 人工解决实体消歧 | 新消歧版本，重跑受影响检查 |
| 仅打开页面、重排展示、读取日志 | 不改变内容版本 |

## 6. 候选与审核状态

候选是不可变内容版本集合，当前指针通过 ETag 比较更新；写入文件成功但指针未更新的版本作为孤立候选保留并可清理，不能向客户端返回虚假保存成功。

审核执行状态与结论分开：执行可为 queued/running/completed/failed/interrupted；结论为 pass/needs_changes/indeterminate/stale。人工采纳补丁也会产生新候选并失效旧报告。

质量建议可在 observe 下记录后提交；enforce 按选定合同策略阻断。以下完整性要求在任何已迁移模式都不可关闭：版本匹配、合同/报告真实性、路径安全、未解决的提交事务、锁所有权和可恢复写集。未解决关键实体身份导致无法形成有效事件时也不可假装提交成功。

自动修订不是原地编辑：每轮新建候选和报告，默认 1 轮，最大 2 轮后等待作者。

## 7. Chapter Commit 协议

### 7.1 准备阶段（不改变正式状态）

1. 持久登记 operationId、幂等键与规范化请求哈希；重复请求首先读取已有结果。
2. 确认候选版本已保存、合同来源计划已批准、审核完成并匹配全部指纹；提取待接受事件，完成 schema 校验与消歧。本节描述 chapter 类型提交，settings/plan 等类型使用各自校验但共用发布/恢复协议。
3. 模型工作在锁外完成。获得书级跨进程写锁后，先恢复该书未完成事务，再重新读取 HEAD 与依赖。
4. 比较 expectedHead、候选 revision、合同和策略；不一致返回冲突，不自动把旧审核绑定到新 HEAD。
5. 计算完整写集，保存新增/修改/删除清单、每项旧/新哈希、旧文件是否存在。新文件的 before 是不存在标记，删除是 tombstone，不用空文件替代。
6. 写入不可变 before/after 归档、commit.json、staging 内容和 journal `PREPARED`，验证哈希与必要 flush。准备失败不能推进 HEAD。

### 7.2 发布阶段（禁止模型调用）

1. journal 更新为 `PUBLISHING`，正式写入者持有锁；兼容文件读者进入读屏障。
2. 将准备好的正式正文、truth、运行状态、章节索引等写集应用到兼容路径。每步可重复执行并校验；当前 `atomic-file-set` 必须增强，不能失败时无条件删除恢复材料。
3. 再次校验写集完整性与锁拥有者；使用同卷临时文件替换 HEAD.json，指向已经完整保存的 commitId。这是唯一逻辑发布点。
4. journal 更新为 `HEAD_PUBLISHED`；若此步崩溃，恢复以有效 HEAD 和归档为准，不以日志最后一行否定已发布提交。
5. 持久化 operation 的 commitId 与成功回执，释放写锁。响应成功必须包含 commitId、HEAD 与投影状态。

管理读者始终从读取时固定的 HEAD 及其归档解析同一快照；旧兼容读者必须被读屏障保护，或完成改造后才能在已迁移书上启用。不可能通过本协议保证未接入的外部文本编辑器读取到原子文件集。

### 7.3 投影阶段

按父链顺序应用 acceptedEvents 到 SQLite，在同一 DB 事务内更新数据与 lastAppliedCommit。索引重试使用提交 ID 去重；失败标记 lagging/failed 并保留重建任务，不能撤销已公布 HEAD。

归档未包含的未变更文件从父提交解析；genesis 基线归档必须包含全量权威文件。定期检查点可以加速读取，但不能让旧归档变成无法恢复的悬空引用。

## 8. 崩溃恢复表

| 观察到的状态 | 恢复动作 | 对外结果 |
| --- | --- | --- |
| 无 PREPARED，只有未引用 staging | 验证未被操作引用，保留至清理窗口 | 正式状态未变 |
| PREPARED，HEAD 仍是父提交 | 用 before/tombstone 撤销可能的部分写入，校验父快照 | 原操作标记未提交，可显式重试 |
| PUBLISHING，HEAD 仍是父提交 | 同上；不得猜测作者愿意完成提交 | 原 HEAD 可读，恢复完成后可写 |
| HEAD 指向新提交，日志仍较早 | 用 after 重放兼容文件，补操作回执与日志 | 已提交，重复请求返回同一 commitId |
| HEAD_PUBLISHED，DB 落后 | 按链补投影 | 已提交/索引更新中 |
| HEAD/归档校验失败，或父链缺失 | 封锁正式写入，隔离证据，提供人工恢复报告 | `RECOVERY_REQUIRED`，不自动丢弃数据 |
| 新提交之后已有后继提交 | 按完整链恢复，不把旧 journal 当作应回退 HEAD 的命令 | 最新有效 HEAD 保持不变 |

启动服务和获取书写锁时都检查恢复。journal、before/after、失败报告在恢复确认前不得自动清理；恢复程序执行两次应得到相同字节和结果。

## 9. 幂等与并发

幂等作用域至少包括 projectId、actor、bookId、command 和 key。请求哈希包括全部条件与正文引用；同 key 同输入返回原任务/结果，同 key 不同输入返回 `409 IDEMPOTENCY_KEY_REUSED`。

候选保存用 `If-Match` 防止覆盖；正式提交用 expectedHead 防止旧基线推进。无条件请求返回 `428`，ETag 不匹配返回 `412`，业务基线冲突返回 `409`。

书级锁必须跨进程；旧拥有者不能仅在锁过期后继续执行写集。活跃操作的幂等记录不设短 TTL；终态记录默认至少保留 30 天，正式提交内的 operationId 永久留在提交历史中，清理后仍能查到提交回执。

“网络断开”不等于“提交失败”。客户端先查询 task/operation 结果，不能换幂等键盲目重试。

## 10. 恢复、历史改写与迁移

M2 仅支持最新章节的受控恢复：基于历史快照创建新的 `kind=revert` 提交，parent 仍为当前 HEAD，记录 revertsCommit 和原因；不删除原归档、不直接倒拨 HEAD。恢复后正文/事实/索引反映选定状态，后续章节号根据恢复快照决定。

M4 历史改写需要列出后续章节、事件、承诺与摘要的依赖影响，建立隔离分支/工作区，逐章重审后一次受控切换。只修改某个旧 Markdown 文件不算完成历史重放。

存量迁移步骤：

1. 作者停止写入，生成一致备份及哈希清单；导出当前作品元信息。
2. 在隔离副本检查编码、计划、正文/索引差异、损坏状态、重复 ID 和数据库投影。
3. 保留原始文件，生成数据版本升级结果和迁移报告；不可自动“补造”未有证据的历史事件。
4. 创建全量 genesis 基线，历史章节标记 imported_baseline、未逐章重审。
5. 校验兼容读取与重建，再切换为 observe。启用 enforce 需明确确认。

未迁移 off 与已迁移 observe/enforce 必须分开建模；模式调整不影响完整性约束。

## 11. 数据保留与备份

候选、审核、合同、提交、事务日志都含创作数据。正式归档和提交证据不自动裁剪；临时候选/事件日志可按配置清理，但需列出依赖并保留仍被提交引用的对象。

运行备份按白名单复制作品、配置和必要运行状态，不将整个源码根目录递归复制到自身子目录。SQLite 需停止写入并 checkpoint/关闭后复制，或使用已验证的在线备份 API；不能只复制活跃的 memory.db 而忽略 WAL。

备份本身不等于恢复成功，必须在隔离目录验证 HEAD、哈希、正文、索引重建和最新恢复操作。详见[部署运维](08-deployment-and-operations.md)。
