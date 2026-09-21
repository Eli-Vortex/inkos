# Novel Creation 三项目融合与技能适配方案

文档版本：5.0 | 状态：目标设计，参考库保持只读 | 关联：[源码盘点](00-repository-inventory.md)

## 1. 采用方式

| 来源 | 采用内容 | 不直接采用 |
| --- | --- | --- |
| InkOS | 宿主工程、Harness、工具体系、Zod 状态、记忆、Studio | 不另复制一套宿主到隐藏目录 |
| Oh Story | 扫榜/拆书方法、细纲约束、review、deslop、题材资料 | 不运行 setup/hook 安装，不并行维护 Dashboard 状态 |
| Webnovel Writer | 章节合同、审查履约、提交事件、叙事承诺、题材规则 | 不让 Python 引擎直接写宿主正文、数据库和状态 |

优先顺序是“方法资产 -> 结构化检查 -> 受控工具 -> 正式写入”。所有生产改写、计划保存、提交和恢复始终由 Core 的治理服务执行。

`other/` 是来源与回归参考，不是生产插件自动扫描目录。正式发行只能携带明确批准的适配器、必要资源、来源清单及许可证，不能要求最终用户保留两个完整开发仓库。

## 2. Oh Story 逐技能分类

本地共 13 个技能定义，按工作流映射如下：

| 上游技能 | Novel Creation 归属 | 接入方式 | 阶段 |
| --- | --- | --- | --- |
| story | 路由/方法入口 | 抽取索引概念，复用宿主意图路由 | M1 |
| story-setup | 项目配置方法 | 提取配置项与检查清单，不运行安装脚本 | M0-M1 |
| story-import | 素材/书稿导入 | 方法映射到现有导入服务 | M2/M4 |
| story-long-scan | 长篇题材与榜单研究 | 先手动资料分析，采集后置 | M3/M5 |
| story-short-scan | 短篇市场研究 | 短篇规则包，可选采集 | M4/M5 |
| story-long-analyze | 长篇拆书 | 只读结构化分析 | M1 |
| story-short-analyze | 短篇拆书 | 同一输出 schema 的短篇策略 | M1/M4 |
| story-long-write | 长篇细纲与写作法 | 方法注入合同/写作上下文，不授予直接落章权限 | M2-M3 |
| story-short-write | 短篇写作法 | 共用候选/提交链，使用精简合同 | M4 |
| story-review | 综合评审 | 只读审查适配器 | M1 |
| story-deslop | 去 AI 味检查 | 首先只读 linter，再提供候选补丁 | M1-M2 |
| story-cover | 封面方法 | 独立可选资产流程，检查授权与费用 | 延后 |
| browser-cdp | 浏览器资料采集 | 高权限工具，默认不启用 | M5 审批后 |

### 2.1 references 资源整理

资料分布在 `skills/*/references/`，不把所有文件扁平复制到单一目录。处理步骤：清点来源 -> 计算哈希 -> 去重内容但保留原路径映射 -> 检查相对链接 -> 标记适用题材/阶段 -> 选择最小生产集合。

289 个路径条目包含分发副本，不能当作独立理论数量写入产品宣传。`demo/` 中的拆书样例用于验证方法与引用结构，不作为用户作品正文生成素材默认发送。

宿主加载器拒绝符号链接资源，因此不能直接把上游 `.agents/skills` 的符号链接作为正式技能包。复制或生成实体资源前保留许可证，并校验所有引用留在允许目录内。

### 2.2 去 AI 味适配

真实入口是 `skills/story-deslop/scripts/check-ai-patterns.js`，白名单在同目录 `style-whitelist.js`。脚本使用 CommonJS，宿主包为 ESM；未经处理不能直接按 ESM import 假定可用。

M1 可在隔离临时工作区用明确的 Node 子进程调用已固定哈希脚本，采用 executable + args，禁止 shell 字符串拼接。参数格式先核验上游 CLI/测试；支持的 `--check --json --fail-on=blocking|all` 不等于宿主已经有该接口。

