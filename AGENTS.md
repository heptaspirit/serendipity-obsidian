---
title: "AGENTS.md — Serendipity Obsidian 插件 AI 开发引导"
summary: "给 AI agent / 后续开发者的快速上手：30 秒定位、常用命令、仓库地图、架构与契约、开发约定与红线。索引 + 指令，细节去引用的文档读。"
owner: heptaspirit
status: active
date: 2026-08-25
---

# AGENTS.md — 插件开发引导

> 本仓库是 **Serendipity Engine 的 Obsidian 插件（薄壳）**——把引擎自服务的 Web UI 嵌进 Obsidian 面板。
> AI agent / 后续维护者先读本文件（30 秒定位 → 命令 → 地图 → 契约 → 红线），细节一律去引用的文档读，避免双份维护漂移。

## 这个项目是什么（30 秒）

**Serendipity Engine（引擎，Go 单二进制）** 给笔记双链装「激活引擎」，从库里取回可解释的相关节点簇。**本仓库是它的 Obsidian 薄壳插件（D1）**：引擎零代码改动，插件只做「发现引擎 → iframe → 跳回/刷新补丁」。

- 形态 = **面板原生界面**：ItemView 用 Obsidian DOM 直接调引擎 REST（SerenApi）渲染核心漫游，主题天然跟随、可响应窄宽；高级功能（关系/相似/社区/导出）经命令「打开引擎完整界面」进引擎 Web UI（非 iframe 壳，是 API 客户端）
- **managed 模式**（Obsidian 原生能力）：插件 spawn 本地 seren 进程，随宿主启停；`onunload` 必须杀子进程（否则留孤儿）
- **唯一共享物 = API 契约**（D5）：`src/seren-api.d.ts` ↔ 引擎 `docs/api-contract.md`，改 API 必同步两侧
- 移动端不做（`isDesktopOnly: true`）；引擎核心不打包（D4）

它不是：TS/WASM 移植、移动端支持、引擎的替代实现——引擎核心（Go）是唯一事实源。

## 常用命令

```bash
npm install          # 装 devDeps（Obsidian/rollup/typescript…）
npm run build         # rollup -c → 产出单文件 main.js
npm run dev           # rollup -c --watch
```

> **构建环境备注**：仓库用 **Rollup + @rollup/plugin-typescript**（`rollup.config.mjs`），
> 非 Obsidian 官方的 esbuild。原因是受限执行环境（DSH 沙箱）禁止 esbuild 以常驻
> service 进程走 stdio 管道（会 `EPERM`）；Rollup 纯 JS、进程内编译，环境通用。
> 在普通机器上用 esbuild 亦可，但请勿随意替换回 esbuild 以免破坏此兼容性。

本地联调（需引擎二进制，测试用 `seren.exe` 在根目录，gitignored）：

```powershell
# 起引擎（指向测试 vault；协议见 docs/api-contract.md）
.\seren.exe serve "<vault>" --port 8910 --vault-name "<库名>" --token <32hex>
```

## 仓库地图

| 路径 | 职责 |
|---|---|
| `manifest.json` | 插件元数据（id/name/author/version/minAppVersion/description/isDesktopOnly，**均必填**）。`id=serendipity-engine`；`version` 是**插件自身版本**（独立于引擎，当前 `0.1.0`）。引擎兼容性下限由 `main.ts` 的 `REQUIRED_ENGINE` 声明 |
| `src/main.ts` | 插件入口：onload/onunload、生命周期状态、managed spawn、探测+等待健康、版本比对、命令、状态栏、隐式 touch |
| `src/view.ts` | ItemView 面板（**原生界面**）：查询漫游/随机漫步/结果卡片（点击跳回笔记、↺ 继续漫游）+ 三态（未找到/未启动/运行中）。原生 Obsidian DOM → 主题自动跟随、可响应窄宽。高级功能经命令「打开引擎完整界面」进引擎 Web UI |
| `src/settings.ts` | 设置页：模式(managed/external)、端口、核心路径、token 重生成、自启、隐式 touch |
| `src/api.ts` | `SerenApi` REST 客户端（Obsidian `requestUrl`，本地 http 免 CORS），含健康探测 |
| `src/seren-api.d.ts` | **API 契约类型副本**（D5，唯一共享物）。改 API 必须同步引擎 `docs/api-contract.md` |
| `rollup.config.mjs` | 构建（输入 src/main.ts → 单文件 main.js，`module.exports = 插件类`） |
| `styles.css` | 插件样式（iframe 容器 / 占位 / 状态栏）。随仓库与发布携带 |
| `README.md` / `README.en.md` | 用户侧说明（中英分离，格式对齐主引擎：语法 pill + 徽章 + 分节）：requires / 安装 / 构建 / 发布 / MCP |
| `LICENSE` | MIT License |

## 文档地图（改什么，先读什么）

| 任务 | 先读 |
|---|---|
| 了解插件整体/架构 | [`docs/architecture.md`](docs/architecture.md) |
| 改了 API / 契约 | [`docs/api-contract.md`](docs/api-contract.md) + 引擎 `docs/api-contract.md` |
| 引擎内核机制（为什么有这些端点） | 引擎仓库 `README.md` + `docs/design.md` + `docs/architecture/` |
| 插件开发计划（M2） | 引擎 `docs/plugin-dev-plan.md`（生命周期四态机 / 分发 / 插件×AI 协作） |
| 引擎 Web UI 契约（embed/桥） | 引擎 `internal/web/static/index.html`（前端 P0）+ `docs/frontend.md` |

