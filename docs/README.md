# 文档导航（docs/）

> 本目录按主题组织 **Serendipity Engine · Obsidian 插件** 的维护文档。除架构与契约外均为当前有效文档。
> **AI agent / 后续维护者入口**：根目录 [`AGENTS.md`](../AGENTS.md)（30 秒定位 / 命令 / 仓库地图 / 红线）——本文档是完整的分层导航。

## 分层速览

| 层 | 文档 | 回答的问题 |
|---|---|---|
| **架构** | [`architecture.md`](architecture.md) | 薄壳组件怎么组织、数据流怎么走、生命周期怎么管？ |
| **契约** | [`api-contract.md`](api-contract.md) | 插件与引擎（seren）怎么对接？端点在哪儿、怎么鉴权、版本怎么对齐？ |
| **计划** | （见引擎 `docs/plugin-dev-plan.md`） | 下一步做什么（M2 生命周期四态机 / 分发 / 插件×AI 协作）？ |
| **历史** | （暂无） | 决策归档（可放 engines 侧，本仓库只承载壳） |

## 架构

| 文档 | 说明 |
|---|---|
| [`architecture.md`](architecture.md) | **插件薄壳架构**：组件解剖（view/main/settings/api/契约）、spawn 契约、iframe + postMessage 桥、生命周期与进程管理、构建。 |

## 契约

| 文档 | 说明 |
|---|---|
| [`api-contract.md`](api-contract.md) | **插件↔引擎 REST 契约**：基址、鉴权、端点清单、版本策略（D5/D6）。引擎侧唯一权威是 `serendipity-engine/docs/api-contract.md`；本地类型副本在 `src/seren-api.d.ts`。 |

## 计划（外部，本仓库只引用）

- 引擎仓库 [`serendipity-engine`](https://github.com/heptaspirit/serendipity-engine) 的 `docs/plugin-dev-plan.md` —— 插件开发计划（M2）：生命周期四态机 / 多平台分发 / 插件×AI 协作架构。
- 引擎仓库 `docs/frontend.md` —— Web UI 前端计划（embed / postMessage 桥契约）。

## 目录约定

- 除 `history/` 外为**当前有效**文档，改动需同步本导航与根 `AGENTS.md`。
- 本地敏感联调内容放 `docs-local/`（已在 `.gitignore`，不入库）。
