// ============================================================================
// src/settings.ts · Serendipity 设置页
//
// 配置 coreManagement：managed(=spawn seren)/external(=只连)；核心路径/端口；
// 自动生成并持久化的 token（传给 --token，插件自身调 API 用，改随重启才稳定的
// 做法是持久化后重启引擎）；自动启动；隐式 touch。外部模式无需 corePath。
// ============================================================================
import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import { randomBytes } from "crypto";
import type SerendipityPlugin from "./main";

export class SerendipitySettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SerendipityPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h1", { text: "Serendipity Engine" });
    containerEl.createEl("p", {
      text: "图谱漫游薄壳插件：把引擎（seren）自服务的 Web UI 嵌进 Obsidian。设置「引擎核心」与「连接」参数。",
      cls: "setting-item-description",
    });

    // 当前生命周期状态 + 版本信息（插件独立版本号 / 引擎最低要求）
    containerEl.createEl("section", { cls: "seren-settings-status" }).createEl("p", {
      text: `当前状态: ${this.plugin.status} · 插件 ${this.plugin.pluginVersion()} · 要求引擎 ≥ v${this.plugin.requiredEngineVersion()}`,
      cls: "seren-settings-status-text",
    });

    // ---- 连接 ----
    containerEl.createEl("h3", { text: "连接" });

    new Setting(containerEl)
      .setName("引擎模式")
      .setDesc(
        "managed = 插件拉起并随宿主启停 seren；external = 你自行运行 seren，插件只连接。",
      )
      .addDropdown((dd) =>
        dd
          .addOption("managed", "managed（插件拉起）")
          .addOption("external", "external（自行运行）")
          .setValue(this.plugin.settings.mode)
          .onChange(async (v) => {
            this.plugin.settings.mode = v as "managed" | "external";
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName("HTTP 端口")
      .setDesc("seren serve 监听端口（spawn 与连接一致；默认 8910）。")
      .addText((t) =>
        t
          .setPlaceholder("8910")
          .setValue(String(this.plugin.port))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!Number.isNaN(n) && n > 0 && n < 65536) {
              this.plugin.settings.corePort = n;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("核心路径")
      .setDesc(
        "seren 可执行文件路径。留空 = 自动探测（插件目录 seren.exe / PATH 中的 seren）。",
      )
      .addText((t) =>
        t
          .setPlaceholder("自动")
          .setValue(this.plugin.settings.corePath)
          .onChange(async (v) => {
            this.plugin.settings.corePath = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    let tokenEl: HTMLInputElement | null = null;
    new Setting(containerEl)
      .setName("API Token")
      .setDesc(
        "插件生成并传给引擎的鉴权 token（X-Seren-Token）。白盒可见；改动后需重启引擎生效。",
      )
      .addText((t) => {
        t.setValue(this.plugin.settings.token).setDisabled(true);
        tokenEl = t.inputEl;
      })
      .addButton((b) =>
        b.setButtonText("重新生成").onClick(async () => {
          this.plugin.settings.token = randomBytes(16).toString("hex");
          await this.plugin.saveSettings();
          if (tokenEl) tokenEl.value = this.plugin.settings.token;
          new Notice("已重新生成 token；重启引擎后生效");
        }),
      );

    // ---- 行为 ----
    containerEl.createEl("h3", { text: "行为" });

    new Setting(containerEl)
      .setName("自动启动引擎")
      .setDesc(
        "（默认关）managed 模式下插件加载时自动拉起 seren。开启后启动瞬间引擎会同步解析整个库，大库可能拖慢 Obsidian；建议由面板「启动引擎」按钮手动拉起。",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoStart).onChange(async (v) => {
          this.plugin.settings.autoStart = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("隐式反馈埋点")
      .setDesc(
        "切换活动笔记时向引擎 /api/touch 上报（仅记录，不影响排序/热度——引擎红线）。",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.implicitTouch).onChange(async (v) => {
          this.plugin.settings.implicitTouch = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("digest 提醒")
      .setDesc(
        "引擎有新的行为信号（touch digest）时在状态栏轻量提醒（被动、非弹窗）；关闭则不轮询 digest_available。",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.digestReminder).onChange(async (v) => {
          this.plugin.settings.digestReminder = v;
          this.plugin.startDigestPolling();
          if (!v) {
            this.plugin.setDigestAvailable(false);
          }
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Vault 名覆盖")
      .setDesc(
        "可选。传给引擎 --vault-name 以生成 obsidian:// 跳转；留空用当前 vault 名。",
      )
      .addText((t) =>
        t
          .setPlaceholder(this.app.vault.getName())
          .setValue(this.plugin.settings.vaultNameOverride)
          .onChange(async (v) => {
            this.plugin.settings.vaultNameOverride = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    // ---- 操作 ----
    containerEl.createEl("h3", { text: "操作" });

    new Setting(containerEl)
      .setName("启动 / 停止引擎")
      .setDesc("手动触发 managed 模式的引擎启停（external 模式无需操作）。")
      .addButton((b) =>
        b.setButtonText("启动").onClick(async () => {
          await this.plugin.ensureCore(true);
          this.display();
        }),
      )
      .addButton((b) =>
        b.setButtonText("停止").onClick(async () => {
          this.plugin.stopEngine();
          this.display();
        }),
      );

    // ---- MCP（AI 接入，v0.2.0 重写：serve 内嵌 /mcp + 状态启停）----
    containerEl.createEl("h3", { text: "MCP（AI 接入）" });
    const mcpStatusEl = containerEl.createEl("p", {
      text: "MCP 状态: 加载中…",
      cls: "seren-settings-status-text",
    });
    const mcpToggle = containerEl.createEl("button", { text: "停用 /mcp", cls: "seren-btn-ghost seren-settings-mcp-toggle" });
    const pre = containerEl.createEl("pre", { cls: "seren-mcp-config" });
    pre.setText(this.plugin.mcpConfigJson());
    new Setting(containerEl)
      .setName("复制 MCP 配置（Streamable HTTP）")
      .setDesc(
        "引擎 serve 内嵌 MCP（/mcp 端点）：把下方的 mcpServers 配置粘贴到任意 MCP 客户端（Codex / DeepSeek Harness / Claude Code / Cursor 等），即可让 AI 消费只读工具（graph.stats / roam / random / relation / node / similar / community / touch_digest / state）。引擎须运行且 /mcp 已启用。",
      )
      .addButton((b) =>
        b.setButtonText("复制 MCP 配置").onClick(async () => {
          await this.plugin.copyMcpConfig();
          this.display();
        }),
      );

    // 异步填充 MCP 真实状态（enabled/configured/tools/transport）+ 启停按钮
    void this.plugin.mcpStatus().then((st) => {
      if (!mcpStatusEl.isConnected) return;
      if (!st) {
        mcpStatusEl.setText("MCP 状态: 引擎未运行或旧引擎（无 /api/mcp）");
        mcpToggle.remove();
        return;
      }
      const on = st.enabled;
      mcpStatusEl.setText(
        `MCP 状态: ${on ? "已启用" : "已停用"} · 传输 ${st.transport || "streamable-http"} · 工具 ${st.tools} · ${st.configured ? "已配库" : "未配库"}${st.configured ? "" : "（先配置库才有数据）"}`,
      );
      mcpToggle.setText(on ? "停用 /mcp" : "启用 /mcp");
      mcpToggle.addEventListener("click", async () => {
        const ok = await this.plugin.setMcpEnabled(!on);
        if (!ok) {
          new Notice("MCP 启停失败（引擎未运行 / 旧引擎）");
          return;
        }
        this.display();
      });
    });
  }
}
