# Novel Creation Windows 部署、备份与运维手册

文档版本：5.0 | 状态：未来实施操作手册，本轮未执行以下安装/启动/初始化命令

## 1. 当前环境与基本原则

正式源码根目录是 `E:\Desktop\Github\novel`，全部正常命令从此目录发起。`E:\Desktop\Github\novel 平台` 不是本方案的源码/运行根目录。不要重新创建用户目录下的临时项目，也不要重复克隆宿主到 `.integration/source/inkos`。

当前已核验三库源码齐备、Node `v24.6.0`，主仓库声明 Node >=22、pnpm >=9，`.node-version`/`.nvmrc` 为 22。本轮未验证依赖安装和构建，检查时无 4567 监听，根下无正式 `inkos.json`。历史运行状态不作为本次部署成功证明。

主程序来源以根目录构建产物为准，优先显式调用本地 `packages/cli/dist/index.js`，避免全局安装的另一个 InkOS 版本误操作数据。

## 2. 目录与版本策略

| 路径 | 用途 | 政策 |
| --- | --- | --- |
| 根目录及 packages/ | 宿主源码与本地构建 | 跟随选定主仓库 SHA |
| other/ | 两个参考仓库 | 只读参考，不作为生产自动加载目录 |
| docs/ | 产品及实施规范 | Git 跟踪并人工确认提交 |
| 根 inkos.json、books/、.inkos/ | 未来正式运行项目 | 初始化前备份；不提交创作数据和密钥 |
| .integration/workspaces/pilot/ | 隔离试点运行数据 | 不与正式书籍共写 |
| .integration/backups/ | 本地阶段备份 | 不递归包含自身；另需异盘/离线副本 |
| .integration/releases/ | 发布工件与清单 | 只复制白名单工件，不复制整个根目录 |
| .integration/reports/ | 构建、测试、迁移和恢复报告 | 脱敏；长期证据另行纳入发布归档 |

`.integration/` 和 `radar/` 当前不是本轮新增的忽略项；M0 创建运行产物前必须配置并用 `git check-ignore` 检查。`other/` 的 Git 管理方式需明确后再改，不能使用宽泛 staging 把独立仓库误提交为 gitlink。

## 3. M0 只读检查

以下 PowerShell 可用于开发开始时确认环境：

```powershell
Set-Location -LiteralPath 'E:\Desktop\Github\novel'
git status --short
git rev-parse HEAD
node --version
pnpm --version
Get-Content -LiteralPath '.\pnpm-workspace.yaml'
Test-Path -LiteralPath '.\inkos.json'
Get-NetTCPConnection -State Listen -LocalPort 4567 -ErrorAction SilentlyContinue
```

检查 `other/` 的 SHA 使用 `git -C <目录> rev-parse HEAD`，不要自动 fetch/pull。Node 推荐先按仓库 22.x 基线测试，再验证现有 24.6.0；不要在文档任务中替换系统 Node。若 pnpm 不可用，由实施者先安装/启用经团队选定的版本并记录，不能修改锁文件凑安装成功。

## 4. 安装与构建

前提：M0 已确认网络、许可证、依赖脚本和运行产物忽略规则，当前没有运行任务。以下会安装依赖并生成 dist，本轮未执行。

```powershell
Set-Location -LiteralPath 'E:\Desktop\Github\novel'
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
pnpm build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
pnpm typecheck
if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed.' }
pnpm test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
```

根 workspace 只包含 `packages/*`，不安装/运行 `other/` 下的 Python 看板和全部依赖。若 frozen lockfile 失败，记录 Node/pnpm/锁文件差异，单独评审修复，不直接删除锁文件。

Studio 的 `dev`/`dev:server` 包含 POSIX 环境变量赋值及后台语法，不直接当作 PowerShell 命令使用。优先验证构建产物；开发热更新启动器在 M0 单独实现为跨平台脚本。

## 5. 正式运行项目初始化

本机根目录目前没有正式配置。`test-project/inkos.json` 只作为样本，不复制它冒充已完成迁移。

现有 `inkos init --lang zh` 在当前目录创建配置和 books/radar，并可能覆盖 `.env`、`.nvmrc`、`.node-version` 等支持文件。因此源码与运行目录合一时优先使用已构建的 bootstrap API，指定不覆盖支持文件。执行前仍需检查并备份已有配置。