适配输出为 Finding：规则 ID、原文范围、blocking/advisory 来源严重度、当前产品策略严重度、建议、脚本版本。白名单与规则配置纳入 policyHash。

初期风格规则默认 advisory；上游 blocking 不无条件等于产品不可豁免错误。经过人工样本校准后再选择 enforce 规则。纯风格偏好不能阻止作者以明确理由保留表达。

脚本只读，修复建议生成受版本约束的补丁。补丁采纳创建新候选并重新审核，不覆盖原稿。子进程失败/超时/非法 JSON 标记检查未完成，不能当作通过。

### 2.3 细纲门禁适配

学习 `guard-outline-before-prose.sh` 的方法，改为 Core 内可测试的 TS 验证器。Windows shell hook 不能成为唯一门禁，编辑器/CLI/daemon 都必须走同一合同验证。

门禁检查“文件存在 + 严格解析 + 有效批准版本 + 必填约束 + 与当前作品/章节匹配”，而不是只检查某个文件名存在。用户可以手写细纲，不必依赖模型补齐。

## 3. Webnovel Writer 方法映射

| 参考实现/资产 | 提取契约 | Novel Creation 对应 |
| --- | --- | --- |
| runtime_contract_builder.py | 主设定/卷纲形成章节约束 | ContractService，从宿主持久计划与依赖读取 |
| chapter_commit_schema.py | 提交状态、履约、事件 schema | Zod ChapterCommit 与 ReviewReport |
| chapter_commit_service.py | 阻断、遗漏节点、消歧、接受事件、待投影 | ReviewService + CommitService + ProjectionService |
| index_debt_mixin.py | 叙事承诺与兑现状态 | Promise 事件及 SQLite 派生查询 |
| data_modules/tests/ | 参考输入/输出、边界条件 | TypeScript fixtures 与差异测试 |
| templates/genres/ | 37 个题材模板 | 可选择的版本化题材策略 |
| references/taxonomy/genre-index.csv | 题材分类与索引 | 结构化读取，不手工字符串拆分 CSV |
| dashboard/ | 图谱/追踪交互参考 | 扩展宿主 Analytics，不嵌套另一后台 |

上游 `.story-system/MASTER_SETTING.json` 不作为宿主第二套主设定直接引入。字段通过 schema 映射到宿主已有状态；无法一一映射的字段要列出来源、默认值、缺失处理和证据要求。

Python 原实现先作为固定版本参考/测试 oracle，允许在隔离开发环境运行针对性测试，但不把根 requirements 的完整引擎和看板依赖安装进生产环境。

## 4. 追读力与叙事承诺

建议 Promise 模型包括 id、type、description、introducedAt、expectedWindow（可空）、status、importance、evidence、lastAdvancedAt、resolvedAt、policyVersion。

状态可为 introduced/advanced/fulfilled/deferred/abandoned；每次变更是有正文证据的事件。延期、放弃应保留作者确认与原因；不能从索引里直接删除以改善评分。

展示：本章新承诺、推进的承诺、兑现点、长期无推进的事项、可能的证据冲突。优先用真实引用和时间轴表达，之后再建立按题材校准的统计指标。

约束：

- 不设“超过 N 章未兑现就硬阻断”的通用规则；只在明确合同要求下阻断。
- 不把 54 节点之类模板视为所有题材的统一算法。
- 模型判断的爽点、情绪和期待值显示为分析建议，不宣称是真实读者留存率。
- 从噪声材料推断出的承诺保持待确认，不能直接写入正式状态。
- 模型/模板版本变化时保留历史评估版本，不让旧曲线静默变形。

## 5. 适配器清单与版本

正式适配器建议具备以下 manifest 信息，示例路径为拟建位置，不表示文件已经存在：

```json
{
  "schemaVersion": 1,
  "id": "novel-creation.oh-story.deslop",
  "version": "0.1.0",
  "source": {
    "repository": "https://github.com/zenstory-ai/oh-story-claudecode.git",
    "commit": "907cde183368076a3bf97aa64f27d24c22504510",
    "path": "skills/story-deslop"
  },
  "license": "MIT",
  "capabilities": ["read_candidate", "emit_findings"],
  "network": false,
  "writesCanonicalData": false
}
```

