# 插件架构（Serendipity · Obsidian · 原生界面）

> 本文是插件的**维护者向架构文档**。读者应先读 [`AGENTS.md`](../AGENTS.md)（30 秒定位）与本文件的执行级描述。
> 引擎侧原理（为什么有这些端点/算法）见引擎仓库 `docs/architecture/` + `docs/design.md`。

## 1. 定位：原生轻界面（非 iframe 壳）

插件是引擎的**原生轻客户端**：面板用 Obsidian DOM 直接消费引擎 REST（`SerenApi`）渲染核心漫游；高级功能（关系/相似/社区/导出）保留在引擎完整 Web UI，经命令「打开引擎完整界面」用系统浏览器打开。

- 面板 = `ItemView` 原生 DOM：**主题天然跟随 Obsidian**、可自响应窄宽
- 引擎核心（Go）是唯一事实源；插件不复制引擎算法，也不做 TS/WASM 移植（D2）
- 插件发布不含引擎二进制（D4）；引擎零代码改动
- 交互对齐引擎 Web UI：**点卡片/标题 = 从该节点继续漫游**；「打开」= 跳回笔记；「相似」= 相似节点弹窗

## 2. 组件解剖

```
src/main.ts       入口：onload/onunload、生命周期状态、managed spawn、探测+等待健康、
                  版本比对、命令、状态栏、隐式 touch、二进制探测（跨平台）+ unix chmod
src/view.ts       ItemView 原生面板：工具栏(查询/🎲随机/↻刷新/⚙参数/↗完整界面/⏹停止)、
                  热门气泡云、结果卡片、参数 Modal、相似 Modal、状态三态
src/settings.ts   设置页 SerendipitySettingTab：模式/端口/核心路径/token/自启/隐式 touch
src/i18n.ts       插件侧轻量双语（zh/en）
src/api.ts        SerenApi REST 客户端（Obsidian requestUrl，本地 http 免 CORS），含健康探测
src/seren-api.d.ts API 契约类型副本（D5，唯一共享物）
rollup.config.mjs 构建：src/main.ts → 单文件 main.js（module.exports = 插件类）
styles.css        原生界面样式（工具栏/状态/卡片/气泡云/弹窗），用 Obsidian 变量
manifest.json     插件元数据（isDesktopOnly: true 等，均必填）
```

**依赖关系**：`main.ts` 持有面板/设置/api/契约/命令；`view.ts` 依赖插件实例（取端口、探活、`openInObsidian`、`ensureCore`、`stopEngine`、`api`）；`settings.ts` 依赖插件实例；`api.ts` 只依赖 `seren-api.d.ts` + `obsidian` 的 `requestUrl`。

## 3. 数据流与契约

### 3.1 启动（managed）

```
onload
 └─ loadSettings() → 读 data.json（默认 token 随机生成并持久化）
 └─ api = new SerenApi(port, token)
 └─ registerView / 命令 / 设置页 / 状态栏 / 事件（registerEvent 自动解绑）
 └─ onLayoutReady(() => void ensureCore(); void checkVersion())   ← 后台，绝不阻塞 onload
      ensureCore: api.ping() 通 → RUNNING；不通 + managed + (force||autoStart) → spawn → waitHealthy
      checkVersion: stats.version vs manifest.version（归一化去 v 前缀，D6）
```

### 3.2 spawn 契约

```powershell
seren serve <vaultPath> --port <port> --vault-name <vaultName> --token <pluginToken>
```

- `vaultPath` = Obsidian vault 根目录（`vault.adapter.getBasePath()`）
- `vaultName` = `vault.getName()`（可被设置覆盖），用于生成 `obsidian://` 跳转
- `token` = 插件生成并持久化的 32-hex；`--token` 传给引擎，插件自身用同一 token 调 `/api/*` 无感
- 端口默认 8910（`--port` 显式指定，spawn 与连接一致）

### 3.3 引擎二进制探测（跨平台）

- 候选路径（按优先级）：①设置「核心路径」→ ②插件目录(`manifest.dir` 解析成绝对) → ③从 vault 推导 `.obsidian/plugins/<id>`
- 每处**同时探测 `seren.exe` 和 `seren`**（Windows 优先 `.exe`，mac/linux 无后缀）——`manifest.dir` 可能是 vault 相对路径，需 `isAbsolute` 判断后 resolve
- PATH 兜底：Windows 用 `seren.exe`（CreateProcess 需带扩展名），unix 用 `seren`
- **unix 补可执行位**：spawn 前（非 win32 且找到文件路径）`chmod 0o755`，因为下载的二进制默认无 `+x` → 否则 `spawn` 报 `EACCES`
- `vaultPath`/`--vault-name`/`--token`/`--port` 全平台通用；引擎 Go 交叉编译出 win/mac/linux 三平台二进制

