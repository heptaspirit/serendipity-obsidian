# API 契约（插件 ↔ 引擎 REST /api/*）

> **唯一共享物**（D5）：引擎 `serendipity-engine/docs/api-contract.md` 是**唯一权威**；本文件是插件侧视图（摘要 + 同步规则）。
> 类型级镜像副本在 [`src/seren-api.d.ts`](../src/seren-api.d.ts)。**改任何 `/api/*` 必须同步两侧**（引擎契约 ←→ 本文件/副本）。
> base：`http://127.0.0.1:<port>`（serve 默认 8910，始终绑定 127.0.0.1）。

## 0. 鉴权

所有 `/api/*` 必须带 token，二选一：
- 请求头：`X-Seren-Token: <token>`
- 查询参数：`?token=<token>`

token 来源：`seren serve --token <t>` 指定（插件即用之——插件生成并持久化，`--token` 传给 spawn，自身调 API 无感）；或引擎自动生成并打印。iframe 页面由服务端注入 `__SEREN_TOKEN__`，页内 fetch 无感。`GET /`（页面本体）不需要 token。

## 1. 端点清单（v0.2.0）

插件当前使用的用 ★ 标出。完整字段与行为见引擎契约。

| 端点 | 说明 | 插件用 |
|---|---|---|
| `GET /api/stats` | 库规模（**configured**/nodes/edges/version/revision/is_pending/**digest_available**/dangling） | ★ 探测 + 版本比对 + 状态行 + digest 提醒 |
| `GET /api/hot?n=20` | 热门节点（图度降序） | ★ 初始热门气泡云 |
| `GET /api/roam` | 漫游（查询/随机；q/top/hops/lambda/theta/alpha/beta/rand_alpha/seed/export） | ★ 原生界面漫游 |
| `GET /api/relation?from=&to=` | 两节点关系（路径/PPR/证据） | ★ 当前节点操作栏「关系」Modal |
| `GET /api/config` | 可调参数白名单 + 源信息 | ★ 参数 Modal |
| `POST /api/refresh?limit=50` | 对账刷新（重解析+diff+改名迁移） | ★ 手动刷新 |
| `POST /api/rebuild?limit=50` | 全量重建索引（丢弃增量、重解析整库；返回结构同 refresh） | ★ 设置页「重建索引」按钮 |
| `POST /api/touch` | 反馈埋点（仅记录，不演化边权，red-line） | ★ 隐式 touch + 点卡片漫游 |
| `GET /api/similar?id=&k=` | 结构相似（Adamic-Adar，独立入口不并入 roam） | ★ 相似 Modal |
| `GET /api/node?id=` | 单节点详情（L0 摘要 + L1 邻居/backlinks） | ★ 当前节点操作栏「详情」Modal + 别名 |
| `GET /api/touch/stats?n=10` | 埋点只读统计（不反馈排序/hot，不进 MCP） | 完整界面 |
| `GET /api/communities?resolution=&seed=` | Leiden 社区发现（诊断层，只读） | 完整界面 |
| `GET /api/suggest-links?k=50` | 潜在关联待审清单（2-hop + AA/Jaccard/RA 聚合分，未落图） | 后续 AI 研判用 |
| `GET /api/touch/digest` | **最新 touch digest**（§3.7，v0.1.14）：窗口点击聚合 TopN + 来源 + 时间跨度。只读、被动 | ★ digest 查看（Modal + 导出笔记） |
| `POST /api/touch/digest/ack` | **标记 digest 已读**（§3.7，v0.1.14）：body `{"id":"<digest.id>"}` → `{"ok":true}`。只写 meta，不碰 touch 事件 | ★ 查看后 ack（清状态栏提醒） |
| `GET /api/vault` / `POST /api/vault` | **配库/换库**（v0.1.15 无库启动）：查询配置 / 配库换库（换图 + 闭包重建 + watch 重启） | **不用**（插件 spawn 即带 vault，默认打开库，不碰换库） |
| `GET /api/mcp/status` | **serve 内嵌 MCP 状态**（v0.2.0）：`{enabled, configured, tools, transport, endpoint}`（旧引擎 404） | ★ 主界面 + 设置页显示 MCP 启停 |
| `POST /api/mcp/enable` / `POST /api/mcp/disable` | **启用/停用 `/mcp`**（v0.2.0）：切 serve 内存态（重启回默认开）→ `{"ok":true,"enabled":bool}` | ★ 设置页启停按钮 |