还需实际记录生产资源哈希、entrypoint、schema、超时、输入/输出上限、所需工具和已验证宿主版本。上述 manifest 是治理配置，不是可执行权限隔离本身；执行器必须强制限制。

现有 Core 有 15 个内置技能。适配器注册需与现有技能 ID 冲突检查，明确 override 规则，不能因复制同名文件而悄悄覆盖宿主写作策略。

## 6. 上下文组装

| 优先层 | 内容 | 处理原则 |
| --- | --- | --- |
| P0 | 作者硬指令、批准合同、当前任务、工具边界 | 受保护，不静默截断 |
| P1 | 当前章节/候选、必要角色与世界事实 | 按任务完整性需要选择；不足则停止并说明 |
| P2 | 相邻章节摘要、相关承诺、具体证据 | 检索后按相关性、时间有效性去重 |
| P3 | 选定题材/风格方法片段 | 限量引用，标注来源/版本 |
| P4 | 可选研究材料和历史分析 | 预算不足时先排除，记录排除原因 |

状态卡序列化后限制为 **12288 UTF-8 bytes**，不是 12288 字符或 token。长列表按稳定优先级取前若干并附完整资源引用与 omittedCount；状态卡不是唯一事实来源。

总上下文按当前模型 token 限额计算，预留输出预算和安全余量。字节限制只约束状态卡，不能替代整体 token 预算。采用可靠 tokenizer 或明确标注估算误差；中文、emoji、JSON 转义分别测试。

若受保护层超预算，采用分阶段审核/缩小任务或要求作者调整，不裁掉硬约束后继续生成。每个任务保存 context manifest：输入来源、哈希、入选片段、排除原因、token 估计/真实用量，不必默认保存完整敏感提示。

## 7. 提示与工具隔离

第三方 SKILL.md、小说文本、网页和资料都不是高优先级指令。宿主只装载经过选择的方法内容；其中的安装、读密钥、执行命令、浏览器登录指示不自动执行。

工具权限按任务声明：拆书可读所选资料并写分析产物；审核可读固定候选并写报告；修订可写新候选；只有 CommitService 可写正式状态。网络、文件系统外部读取和 shell 默认禁用，单次授权不扩大后续任务权限。

## 8. 许可与分发

主宿主为 AGPL-3.0-only、Oh Story 为 MIT、Webnovel Writer 的 LICENSE 为 GPL v3。必须保留原许可证及版权声明，逐项记录复制/修改/参考内容。转换语言或通过子进程调用并不自动消除许可证义务。

发布前产出第三方清单、来源 SHA、修改摘要、许可证副本及适用的对应源码获取方式。网络服务、二进制分发、源码分发和仅本地试验分别审查；AGPL 的网络交互义务不能遗漏。最终合规结论需由项目负责人确认，必要时寻求法律审查。

写作理论、示例书稿、封面和爬取材料可能有与代码不同的版权。MIT/GPL 代码许可证不自动授予所有第三方小说内容的再分发权。

## 9. 接入验证步骤

1. 固定本地 SHA，参考库保持干净，只读盘点方法和依赖。
2. 为 3 个初始能力建立 golden fixtures：长篇拆书、综合审核、deslop。
3. 在宿主现有 Harness 中加入只读适配，验证结构化输出、超时、无越界写入和上下文预算。
4. 选择 2-3 个题材进行人工盲评，记录误报和遗漏，再确定 enforce 规则。
5. 在候选流程稳定后加入合同和受治理提交，所有正式状态经单一服务。
6. 定期比较上游变更，但不自动拉取更新到生产；每次升级重新校验哈希、fixture、许可和失效策略。

若适配结果与上游不同，记录“有意简化”或“实现缺陷”，不能为了通过对比测试强行继承不适用于宿主的状态路径。