### 3.4 原生界面调用引擎 REST

- 一律走 `requestUrl`（Electron net.request，本地 http 无 CORS）带 `X-Seren-Token`
- 用于：健康探测 `/api/stats`、热门 `/api/hot`、漫游 `/api/roam`、相似 `/api/similar`、参数 `/api/config`、反馈 `/api/touch`、刷新 `/api/refresh`、版本比对
- 契约端点清单见 [`api-contract.md`](api-contract.md)

### 3.5 完整界面（高级功能入口）

- 命令「打开引擎完整界面」→ `shell.openExternal('http://127.0.0.1:<port>/')` 在系统浏览器打开引擎 Web UI；引擎注入 token（`__SEREN_TOKEN__`），免手填
- 浏览器内为非嵌入态（无 iframe 壳），关系/相似/社区/导出/参数调优在引擎 Web UI 完成
- **注意**：浏览器内点「打开 ↗」是 `obsidian://` 外链，浏览器通常无法唤起 Obsidian（跳回仅在原生面板/插件端可靠）；这是完整界面的已知限制

## 4. 生命周期与进程管理（M2 §六）

```
INSTALLED ──(获取内核+填路径端口)──▶ CONFIGURED ──(启动服务)──▶ RUNNING ⇄ CORE_STOPPED
RUNNING ──(停用内核)──▶ DISABLED ──(重新启用)──▶ RUNNING
```

- 实现为轻量 `status: LifecycleStatus` 字段 + 状态栏 + 设置页文本，**未做完整 FSM 类**（ponytail：初版够用）
- **启动非阻塞（重要）**：`onload` **绝不 `await` 引擎发现/启停**——引擎起不来时 `waitHealthy` 会阻塞，Obsidian 启动会 await 每个插件 `onload`。用 `onLayoutReady` 后台跑，结束再 `updateViews`。
- **启用与内核解耦**：`autoStart` **默认 `false`**——插件启用不依赖内核、不自动 spawn（自动拉起会引擎同步解析整库、拖慢 Obsidian）。内核未起时面板显示状态页，用户显式点「启动引擎」或命令才拉起。
- **进程红线**：`onunload` 必须 `proc.kill()`（Obsidian 官方明确「External connections（子进程）须在 unload 清理」）
- `proc.on('exit')` → `proc=null`，状态回 `CORE_STOPPED`，刷新面板；`proc.on('error')`（ENOENT/EACCES/端口占用）→ 提示具体原因 + `updateViews` 显示占位
- spawn 用 **`stdio:'ignore'`**（丢弃引擎 stdout 启动信息，防管道写满卡子进程）
- `waitHealthy` 首查 `proc===null` 立即返回失败（进程已退出不再空等）
- 事件/定时器/dom 一律 `registerEvent` / `registerDomEvent` / `this.register(...)` 自动解绑

## 5. 构建与结构

- **Rollup + @rollup/plugin-typescript**（`rollup.config.mjs`）：`src/main.ts` → 单文件 `main.js`，`exports:'default'` → `module.exports = 插件类`
- 外部依赖（`obsidian`/`electron`/node 内建）全 external，运行时由 Obsidian 提供
- **为何用 Rollup**：受限执行环境禁 esbuild 的常驻 service 子进程走 stdio 管道（`EPERM`）；Rollup 纯 JS、进程内编译。普通机器用 esbuild 亦可（勿随意替换回 esbuild 破坏兼容性）
- 发布三件套：`main.js` / `manifest.json` / `styles.css`（`main.js`、`node_modules/`、`seren.exe` 均 gitignored；`styles.css` 是随仓库携带的源文件）

## 6. 扩展点

| 想加 | 落点 |
|---|---|
| 漫游历史/上一步回溯 | 原生 view 维护查询栈（对齐引擎 history 行为） |
| 关系/统计/导出入口 | 原生 view 加按钮 → 新增 Modal（调 `/api/relation`、`/api/touch/stats`、导出 txt） |
| 下载核心按钮（v1.x） | 设置页 + 引擎 GitHub release 取 asset 落盘（`fs`），启动仍靠用户 |
| 显式刷新联动 | `vault.on('modify')` 节流 → `api.refresh()`（引擎已有自动 watch，可仅作补充） |
| AI 协作（Flow 1 建议链接研判） | 插件侧 AI 模块 + 引擎 `/api/suggest-links`/`POST /api/edges`（见引擎 plugin-ai-cooperation） |
| 虎鲸 Orca | 独立仓库 `serendipity-orca`（M2-2），复用契约，external 模式 |