**仅在构建成功、确认根目录就是正式运行根、且不存在 inkos.json 时执行：**

```powershell
Set-Location -LiteralPath 'E:\Desktop\Github\novel'
if (Test-Path -LiteralPath '.\inkos.json') {
    throw 'Project already exists. Do not reinitialize it.'
}
if (-not (Test-Path -LiteralPath '.\packages\cli\dist\project-bootstrap.js')) {
    throw 'Build the local CLI first.'
}
node --input-type=module -e 'import { initializeProjectDirectory } from "./packages/cli/dist/project-bootstrap.js"; await initializeProjectDirectory(process.cwd(), { language: "zh", overwriteSupportFiles: false });'
if ($LASTEXITCODE -ne 0) { throw 'Initialization failed. Inspect partial output before retrying.' }
```

该 API 来自[project-bootstrap.ts](../packages/cli/src/project-bootstrap.ts)。它不是集成迁移器，初始化失败可能留下部分目录/配置，不能直接删除配置后反复尝试。全局模型配置可能来自用户 `.inkos`，试点必须显式隔离模型设置且不输出密钥。

隔离试点可从根目录执行本地 CLI 的 `init .integration/workspaces/pilot --lang zh`，但只能用于不存在的试点目录。后续 CLI 根目录来自 cwd，不能只设置 `INKOS_PROJECT_ROOT` 就假定改变成功；M0 应提供从根调用、内部显式设置子进程 cwd 的试点启动器，并测试不会写入正式目录。该启动器目前尚未存在。

## 6. 启动与端口

源码已核验的 Studio 构建入口为 `packages/studio/dist/api/index.js`，参数优先于 `INKOS_PROJECT_ROOT`，端口来自 `INKOS_STUDIO_PORT`，默认 4567。

**前置门禁：M0 必须让服务明确只绑定 loopback 并验证写接口保护。当前 `serve({ fetch, port })` 没有显式 hostname；访问 URL 写 localhost 并不能证明服务没有对外监听。** 不虚构一个尚未实现的 HOST 环境变量来绕过这项改造。

满足前置条件并初始化后，可前台验证：

```powershell
Set-Location -LiteralPath 'E:\Desktop\Github\novel'
$ProjectRoot = (Get-Location).Path
$Port = 4567
while (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    $Port++
    if ($Port -gt 4577) { throw 'No free port in 4567-4577.' }
}
$env:INKOS_PROJECT_ROOT = $ProjectRoot
$env:INKOS_STUDIO_PORT = [string]$Port
Write-Host "Novel Creation target URL: http://localhost:$Port"
node '.\packages\studio\dist\api\index.js' $ProjectRoot
```

若目标是试点，ProjectRoot 必须显式指定为已经初始化的试点绝对目录；命令仍从源码根发起。不得让正式和试点实例写同一 books 目录。

这是未来启动步骤，不代表当前 `http://localhost:4567` 可访问。选中其他端口时以实际输出 URL 为准，不结束未知占用进程。固化发行应预先构建前端；现有入口发现缺少前端产物会尝试自动构建，不适合作为不可变发布工件的正常行为。

## 7. 后台运行与健康检查

先完成前台验证，再通过正式启动器/Windows 任务计划运行。后续启动器应使用 `Start-Process -WindowStyle Hidden`，明确工作目录、参数数组、项目根、端口、日志路径和 PID 文件，不能靠隐藏一个未跟踪的 shell 当作服务管理。

启动器必须：检查实例锁与恢复状态；记录构建 SHA；验证 PID 对应可执行路径/命令行；失败返回非零；停止时先请求任务排空与正常退出。不得提供“按端口强杀任意进程”的通用停止脚本。

部署验收分层：

1. TCP：Get-NetTCPConnection 显示实际端口和 loopback 绑定。
2. HTTP：根页面可返回并能加载静态资源，不把 200 HTML 当作 API 健康。
3. 产品：浏览器标题/侧栏为 Novel Creation，控制台无启动错误。
4. 数据：实际 projectRoot 正确、测试候选只写入对应工作区。
5. 业务：无需付费模型即可手写候选、审核 fixture、提交、重启恢复、导出。
6. 模型：显式确认一次受预算限制的联通测试，记录结果及费用，不在健康轮询里调用模型。

