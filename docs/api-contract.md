# API 契约（插件 ↔ 引擎 REST /api/*）

> **唯一共享物**（D5）：引擎 `serendipity-engine/docs/api-contract.md` 是**唯一权威**；本文件是插件侧视图（摘要 + 同步规则）。
> 类型级镜像副本在 [`src/seren-api.d.ts`](../src/seren-api.d.ts)。**改任何 `/api/*` 必须同步两侧**（引擎契约 ←→ 本文件/副本）。
> base：`http://127.0.0.1:<port>`（serve 默认 8910，始终绑定 127.0.0.1）。

## 0. 鉴权

所有 `/api/*` 必须带 token，二选一：
- 请求头：`X-Seren-Token: <token>`
- 查询参数：`?token=<token>`

token 来源：`seren serve --token <t>` 指定（插件即用之——插件生成并持久化，`--token` 传给 spawn，自身调 API 无感）；或引擎自动生成并打印。iframe 页面由服务端注入 `__SEREN_TOKEN__`，页内 fetch 无感。`GET /`（页面本体）不需要 token。

## 1. 端点清单（v0.1.14）

插件当前使用的用 ★ 标出。完整字段与行为见引擎契约。

| 端点 | 说明 | 插件用 |
|---|---|---|
| `GET /api/stats` | 库规模（nodes/edges/version/revision/is_pending/**digest_available**/dangling） | ★ 探测 + 版本比对 + 状态行 + digest 提醒 |
| `GET /api/hot?n=20` | 热门节点（图度降序） | ★ 初始热门气泡云 |
| `GET /api/roam` | 漫游（查询/随机；q/top/hops/lambda/theta/alpha/beta/rand_alpha/seed/export） | ★ 原生界面漫游 |
| `GET /api/relation?from=&to=` | 两节点关系（路径/PPR/证据） | 完整界面 |
| `GET /api/config` | 可调参数白名单 + 源信息 | ★ 参数 Modal |
| `POST /api/refresh?limit=50` | 对账刷新（重解析+diff+改名迁移） | ★ 手动刷新 |
| `POST /api/touch` | 反馈埋点（仅记录，不演化边权，red-line） | ★ 隐式 touch + 点卡片漫游 |
| `GET /api/similar?id=&k=` | 结构相似（Adamic-Adar，独立入口不并入 roam） | ★ 相似 Modal |
| `GET /api/node?id=` | 单节点详情（L0 摘要 + L1 邻居/backlinks） | 完整界面 |
| `GET /api/touch/stats?n=10` | 埋点只读统计（不反馈排序/hot，不进 MCP） | 完整界面 |
| `GET /api/communities?resolution=&seed=` | Leiden 社区发现（诊断层，只读） | 完整界面 |
| `GET /api/suggest-links?k=50` | 潜在关联待审清单（2-hop + AA/Jaccard/RA + Borda，未落图） | 后续 AI 研判用 |
| `GET /api/touch/digest` | **最新 touch digest**（§3.7，v0.1.14）：窗口点击聚合 TopN + 来源 + 时间跨度。只读、被动 | ★ digest 查看（Modal + 导出笔记） |
| `POST /api/touch/digest/ack` | **标记 digest 已读**（§3.7，v0.1.14）：body `{"id":"<digest.id>"}` → `{"ok":true}`。只写 meta，不碰 touch 事件 | ★ 查看后 ack（清状态栏提醒） |

## 2. 关键字段（插件依赖）

- `stats.version`：引擎版本，**带 `v` 前缀**（如 `v0.1.14`）。插件 `checkVersion` 会把 `v` 去掉再与 `REQUIRED_ENGINE`（最低引擎要求，`src/main.ts`）比较——低于才警告；**不**与插件自身版本比较。
- `stats.digest_available`（v0.1.14）：**bool**，有新 digest 且未被 ack → true。插件据以显示「有新的 digest 可供查看」轻量状态提醒（被动、非弹窗）；ack 后转 false。
- `roam` 结果 `uri`/`id`：`id` = 节点 id（Obsidian 下为文件名去 `.md`），`uri` = `obsidian://` / `orca-note://`（跳转）。
- `touch`：`{"target":"<节点ID>","from":"<来源>"}` → `{"ok":true}`（失败也 `{"ok":false}`，不影响主流程）。
- `refresh` 计数器：`added/updated/deleted/renamed/unchanged` + `duration_ms` + `nodes`。
- `touch/digest` 响应：`{"digest": {id, generated_at, window_start, since, total, targets[], sources[]} | null, "available": bool}`；`targets[]` = `{id, title, count}`（**标题已由引擎解析**，幽灵 touch 已过滤），`sources[]` = `{id, count}`。无 digest → `digest: null`。
- `touch/digest/ack`：body `{"id":"<digest.id>"}` → `{"ok":true}`。

## 3. 版本契约（独立版本号，2026-08 起）

- **插件与引擎独立版本号**：插件 `manifest.version` 是插件自身发布版本（当前 `0.1.0`），**不再要求等于引擎版本**（引擎是成熟内核 v0.1.14，插件是新客户端，节奏互不影响）。
- **引擎版本 = 兼容性下限**：插件声明 `REQUIRED_ENGINE`（当前 `0.1.14`，见 `src/main.ts`）。连接时 `GET /api/stats` 取 `version`（去 `v` 前缀）与 `REQUIRED_ENGINE` 用语义化比较（逐段数值，非字符串）。
- 低于 `REQUIRED_ENGINE` → `Notice` 提示「请升级引擎到 vX.Y.Z」；等于/高于 → 静默。**无版本协商协议**（运行时契约引用，非 git 关系）。
- 引擎升级（如 v0.1.15+）通常无需改插件；只有插件新增依赖更多引擎端点（或 API 断裂）时才提升 `REQUIRED_ENGINE`。
- **当前**：插件 `0.1.0`，`REQUIRED_ENGINE = 0.1.14`。

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

## 6. MCP 配置（AI 接入，v0.1.14+）

> MCP 是引擎的**独立入口** `seren mcp`（stdio 子进程，只读工具），不是 `serve` 的一部分——插件/前端只能**展示配置供复制**，无法"开关"它（入口即开关）。插件侧提供一键复制。

插件生成（见 `src/api.ts` 调用方 + `src/main.ts mcpConfigJson()`）：
- `command` = 引擎二进制路径（`coreSearchInfo().path`，找不到回退 `seren`）。
- `args` = `["mcp", "<vault>"]`——**只用 `<vault>`（不传 --db）**：MCP 从源重解析，避免在插件侧复刻引擎 `store.DBPath` 的 sha256 路径（跨平台哈希漂移风险）。功能等价（源=权威）。
- 配置结构 = `mcpServers.seren`。粘贴到任意 MCP 客户端（Codex / DeepSeek Harness / Claude Code / Cursor 等）的 `mcpServers` 即可。
- 状态：`mcpReady() = (status === "RUNNING")`——引擎运行中才算就绪；主界面状态条显示「🔌 MCP 就绪 · 点击复制」，设置页显示状态 + 配置 pre + 复制按钮。