## 2. 关键字段（插件依赖）

- `stats.version`：引擎版本，**带 `v` 前缀**（如 `v0.2.0`）。插件 `checkVersion` 会把 `v` 去掉再与 `REQUIRED_ENGINE`（最低引擎要求，`src/main.ts`）比较——低于才警告；**不**与插件自身版本比较。
- `stats.configured`（v0.1.15）：**bool**，是否已配库。插件 spawn 即带 vault → true；external 模式若引擎以无库启动 → false（数据端点会 `configured:false`，插件防御性显示「未配置库」）。插件**不碰换库**（不调 `/api/vault`）。
- `stats.digest_available`（v0.1.14）：**bool**，有新 digest 且未被 ack → true。插件据以显示「有新的 digest 可供查看」轻量状态提醒（被动、非弹窗）；ack 后转 false。
- `roam` 结果 `uri`/`id`：`id` = 节点 id（Obsidian 下为文件名去 `.md`），`uri` = `obsidian://` / `orca-note://`（跳转）。
- `touch`：`{"target":"<节点ID>","from":"<来源>"}` → `{"ok":true}`（失败也 `{"ok":false}`，不影响主流程）。
- `refresh` 计数器：`added/updated/deleted/renamed/unchanged` + `duration_ms` + `nodes`（`rebuild` 返回结构同 `refresh`）。
- `touch/digest` 响应：`{"digest": {id, generated_at, window_start, since, total, targets[], sources[]} | null, "available": bool}`；`targets[]` = `{id, title, count}`（**标题已由引擎解析**，幽灵 touch 已过滤），`sources[]` = `{id, count}`。无 digest → `digest: null`。
- `touch/digest/ack`：body `{"id":"<digest.id>"}` → `{"ok":true}`。
- `mcp/status` 响应（v0.2.0）：`{enabled: bool, configured: bool, tools: int, transport: "streamable-http", endpoint: "/mcp"}`。`enabled` 是 serve **内存态**（`/mcp` 启停开关）；`configured`=是否已配库（未配库时 MCP 工具给引导，无数据）。旧引擎（无 `/api/mcp`）→ 端点 404，插件视作「不可监控」。
- `node` 详情：`{id,title,type,aliases?,tags?,text,deg,neighbors[],backlinks[]}`。插件当前节点栏用 `aliases[0]` 把「人物_002」之类非人读标题换成别名展示。

## 3. 版本契约（独立版本号，2026-08 起）

- **插件与引擎独立版本号**：插件 `manifest.version` 是插件自身发布版本（当前 `0.2.0`），**不再要求等于引擎版本**（引擎是成熟内核 v0.2.0，插件是新客户端，节奏互不影响）。
- **引擎版本 = 兼容性下限**：插件声明 `REQUIRED_ENGINE`（当前 `0.2.0`，见 `src/main.ts`）。连接时 `GET /api/stats` 取 `version`（去 `v` 前缀）与 `REQUIRED_ENGINE` 用语义化比较（逐段数值，非字符串）。
- 低于 `REQUIRED_ENGINE` → `Notice` 提示「请升级引擎到 vX.Y.Z」；等于/高于 → 静默。**无版本协商协议**（运行时契约引用，非 git 关系）。
- 引擎升级（如 v0.1.15+）通常无需改插件；只有插件新增依赖更多引擎端点（或 API 断裂）时才提升 `REQUIRED_ENGINE`。
- **当前**：插件 `0.2.0`，`REQUIRED_ENGINE = 0.2.0`（v0.2.0 起插件依赖 `/api/mcp/*` 监控 MCP 启停；老引擎无该端点 → MCP 状态显示「旧引擎」）。

## 4. 同步规则（改 API 必做）

1. 引擎侧：改 `internal/web/*` 后更新 `serendipity-engine/docs/api-contract.md`。
2. 插件侧：同步本文件摘要 + `src/seren-api.d.ts` 类型。
3. 若改动涉及 `manifest`（minAppVersion / isDesktopOnly），同步 `manifest.json` 与 README `requires`。

