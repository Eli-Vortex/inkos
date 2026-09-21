# Novel Creation API 与异步任务合同

文档版本：5.0 | 状态：拟新增 API，当前不可当作已实现接口调用

## 1. 范围与版本

新增路由前缀为 `/api/v1/fusion`，仍挂载在现有 Hono 服务并复用宿主项目根目录、会话、错误处理和模型配置。旧路由保留兼容，但对已迁移作品的旧写路由必须转发统一命令或明确拒绝。

文中 JSON 是拟议 wire format 示例，ID 仅用于说明，不对应真实书稿。实现时用同一组 Zod schema 输出 TypeScript 类型、运行校验、OpenAPI 和契约测试，不能分别手写前后端互不一致的结构。

项目根目录由服务端启动固定，API 不接受任意 `projectRoot` 覆盖。bookId/chapterId/taskId 等为不透明 ID，不拼接成未经校验的磁盘路径。

## 2. 通用协议

| 项目 | 约定 |
| --- | --- |
| 编码 | UTF-8 JSON；正文字符串另有明确 UTF-8 保存规则 |
| 时间 | UTC ISO 8601 字符串 |
| ID | 服务端生成，不假定连续整数或可解析时间 |
| schemaVersion | 请求/持久资源中单独维护，不与产品版本混用 |
| GET | 不触发模型调用、迁移、修复、隐式写入或初始化 |
| 长任务 | 持久接受后返回 202，附 Location 与 taskId |
| 并发编辑 | GET 返回 ETag，更新必须 If-Match |
| 正式变更 | 需要 expectedHead、相关版本和显式 confirmation |
| 幂等 | 创建任务/提交/恢复等 POST 必须 Idempotency-Key |
| 分页 | cursor + limit，默认 50，上限 200；排序含稳定 ID |
| 限额 | 正文/材料/日志大小分别限制，超限返回 413，不静默截断 |
| 缓存 | 密钥、书稿、任务使用 private/no-store；不得进入共享缓存 |

建议请求关联头 `X-Request-Id`，服务端校验格式或重新生成。认证身份由服务端会话确定，不信任请求体自报 actor/role。

## 3. 路由清单

下表路径均相对于 `/api/v1/fusion`。

| 方法与路径 | 用途 | 条件 | 返回 |
| --- | --- | --- | --- |
| `GET /capabilities` | 集成版本、模式、已启用能力、限制 | 认证 | 200 |
| `GET /books/:bookId/status` | HEAD、迁移、恢复、投影状态 | 认证 | 200 |
| `GET /books/:bookId/plans/:chapterId` | 结构化细纲与批准版本 | 认证 | 200 + ETag |
| `PUT /books/:bookId/plans/:chapterId` | 保存细纲新版本 | Idempotency-Key + If-Match + expectedHead | 200 + ETag |
| `POST /books/:bookId/plans/:chapterId/approve` | 批准指定计划版本 | Idempotency-Key + If-Match + expectedHead | 200 |
| `POST /books/:bookId/contracts` | 从批准计划构造合同 | Idempotency-Key + expectedHead | 201 |
| `GET /books/:bookId/contracts/:contractId` | 合同与当前有效性 | 认证 | 200 |
| `POST /books/:bookId/chapters/:chapterId/drafts` | 创建手写/导入候选 | Idempotency-Key + expectedHead | 201 + ETag |
| `GET /books/:bookId/drafts/:draftId` | 当前候选/指定 revision | 认证 | 200 + ETag |
| `PUT /books/:bookId/drafts/:draftId` | 保存候选新 revision | If-Match | 200 + ETag |
| `POST /books/:bookId/generations` | 按合同生成候选 | Idempotency-Key | 202 |
| `POST /books/:bookId/revisions` | 局部修订成新候选 | Idempotency-Key + revision/hash | 202 |
| `POST /books/:bookId/reviews` | 审核明确候选版本 | Idempotency-Key | 202 |
| `GET /books/:bookId/reviews/:reviewId` | 审核报告和有效性 | 认证 | 200 |
| `POST /books/:bookId/commits` | 确认正式提交 | Idempotency-Key + expectedHead + confirmation | 202；完成重试 200 |
| `GET /books/:bookId/commits` | 提交链分页 | cursor/limit | 200 |
| `GET /books/:bookId/commits/:commitId` | 回执、证据、写集摘要 | 认证 | 200 |
| `POST /books/:bookId/restores` | 最新章节受控恢复 | Idempotency-Key + expectedHead + confirmation | 202 |
| `POST /research/analyses` | 已登记材料的只读拆书/评审 | Idempotency-Key + source refs | 202 |
| `GET /tasks/:taskId` | 持久任务快照 | 认证及所属资源权限 | 200 |
| `GET /tasks/:taskId/events` | SSE 进度 | Last-Event-ID 可选 | 200 text/event-stream |
| `POST /tasks/:taskId/cancel` | 请求取消 | Idempotency-Key | 202；已终态 200 |
| `POST /books/:bookId/projections/rebuild` | 重建可派生索引 | Idempotency-Key | 202 |
| `POST /books/:bookId/exports` | 指定 HEAD/候选范围导出 | Idempotency-Key | 202 |