## 架构与契约（30 秒）

```
Obsidian(M0) ──spawn──▶ seren serve <vault> --port <p> --vault-name <n> --token <t>
    │  ItemView 原生面板（SerendipityView）
    ▼  SerenApi ──X-Seren-Token──▶ /api/*（stats/roam/touch/refresh…，见 api-contract.md）
    │  渲染：漫游查询/随机漫步/结果卡片（点卡片 openLinkText 跳回 / ↺ 继续漫游）
    ▼  命令「打开引擎完整界面」→ shell.openExternal 浏览器开引擎 Web UI（高级功能）
```

- **spawn 契约**：`seren serve <vault> --port <p> --vault-name <vault名> --token <插件token>`（token 由插件生成并持久化，`--token` 指定以保证插件自身调 API 无感）
- **面板 = 原生界面**（非 iframe）：插件直接消费引擎 REST，用 Obsidian DOM 渲染 —— 主题自动跟随、可响应窄宽。核心覆盖：查询漫游 / 随机漫步 / 结果卡片（点击跳回笔记、↺ 继续漫游）；三态（未找到 / 未启动 / 运行中）。
- **高级功能**：关系 / 相似 / 社区 / 导出 / 参数调优仍在引擎 Web UI；命令「打开引擎完整界面」用 `shell.openExternal` 在系统浏览器打开 `http://127.0.0.1:<port>/`（引擎注入 token，免手填）。
- **行为信号 digest（v0.1.14 引擎 §3.7）**：状态栏被动提醒（`stats.digest_available` 轮询 30s，非弹窗）→ digest Modal（读 `/api/touch/digest`）→「导出为笔记」写 `serendipity-digest-*.md` 入 vault（**引擎零写 vault，导出是插件职责**）+ ack（`/api/touch/digest/ack` 清提醒）。
- **MCP 配置（AI 接入）**：`mcpConfigJson()` 生成 `mcpServers.seren`（`seren mcp <vault>`，不传 `--db`——避免复刻引擎 store 的 sha256 路径）供一键复制；设置页 + 主界面状态条显示就绪状态。MCP 是 `seren mcp` 独立 stdio 入口（只读工具），非 `serve` 一部分——只能展示配置供复制，不能开关。
- **跳回**：点结果卡片 → `workspace.openLinkText(uri 解码 file ?? id)` 就地跳回（原生，无 postMessage 桥）。

## 生命周期与进程管理（M2 §六）

```
INSTALLED ──(获取内核+填路径端口)──▶ CONFIGURED ──(启动服务)──▶ RUNNING ⇄ CORE_STOPPED
RUNNING ──(停用内核)──▶ DISABLED ──(重新启用)──▶ RUNNING
```

- **Obsidian = managed**：插件 spawn，`onunload` **必须** `proc.kill()`（孤儿进程红线，官方明确列出「External connections（子进程）须在 unload 清理」）
- **事务监听**：事件/定时器/dom 一律走 `registerEvent` / `registerDomEvent` / `this.register(...)` 自动解绑

## 开发约定（红线，违反需谨慎）

1. **UI 边界**：面板是**原生轻界面**（核心漫游/跳回），直接消费引擎 REST；**不复制引擎完整 Web UI 的算法与富功能**（关系/相似/社区/导出仍在引擎 Web UI，经命令打开）。引擎零代码改动。
2. **不打包引擎**（D4）：插件发布不含 seren 二进制；README 写 `requires serendipity-engine ≥ vX.Y`。
3. **契约同步**（D5/D6）：改任何 `/api/*` → 必须同步引擎 `docs/api-contract.md` + 本仓库 `src/seren-api.d.ts`。插件版本号独立（`manifest.version`）；引擎版本作为兼容性下限，由 `main.ts` 的 `REQUIRED_ENGINE` 声明，连接时比对（≥ 才通过）。
4. **安全红线**：引擎只读本地凭据类数据绝不读取；本插件只连 `127.0.0.1`；数据不出本机；二次确认弹窗（隐私披露）在启用前必展示。
5. **克制设计**：touch 埋点只记录不演化（绝不反馈排序/hot）；监听节流合并；不加中间态恢复逻辑。
6. **启动非阻塞**：`onload` 绝不 `await` 引擎发现/启停（会阻塞 Obsidian 启动），一律 `onLayoutReady` 后台执行、结束再 `updateViews`。
7. **质量**：改代码后 `npm run build` 通过；改契约 → 两侧同步；改文档 → `docs/README.md` 导航仍准确。

## 明确不做（防跑偏）

- 移动端 / TS·WASM 移植（`isDesktopOnly: true`，欢迎 fork）
- 打包引擎二进制、SaaS / 云模式
- 引擎侧任何改动（薄壳边界）；AI 能力在插件层，引擎零 AI 依赖

## 完成任务前检查

- [ ] `npm run build` 通过（产出单文件 main.js）
- [ ] 改了契约 → `src/seren-api.d.ts` 与引擎 `docs/api-contract.md` 已同步
- [ ] onunload 记得杀 spawn 的子进程 / registerEvent 正确解绑
- [ ] 未破坏薄壳边界（未复制引擎 UI · 未打包引擎 · 未加网络出口）
