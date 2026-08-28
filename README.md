# Serendipity Engine · Obsidian 插件

<p align="center">
  <strong>🌐 语言 / Language：</strong>
  🇨🇳 <strong>简体中文</strong> ·
  <a href="README.en.md">🇺🇸 English</a>
</p>

> 图谱漫游：给 Obsidian 装「奇遇记引擎」——把引擎（seren）的漫游能力带进笔记库。
>
> 白盒、本地、纯原生。面板是 Obsidian 原生界面，主题自然跟随、可响应窄宽；点卡片即从该节点继续漫游。

[![版本](https://img.shields.io/badge/%E7%89%88%E6%9C%AC-v0.2.1-7aa2f7)](https://github.com/heptaspirit/serendipity-obsidian/tags) [![License](https://img.shields.io/badge/License-MIT-9cf)](LICENSE) [![Obsidian](https://img.shields.io/badge/Obsidian-%E6%8F%92%E4%BB%B6-7aa2f7)](https://obsidian.md/) [![MCP Server](https://img.shields.io/badge/MCP%20Server-AI%20%E5%8F%AF%E6%8E%A5%E5%85%A5-7aa2f7)](https://github.com/heptaspirit/serendipity-obsidian) [![简体中文](https://img.shields.io/badge/%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-README-7aa2f7)](README.md) [![English](https://img.shields.io/badge/English-README.en-7aa2f7)](README.en.md)

## 特性

- **原生面板**：搜索 + 🎲 随机漫游、热门节点气泡云、结果卡片（点卡片 = 从该节点继续漫游；点「相似」= 相似节点弹窗；点「打开」= 跳回笔记）；参数与相似用 Obsidian 原生 Modal
- **当前节点操作栏**：漫游锚定后对主锚点提供 详情/相似/关系 三键（参照引擎 Web UI），别名优先显示
- **引擎管理**：工具栏可停止引擎（⏹）、刷新图、调参数；跨平台探测 `seren.exe` / `seren` 并补 unix 可执行位
- **行为信号 digest**：引擎有新的 touch 聚合时，状态栏被动提醒（非弹窗）；点击查看，可一键导出为 `serendipity-digest-*.md` 笔记
- **MCP 接入**：设置页 + 主界面实时显示 serve 内嵌 `/mcp` 的启停状态（可启停），一键复制 `mcpServers`（Streamable HTTP）配置
- **完整界面**：命令「打开引擎完整界面」用浏览器打开引擎 Web UI（社区 / 导出 / 参数调优）

## 依赖

- **引擎** `serendipity-engine ≥ v0.2.0`（轻客户端，不打包引擎）
- **Obsidian** ≥ v1.5.0

> **关于版本号**：插件与引擎使用**独立版本号**——引擎是成熟内核（当前 v0.2.1），本插件是独立发布的新客户端（当前 **v0.2.1**）。引擎版本只作为**兼容性下限**：连接时插件比对 `stats.version`，仅当引擎**低于 v0.2.0**（缺 `/api/mcp/*` 等端点）才提示升级。

## 安装

1. 把本仓库拷入 Obsidian 插件文件夹：`<vault>/.obsidian/plugins/serendipity-engine/`
2. Obsidian 设置 → 第三方插件 → 启用「Serendipity Engine」
3. 在插件设置 → **引擎核心** → 点「**检查并下载**」，自动按当前平台（windows-amd64 / linux-amd64 / linux-arm64 / darwin-amd64 / darwin-arm64）从 GitHub Releases 下载引擎二进制到插件目录；也可手动放置引擎二进制（插件目录 / 设置核心路径 / 加入 PATH）

> 插件自动探测本地引擎服务（`http://127.0.0.1:<port>`）。未运行时面板显示状态页——区分「未找到引擎可执行文件」（配置问题）与「引擎未启动」（点启动即可）。

## 快速开始

启动引擎后，在面板搜索 / 🎲 随机漫游即可；面板已提供当前节点的 详情/相似/关系 三键；进阶（社区 / 导出 / 参数调优）经命令「打开引擎完整界面」进引擎 Web UI。

## MCP 接入（AI，v0.2.0 重写为 Streamable HTTP）

v0.2.0 起 MCP 由引擎 `serve` **内嵌**（端点 `/mcp`，Web+REST+MCP 三合一），不再需要独立的 `seren mcp` 进程。设置页（或面板点 MCP 状态）可实时查看 `/mcp` 启停状态并一键启停，还可**一键复制** `mcpServers` 配置，粘贴到任意 MCP 客户端（Codex / DeepSeek Harness / Claude Code / Cursor / 其他 agent）：

```json
{
  "mcpServers": {
    "seren": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:8910/mcp",
      "headers": { "X-Seren-Token": "<token>" }
    }
  }
}
```

只读工具：`graph.stats / roam / random / relation / node / similar / community / touch_digest / state`（不写 touch、不触发 refresh——AI 会话不能改动本地状态）。引擎须运行且 `/mcp` 已启用才可接入。

## 隐私与网络使用

- 插件与引擎的通信全部在本机 `127.0.0.1` 完成，vault 数据、笔记内容不出本机。
- **唯一的外网请求**：设置页「引擎核心 → 检查并下载」在**你主动点击并二次确认后**，从引擎的 GitHub Releases（https://github.com/heptaspirit/serendipity-engine/releases ）拉取当前平台的引擎二进制并安装到插件目录。仅下载 release 元数据与该二进制，**不发送任何 vault 数据、笔记内容或使用行为**。不点击该按钮，插件不做任何网络请求。

## 开发

```bash
npm install
npm run build   # 产出 main.js（发布需 main.js / manifest.json / styles.css）
```

AI agent 请先读 [`AGENTS.md`](AGENTS.md)（定位 / 仓库地图 / 开发红线）。

## 文档

| 文档 | 说明 |
|---|---|
| [`docs/api-contract.md`](docs/api-contract.md) | API 契约（插件 ↔ 引擎 REST）：鉴权、端点、版本策略。引擎侧唯一权威见引擎仓库；本地类型副本在 `src/seren-api.d.ts` |
| [`docs/architecture.md`](docs/architecture.md) | 插件整体架构：原生面板、生命周期、进程管理、扩展点 |
| [`docs/README.md`](docs/README.md) | 文档导航 |

## License

MIT License —— see [LICENSE](LICENSE).
