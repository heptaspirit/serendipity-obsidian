# API 契约（插件 ↔ 引擎 REST /api/*）

> **唯一共享物**（D5）：引擎 `serendipity-engine/docs/api-contract.md` 是**唯一权威**；本文件是插件侧视图（摘要 + 同步规则）。
> 类型级镜像副本在 [`src/seren-api.d.ts`](../src/seren-api.d.ts)。**改任何 `/api/*` 必须同步两侧**（引擎契约 ←→ 本文件/副本）。
> base：`http://127.0.0.1:<port>`（serve 默认 8910，始终绑定 127.0.0.1）。

## 0. 鉴权

所有 `/api/*` 必须带 token，二选一：
- 请求头：`X-Seren-Token: <token>`
- 查询参数：`?token=<token>`

token 来源：`seren serve --token <t>` 指定（插件即用之——插件生成并持久化，`--token` 传给 spawn，自身调 API 无感）；或引擎自动生成并打印。iframe 页面由服务端注入 `__SEREN_TOKEN__`，页内 fetch 无感。`GET /`（页面本体）不需要 token。

## 1. 端点清单（v0.1.13）

插件当前使用的用 ★ 标出。完整字段与行为见引擎契约。

| 端点 | 说明 | 插件用 |
|---|---|---|
| `GET /api/stats` | 库规模（nodes/edges/version/revision/is_pending/dangling） | ★ 探测 + 版本比对 + 状态行 |
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

## 2. 关键字段（插件依赖）

- `stats.version`：引擎版本，**带 `v` 前缀**（如 `v0.1.13`）。插件 `checkVersion` 会把 `v` 去掉再与 `manifest.version`（不带 `v`）比较。
- `roam` 结果 `uri`/`id`：`id` = 节点 id（Obsidian 下为文件名去 `.md`），`uri` = `obsidian://` / `orca-note://`（跳转）。
- `touch`：`{"target":"<节点ID>","from":"<来源>"}` → `{"ok":true}`（失败也 `{"ok":false}`，不影响主流程）。
- `refresh` 计数器：`added/updated/deleted/renamed/unchanged` + `duration_ms` + `nodes`。

## 3. 版本契约（D6）

- 插件连接时 `GET /api/stats` 比对 `version` 与 `manifest.version`（归一化去 `v`）。
- 不匹配 → `Notice` 提示「请升级引擎到 vX.Y.Z」。**无版本协商协议**（运行时契约引用，非 git 关系）。
- 发布前确保 `manifest.version` 与引擎版本一致。

## 4. 同步规则（改 API 必做）

1. 引擎侧：改 `internal/web/*` 后更新 `serendipity-engine/docs/api-contract.md`。
2. 插件侧：同步本文件摘要 + `src/seren-api.d.ts` 类型。
3. 若改动涉及 `manifest`（minAppVersion / isDesktopOnly），同步 `manifest.json` 与 README `requires`。