素材上传、全局设置、迁移 dry-run/execute 可复用已有 API，补齐相同边界后再发布具体 DTO；不得因为未列路由就允许它们绕过统一写服务。M0 的 read-only diagnostics 应复用现有诊断入口，健康查询不触发模型。

设定和持久化计划变更生成 settings/plan 类型的 BookCommit，响应返回新的 head；它们不增加章节数量，但会使依赖旧基线的合同/审核失效。前端批准计划后必须使用返回的新 head 构造合同。`POST /commits` 专用于正文 ChapterCommit，`GET /commits` 返回带 kind 的统一提交历史，不能把所有提交都统计为新增章节。

## 4. 保存候选

请求示意：

```http
PUT /api/v1/fusion/books/book-demo/drafts/draft-demo
Content-Type: application/json
If-Match: "draft-demo:r3"
```

```json
{
  "schemaVersion": 1,
  "content": "第一段正文。\n\n第二段正文。\n",
  "clientMutationId": "edit-004"
}
```

成功回执示意（并返回 ETag `"draft-demo:r4"`）：

```json
{
  "draftId": "draft-demo",
  "revision": 4,
  "baseCommit": "commit-base",
  "contentHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "savedAt": "2026-09-15T04:00:00Z",
  "reviewValidity": "stale",
  "clientMutationId": "edit-004"
}
```

哈希示例为占位演示，不是示例正文的真实 SHA-256。实现必须计算实际字节哈希。响应只能在候选内容和 current 指针已可靠保存后发出；`412` 不得清空浏览器缓冲区。

## 5. 审核与提交

审核请求固定 contractId、draftId、draftRevision、contentHash、expectedHead 和 policyHash。运行完成后读取报告；报告内同时包含执行完成状态与业务 verdict，HTTP 200 不代表审核通过。

正式提交请求示例：

```http
POST /api/v1/fusion/books/book-demo/commits
Content-Type: application/json
Idempotency-Key: submit-book-demo-chapter-1-r4
```

```json
{
  "schemaVersion": 1,
  "chapterId": "chapter-1",
  "draftId": "draft-demo",
  "draftRevision": 4,
  "contractId": "contract-demo",
  "reviewId": "review-demo",
  "expectedHead": "commit-base",
  "contentHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "confirmation": {
    "confirmed": true,
    "waivers": []
  }
}
```

服务端从持久合同与报告读取依赖/策略哈希，不信任客户端声称“已通过”。若允许质量豁免，waivers 只能引用当前报告 findingId，包含 reason，并再次验证规则可豁免性。confirmation 是作者动作记录，不是用来跳过完整性检查的通行证。

202 回执示例：

```json
{
  "taskId": "task-demo",
  "operationId": "operation-demo",
  "status": "queued",
  "statusUrl": "/api/v1/fusion/tasks/task-demo"
}
```

终态成功结果包含 `commitId`、`head`、`draftRevision`、`committedAt`、`projectionStatus`。提交已发布且索引失败时，任务结果仍是成功提交，投影状态为 failed/lagging，附独立重建任务；不能鼓励作者重新提交正文。

## 6. 错误结构

```json
{
  "error": {
    "code": "STALE_BASE",
    "message": "作品已有新的正式提交，请重新核对候选稿。",
    "requestId": "request-demo",
    "retryable": false,
    "details": {
      "expectedHead": "commit-base",
      "currentHead": "commit-new",
      "draftId": "draft-demo"
    }
  }
}
```