## 5. 插件侧实现（v0.1.14 digest 消费，已落地）

> 引擎 v0.1.14 已实现 touch 行为信号子系统（引擎仓库 `backend-backlog.md` §3.7，commit 86946c7）。
> **引擎零写 vault**——digest 的 `serendipity-digest-*.md` 文件由**插件**在用户主动导出时写入。
> 插件侧实现对照（对应原 §5 清单）：

### 5.1 digest 类型 + api 方法
- `src/seren-api.d.ts`：`SerenStats.digest_available` + `SerenDigest` / `SerenDigestTarget` / `SerenTouchDigestResp`（已就位）。
- `src/api.ts`：`touchDigest()`（GET `/api/touch/digest`）、`touchDigestAck(id)`（POST `/api/touch/digest/ack`，body `{"id"}`）。

### 5.2 状态栏轻量提醒（被动，非弹窗）
- 复用 `/api/stats` 轮询（30s）：`digest_available === true` → 状态栏加「📋 有新的 digest」可点击项；点击 → 打开 digest 查看（5.3）。
- ack 时机：打开 digest 后即调 `touchDigestAck(digest.id)` → `digest_available` 转 false，清提醒。**ack 只清提醒，不碰引擎数据**（红线：touch 只读）。

### 5.3 digest 查看（Modal）
- 读 `GET /api/touch/digest` 渲染：`since`（窗口起点）、`total`（新增 touch）、`targets[]`（`title`+`count`，点击跳转笔记）、`sources[]`。
- 只做呈现，不重算（引擎已给带标题的 TopN）。

### 5.4 导出 digest 到 vault（引擎零写 vault 的兑现）
- 「导出为笔记」→ 插件生成 `serendipity-digest-<YYYYMMDD-HHMMSS>.md` 经 `app.vault.create()` 写入 vault 根目录（带时间戳防同日冲突，嵌套双链标题）。

### 5.5 digest 设置开关
- 设置页「digest 提醒」开关（默认开）；关 = 不轮询 `digest_available`、不显示提醒（清当前提醒）。

### 5.6 红线核对
- 插件只**读** digest + **写自己生成的 md 文件**；绝不给引擎写任何 vault 路径、绝不 POST 除 `ack` 外的写操作。

## 6. MCP 配置（AI 接入，v0.2.0 重写为 Streamable HTTP）

> v0.2.0 起 MCP 由引擎 `serve` **内嵌**（端点 `/mcp`，Web+REST+MCP 三合一），不再是独立的 `seren mcp` stdio 子进程——因此插件现在能**监控 `/mcp` 启停状态**（`/api/mcp/status`）并**一键启停**（`/api/mcp/enable` / `/api/mcp/disable`），而不再只是展示配置。

插件生成（见 `src/main.ts mcpConfigJson()`）：
- `type` = `"streamable-http"`，`url` = `http://127.0.0.1:<port>/mcp`。
- `headers` = `{"X-Seren-Token": "<token>"}`（同引擎前端一键配置；`/mcp` 仅 Host 校验、不强制 token，此为附加保险）。token 用插件持久化的 `settings.token`。
- 配置结构 = `mcpServers.seren`。粘贴到任意 MCP 客户端（Codex / DeepSeek Harness / Claude Code / Cursor 等）的 `mcpServers` 即可。**引擎须运行且 `/mcp` 已启用**才可接入。

监控/启停（v0.2.0）：
- `mcpStatus()`：GET `/api/mcp/status` → `{enabled, configured, tools, transport, endpoint}`；未连接/旧引擎 → `null`（视作不可监控）。
- `setMcpEnabled(on)`：POST `/api/mcp/enable|disable` → `{"ok":true,"enabled":bool}`。`enabled` 是 serve **内存态**，重启 serve 后回默认开。
- 插件侧：主界面状态条 chip 显示「🔌 MCP 已启用/已停用/未配库/旧引擎」（点击复制配置）；设置页 MCP 区显示状态 + 启停按钮 + 配置 pre + 复制按钮。

> 只读九件套：`graph.stats / roam / random / relation / node / similar / community / touch_digest / state`（v0.2.0 新增 `state`）。AI 会话不写 touch、不触发 refresh。
