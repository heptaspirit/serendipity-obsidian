# Serendipity Engine · Obsidian 插件（薄壳）

> 给 Obsidian 装「奇遇记引擎」的面板插件。**薄壳设计（D1）**：面板 iframe 引擎自服务的 Web UI——插件只做「发现引擎 → iframe → 跳回/刷新补丁」，引擎零代码改动。
> 关联：[`serendipity-engine`](https://github.com/heptaspirit/serendipity-engine)（Go 内核 + Web UI + release 二进制）· API 契约（本仓库与引擎的**唯一共享物**，改 API 必同步）

## requires

**serendipity-engine ≥ v0.1.13**（引擎单独安装/运行，本插件是纯壳，不打包引擎）。

## 这个插件做什么

- **面板**：侧栏/标签页注册引擎 Web UI（iframe 嵌入 `?embed=1` 紧凑模式）
- **发现引擎**：启动/连接时探测本地 seren 进程（`http://127.0.0.1:<port>`），不通则显示「未检测到引擎」+ 下载链接 + 启动命令引导
- **跳回**：引擎卡片点击 → `workspace.openLinkText()` 就地跳回笔记
- **隐式 touch**：`workspace.on(...)` / `vault.on(...)` 事件联动刷新与埋点
- **生命周期**：INSTALLED → CONFIGURED → RUNNING ⇄ CORE_STOPPED → DISABLED（四态机，见 `plugin-dev-plan.md` §六）

## 本地开发（Windows）

```powershell
# 1. 构建/准备引擎二进制（测试用，gitignored 不入库）
#    seren.exe 已放在仓库根（本地构建，勿提交）

# 2. 启动引擎（指向你的 vault）
.\seren.exe serve "D:\path\to\vault" --port 8910

# 3. 安装插件到 Obsidian
#    Obsidian 设置 → 第三方插件 → 开发者模式 → 浏览插件文件夹 → 把本仓库拷入
#    或手动复制到 <vault>/.obsidian/plugins/serendipity/
```

## 构建（main.js）

```bash
npm install
npm run build   # 产出 main.js + styles.css（社区发布需 main.js/manifest.json/styles.css 三件套）
```

## 发布

- GitHub release：**tag 必须与 `manifest.json` 的 version 一致**，release 上传 `main.js` / `manifest.json` / `styles.css`
- 社区目录：经 [community.obsidian.md](https://github.com/obsidianmd/obsidian-releases) 提交，自动化审核

## 许可证

MIT —— see [LICENSE](LICENSE).