| HTTP | code 示例 | 客户端动作 |
| --- | --- | --- |
| 400 | INVALID_REQUEST | 修正 schema/参数，不重试原输入 |
| 401/403 | UNAUTHENTICATED / FORBIDDEN | 恢复会话或拒绝，不泄露书稿 |
| 404 | RESOURCE_NOT_FOUND | 保留本地编辑，提示资源不可用 |
| 409 | STALE_BASE / BOOK_BUSY / IDEMPOTENCY_KEY_REUSED | 按原因重读/等待/修正，不全都自动重试 |
| 412 | REVISION_MISMATCH | 显示版本差异与合并 |
| 413 | CONTENT_TOO_LARGE | 分章/缩小范围，不服务端静默裁切 |
| 422 | PLAN_REQUIRED / PLAN_INVALID / REVIEW_BLOCKED / REVIEW_STALE / POLICY_MISMATCH | 展示可定位业务问题，重新准备输入 |
| 428 | PRECONDITION_REQUIRED | 补 ETag、expectedHead 或必需幂等键 |
| 429 | BUDGET_EXCEEDED / RATE_LIMITED | 读取限制与 Retry-After（若适用） |
| 500 | INTERNAL_ERROR | 显示 requestId，不返回堆栈或密钥 |
| 503 | RECOVERY_REQUIRED / DEPENDENCY_UNAVAILABLE | 先查诊断/任务，不重复落章 |

retryable 不代表任意新请求都安全；正式写请求重试必须复用同一幂等键和输入。未能确认 provider 是否执行的超时要标记 uncertain outcome，不能承诺没有费用。

## 7. 任务模型与状态转换

拟议任务状态：queued、running、waiting_author、cancel_requested、cancelled、succeeded、failed、interrupted。它们需要从现有 running/processing/completed/error 明确迁移和映射，不直接把旧 JSON 当成新 schema。

任务包含 taskId、schemaVersion、operationId、sessionId（可选）、bookId、kind、status、stage、progress（可空）、attempt、createdAt、updatedAt、result、error、usage、lastEventSequence。

正常路径：queued -> running -> succeeded/failed/waiting_author。waiting_author 不占模型并发槽；作者补充输入创建关联操作，不能暗中继续执行过期请求。进程重启后 running 根据日志变为 interrupted 或恢复到真实终态。

cancel_requested 是请求状态而非已取消；发布临界区不接受半途取消。任务终态重复取消返回当前结果，不能把 succeeded 改成 cancelled。

## 8. SSE

```text
id: task-demo:17
event: task.progress
data: {"taskId":"task-demo","sequence":17,"stage":"review","status":"running"}

id: task-demo:18
event: task.snapshot
data: {"taskId":"task-demo","sequence":18,"status":"waiting_author"}

```

事件序号在每个任务内单调递增，按 taskId+sequence 去重。支持 `Last-Event-ID`，超出事件保留窗口时返回 snapshot/reset 事件，引导重新获取快照。终态由持久快照决定，不依赖收到最后一条 SSE。

SSE 事件只传必要进度和脱敏信息；流式正文走限定大小的候选输出事件，不把密钥、完整模型请求和系统提示广播出去。事件持久保留有界，快照与正式结果按数据保留政策保存。

## 9. 证据定位与无障碍消费

证据引用包含 resourceId、revision/contentHash、start/end、unit、quote、ruleId；`unit` 明确为 UTF-16 code unit，end 为开区间，以兼容 JavaScript 编辑器。后端 Python 参考输出必须转换并测试中文、emoji 和换行，不能混用字节偏移或 Unicode code point。

页面定位先核对 hash，再校验 quote；内容变化后显示旧版本证据，不把旧范围套到新正文。接口提供文本说明和表格数据，不只返回颜色或图像。

## 10. 兼容与契约验收

- 旧 Studio 会话任务快照可读取，新 API 不额外创建无关的第二套任务权威。
- 所有写端点都有认证/来源检查、schema、路径边界、幂等或 ETag，并纳入跨入口治理测试。
- 契约测试覆盖 202 接受但未成功、重启后状态、重复事件、重复提交、失效审核、取消竞争、未知价格和投影落后。
- OpenAPI、Zod、客户端类型与测试 fixture 由实现共同维护。本 Markdown 描述设计，不能替代可执行 schema。
