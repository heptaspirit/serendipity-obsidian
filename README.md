# Serendipity Engine · Obsidian 插件

<p align="center">
  <strong>🌐 语言 / Language：</strong>
  🇨🇳 <strong>简体中文</strong> ·
  <a href="README.en.md">🇺🇸 English</a>
</p>

> 图谱漫游：给 Obsidian 装「奇遇记引擎」——把引擎（seren）的漫游能力带进笔记库。
>
> 白盒、本地、纯原生。面板是 Obsidian 原生界面，主题自然跟随、可响应窄宽；点卡片即从该节点继续漫游。

[![版本](https://img.shields.io/badge/%E7%89%88%E6%9C%AC-v0.1.0-7aa2f7)](https://github.com/heptaspirit/serendipity-obsidian/tags) [![License](https://img.shields.io/badge/License-MIT-9cf)](LICENSE) [![Obsidian](https://img.shields.io/badge/Obsidian-%E6%8F%92%E4%BB%B6-7aa2f7)](https://obsidian.md/) [![MCP Server](https://img.shields.io/badge/MCP%20Server-AI%20%E5%8F%AF%E6%8E%A5%E5%85%A5-7aa2f7)](https://github.com/heptaspirit/serendipity-obsidian) [![简体中文](https://img.shields.io/badge/%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-README-7aa2f7)](README.md) [![English](https://img.shields.io/badge/English-README.en-7aa2f7)](README.en.md)

## 特性

- **原生面板**：搜索 + 🎲 随机漫游、热门节点气泡云、结果卡片（点卡片 = 从该节点继续漫游；点「相似」= 相似节点弹窗；点「打开」= 跳回笔记）；参数与相似用 Obsidian 原生 Modal
- **引擎管理**：工具栏可停止引擎（⏹）、刷新图、调参数；跨平台探测 `seren.exe` / `seren` 并补 unix 可执行位
- **行为信号 digest**：引擎有新的 touch 聚合时，状态栏被动提醒（非弹窗）；点击查看，可一键导出为 `serendipity-digest-*.md` 笔记
- **MCP 接入**：设置页显示一键复制的 MCP 配置（`seren mcp <vault>`），主界面显示 MCP 就绪状态
- **完整界面**：命令「打开引擎完整界面」用浏览器打开引擎 Web UI（关系 / 相似 / 社区 / 导出 / 参数调优）

## 依赖

- **引擎** `serendipity-engine ≥ v0.1.14`（轻客户端，不打包引擎）
- **Obsidian** ≥ v1.5.0

> **关于版本号**：插件与引擎使用**独立版本号**——引擎是成熟内核（当前 v0.1.14），本插件是独立发布的新客户端（当前 **v0.1.0**）。引擎版本只作为**兼容性下限**：连接时插件比对 `stats.version`，仅当引擎**低于 v0.1.14**（缺 `/api/touch/digest` 等端点）才提示升级。

## 安装

1. 把本仓库拷入 Obsidian 插件文件夹：`<vault>/.obsidian/plugins/serendipity-engine/`
2. Obsidian 设置 → 第三方插件 → 启用「Serendipity Engine」；在其设置中配置**引擎核心路径**（或把引擎二进制放插件目录 / 加入 PATH）

> 插件自动探测本地引擎服务（`http://127.0.0.1:<port>`）。未运行时面板显示状态页——区分「未找到引擎可执行文件」（配置问题）与「引擎未启动」（点启动即可）。

## 快速开始

启动引擎后，在面板搜索 / 🎲 随机漫游即可；高级功能（关系 / 相似 / 社区 / 导出 / 参数调优）经命令「打开引擎完整界面」进引擎 Web UI。

## MCP 接入（AI）

设置页（或在面板点 MCP 状态）即可**一键复制** `mcpServers` 配置，粘贴到任意 MCP 客户端（Codex / DeepSeek Harness / Claude Code / Cursor / 其他 agent）：

```json
{
  "mcpServers": {
    "seren": {
      "command": "<seren 可执行文件>",
      "args": ["mcp", "<vault>"]
    }
  }
}
```

只读工具：`graph.stats / roam / random / relation / node / similar / community / touch_digest`（不写 touch、不触发 refresh——AI 会话不能改动本地状态）。

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