新 `/api/v1/fusion/capabilities` 和 book status 仅在相应里程碑实现后用于检查，现在不能拿未实现路由当健康探针。

## 8. 一致备份

最简单可验证的首版方案是冷备份：暂停 daemon/Agent、排空任务、正常停止所有同项目进程、确认无写锁拥有者，完成事务恢复与 SQLite checkpoint/关闭后复制运行数据。

备份白名单至少覆盖：`inkos.json`、`.env`（若有且安全保存）、`books/`、`.inkos/`、`radar/`、`prompt/`，以及实际使用的 worlds/dramas/storyboards/translations。包括提交归档、候选、合同、审核、日志和数据库必要文件，不仅复制正文。

下例只做停止写入后的白名单复制和文件校验清单，**不负责自动停服务或获得一致性**：

```powershell
Set-Location -LiteralPath 'E:\Desktop\Github\novel'
$Root = (Get-Location).Path
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupBase = Join-Path $Root '.integration\backups'
$Backup = Join-Path $BackupBase "runtime-$Stamp"
if (Test-Path -LiteralPath $Backup) { throw 'Backup destination already exists.' }
New-Item -ItemType Directory -Path $Backup -Force | Out-Null
$Items = @('inkos.json', '.env', 'books', '.inkos', 'radar', 'prompt',
           'worlds', 'dramas', 'storyboards', 'translations')
foreach ($Item in $Items) {
    $Source = Join-Path $Root $Item
    if (Test-Path -LiteralPath $Source) {
        Copy-Item -LiteralPath $Source -Destination $Backup -Recurse -ErrorAction Stop
    }
}
$Manifest = Get-ChildItem -LiteralPath $Backup -File -Recurse | ForEach-Object {
    [pscustomobject]@{
        path = $_.FullName.Substring($Backup.Length + 1)
        length = $_.Length
        sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }
}
$Manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $Backup 'manifest.json') -Encoding utf8
Write-Host "Backup created: $Backup"
```

含密钥备份需限制 ACL、加密并放到受控存储；同盘备份只能防部分误删，不能防磁盘故障。先写临时备份、校验后标记完成的正式脚本在 M0 实现，上例的“created”不等于通过恢复演练。

不要从整个 novel 根目录递归复制到 `.integration/backups`，否则可能包含源码、other、node_modules 和备份自身。在线 SQLite 备份必须使用验证过的备份接口；运行中只复制 memory.db 可能漏掉 WAL。

## 9. 恢复、发布与回滚

恢复在新的隔离目录进行，核对 manifest、配置、HEAD、归档和正文，再重建投影并跑验收。不要直接用备份覆盖正在运行的正式书库；恢复时先禁用 daemon、网络工具与自动模型调用。

应用回滚与数据回滚分开：切回旧 dist 不代表旧程序能读取新的 schema。每次发布记录应用 SHA、Node/pnpm、适配器版本、数据迁移版本、备份位置和最低可回退版本。不可逆 schema 迁移必须保留升级前副本。

M2 最新章恢复走恢复提交，不删历史归档；M4 历史重放走隔离验证。外部手工改动正式 Markdown 后必须显示漂移并导入为新候选/受控变更，不能默默更新 DB 掩盖差异。

## 10. 文档防误删

本轮已为 12 个 Markdown 增加精确 `.gitignore` 例外。可检查：

```powershell
Set-Location -LiteralPath 'E:\Desktop\Github\novel'
git status --short
git check-ignore docs/README.md
git diff -- .gitignore
```

README 未被忽略时 `git check-ignore` 无输出并返回 1，这是预期，不是损坏。确认文档后可以只暂存 `.gitignore` 和本套 docs，检查 staged diff，再由用户决定提交；不要 `git add .`。本轮没有暂存、提交或推送，Git 可跟踪不等于已有提交备份。

误删后的恢复应先确认已提交版本和现有修改，优先导出历史文件对比；不要执行会覆盖用户改动的全仓库 reset/checkout。
