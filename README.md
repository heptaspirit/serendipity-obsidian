# Serendipity Engine · Obsidian Plugin

> **中文** —— 给 Obsidian 装「奇遇记引擎」的插件：把引擎（seren）的**图谱漫游**能力带进 Obsidian。面板用原生 Obsidian 界面渲染，主题自然跟随、可自适应窄宽；点击卡片即从该节点继续漫游。
> **English** — An Obsidian plugin that brings the **graph-roam** engine (seren) into Obsidian. The panel is a native Obsidian UI — theme follows automatically and it adapts to narrow widths; clicking a card continues roaming from that node.

> 关联 / Related: [`serendipity-engine`](https://github.com/heptaspirit/serendipity-engine)（Go 内核 / Go core + Web UI + release binaries）· API 契约 / API contract（本仓库与引擎的**唯一共享物** / the **only shared artifact** between this repo and the engine — change it and sync both sides）

---

## 依赖 / Requires

**serendipity-engine ≥ v0.1.13**

引擎单独安装/运行，本插件是轻客户端、**不打包引擎**。
The engine is installed/run separately; this plugin is a light client and does **not** bundle the engine.

---

## 安装 / Install

1. 把本仓库拷入 Obsidian 插件文件夹：`<vault>/.obsidian/plugins/serendipity-engine/`
   Copy this repo into the Obsidian plugins folder: `<vault>/.obsidian/plugins/serendipity-engine/`
2. Obsidian 设置 → 第三方插件 → 启用「Serendipity Engine」；在插件设置里配置**引擎核心路径**（或把引擎二进制放在插件目录 / 加入 PATH）。
   Obsidian Settings → Community plugins → enable **Serendipity Engine**; in its settings set the **engine core path** (or drop the engine binary in the plugin folder / add it to PATH).

> 插件会自动探测本地引擎服务（`http://127.0.0.1:<port>`）。若未运行，面板会显示状态页——区分「未找到引擎可执行文件」（配置问题）与「引擎未启动」（点启动即可）。
> The plugin auto-detects the local engine service (`http://127.0.0.1:<port>`). If it isn't running, the panel shows a status page that distinguishes "engine executable not found" (a config issue) from "engine not running" (just click Start).

---

## 功能 / Features

- **原生面板 / Native panel** — 搜索 + 🎲 随机漫游、热门节点气泡云、结果卡片（点卡片=从该节点继续漫游；点「相似」=相似节点弹窗；点「打开」=跳回笔记）；参数与相似用 Obsidian 原生 Modal。
  Search + 🎲 random roam, a popular-nodes bubble cloud, and result cards (click a card to continue roaming from that node; "Similar" opens a similar-nodes modal; "Open" jumps back to the note); params and similar use native Obsidian modals.
- **引擎管理 / Engine control** — 工具栏可**停止引擎（⏹）**、刷新图、调参数；跨平台探测 `seren.exe` / `seren` 并补 unix 可执行位。
  Toolbar can **stop the engine (⏹)** , refresh the graph, and tune params; detects `seren.exe` / `seren` across platforms and sets the unix exec bit.
- **完整界面 / Full UI** — 命令「打开引擎完整界面」用系统浏览器打开引擎 Web UI（关系 / 相似 / 社区 / 导出 / 参数调优）。
  The command "Open engine full UI" opens the engine Web UI in a system browser (relation / similar / communities / export / params).
- **反馈埋点 / Implicit touch** — 切换活动笔记与点卡片时上报 `/api/touch`（仅记录，不影响排序）。
  Reports `/api/touch` on active-note change and card clicks (record-only, no ranking impact).
- **生命周期 / Lifecycle** — INSTALLED → CONFIGURED → RUNNING ⇄ CORE_STOPPED → DISABLED。

---

## 本地开发 / Development

```bash
npm install
npm run build   # 产出 main.js（社区发布需 main.js / manifest.json / styles.css）
```

- 源码在 / Source in `src/`：`main.ts`（入口 / entry）、`view.ts`（原生面板 / native panel）、`settings.ts`、`api.ts`（REST 客户端 / REST client）、`i18n.ts`（双语 / i18n）、`seren-api.d.ts`（契约副本 / contract copy）
- 构建用 **Rollup + @rollup/plugin-typescript**（`rollup.config.mjs`）→ 单文件 `main.js`；`styles.css` 是随仓库携带的源文件。
  Built with **Rollup + @rollup/plugin-typescript** (`rollup.config.mjs`) → single-file `main.js`; `styles.css` ships as source.
- 引擎二进制（seren）不打包：本地先用引擎仓库 `go build` 出的二进制（Windows 为 `seren.exe`，mac/linux 为 `seren`），或设置页填核心路径 / 走 PATH。
  The engine binary (seren) isn't bundled: locally use one built from the engine repo (`seren.exe` on Windows, `seren` on mac/linux), or set the core path / use PATH.

## 发布 / Release

- GitHub release：**tag 必须与 `manifest.json` 的 version 一致**，上传 `main.js` / `manifest.json` / `styles.css`。
  GitHub release: **tag must match the `manifest.json` version**; upload `main.js` / `manifest.json` / `styles.css`.
- 社区目录：经 [community.obsidian.md](https://github.com/obsidianmd/obsidian-releases) 提交。
  Community directory: submit via [community.obsidian.md](https://github.com/obsidianmd/obsidian-releases).

## 许可证 / License

MIT —— see [LICENSE](LICENSE).
