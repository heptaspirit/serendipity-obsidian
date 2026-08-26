// ============================================================================
// src/main.ts · Serendipity Engine Obsidian 插件入口（薄壳）
//
// 薄壳（D1）：插件只做「发现引擎 → iframe → 跳回/刷新补丁」，引擎零代码改动。
// 核心：
//   - managed 模式（Obsidian）：原生能力 spawn 本地 seren 进程，随宿主启停；
//     onunload 必须杀进程（否则留孤儿），以 registerEvent 自动清理事件。
//   - 发现引擎：启动/连接时探测 http://127.0.0.1:<port>/api/stats，不通则占位。
//   - 版本契约：连接时用 /api/stats 的 version 与 REQUIRED_ENGINE（最低引擎要求）比对；
//     插件自身版本号独立（见 manifest.version），与引擎版本解耦。
//   - 生命周期（M2 §六）：INSTALLED → CONFIGURED → RUNNING ⇄ CORE_STOPPED → DISABLED。
//   - 隐式 touch：active-leaf-change → POST /api/touch（仅记录不演化，引擎红线）。
//
// API 契约见 src/seren-api.d.ts + 引擎 docs/api-contract.md。
// ============================================================================
import { Plugin, Notice, setIcon } from "obsidian";
import { spawn, ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import { join, isAbsolute } from "path";
import { existsSync, chmodSync } from "fs";
import { SerenApi, SerenError } from "./api";
import { SerendipityView, SerenDigestModal, VIEW_TYPE_SEREN } from "./view";
import { SerendipitySettingTab } from "./settings";
import type { SerenDigest } from "./seren-api";

export type LifecycleStatus =
  | "INSTALLED"
  | "CONFIGURED"
  | "RUNNING"
  | "CORE_STOPPED"
  | "DISABLED";

export interface SerendipitySettings {
  mode: "managed" | "external"; // Obsidian=managed（spawn），其余平台=external（只连）
  corePath: string; // managed: seren 可执行文件路径；空=自动探测
  corePort: number; // 默认 8910（与 spawn/连接一致）
  token: string; // 插件生成并传给 --token，插件自身调 API 用
  autoStart: boolean; // managed: onload 且未运行则拉起
  implicitTouch: boolean; // active-leaf-change → /api/touch
  digestReminder: boolean; // digest_available → 状态栏提醒（被动，非弹窗）
  vaultNameOverride: string; // 可选，默认 vault.getName()
}

const DEFAULT_SETTINGS: SerendipitySettings = {
  mode: "managed",
  corePath: "",
  corePort: 8910,
  token: randomBytes(16).toString("hex"),
  autoStart: false, // 默认关：插件启用与内核解耦，不自动 spawn（避免启动时引擎整库解析拖慢 Obsidian）
  implicitTouch: true,
  digestReminder: true,
  vaultNameOverride: "",
};

/** 引擎最低要求（v0.1.14 起含 /api/touch/digest + stats.digest_available）。
 * 插件独立版本号（REQUIRED_ENGINE 是引擎兼容性下限，与插件自身版本解耦——见 docs/api-contract.md §3）。 */
const REQUIRED_ENGINE = "0.1.14";

/** 语义化版本比较：v ≥ min（逐段数值比较，避免 "0.1.9" > "0.1.14" 的字符串误判）。 */
function isVersionAtLeast(v: string, min: string): boolean {
  const pa = v.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = min.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const a = pa[i] ?? 0;
    const b = pb[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

export default class SerendipityPlugin extends Plugin {
  settings!: SerendipitySettings;
  api!: SerenApi;
  status: LifecycleStatus = "INSTALLED";

  private proc: ChildProcess | null = null;
  private statusBarText: HTMLElement | null = null;
  private touchTimer: ReturnType<typeof setTimeout> | null = null;
  private digestTimer: ReturnType<typeof setInterval> | null = null;
  private digestAvailable = false;

  get port(): number {
    return this.settings.corePort;
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    this.api = new SerenApi(this.settings.corePort, this.settings.token);
    this.status = "CONFIGURED";

    this.registerView(
      VIEW_TYPE_SEREN,
      (leaf) => new SerendipityView(leaf, this),
    );
    this.addRibbonIcon("network", "Serendipity Engine", () => this.activateView());
    this.addCommand({
      id: "open-serendipity",
      name: "打开 Serendipity Engine 面板",
      callback: () => this.activateView(),
    });
    this.addCommand({
      id: "open-full-ui",
      name: "打开引擎完整 Web UI（浏览器）",
      callback: () => this.openFullUi(),
    });
    this.addCommand({
      id: "start-engine",
      name: "启动引擎（seren）",
      callback: () => this.ensureCore(true),
    });
    this.addCommand({
      id: "stop-engine",
      name: "停止引擎（seren）",
      callback: () => this.stopCore(),
    });
    this.addSettingTab(new SerendipitySettingTab(this.app, this));

    this.statusBarText = this.addStatusBarItem();
    this.renderStatusBar();
    this.startDigestPolling();

    // 隐式 touch（仅记录不演化）——active-leaf-change
    if (this.settings.implicitTouch) {
      this.registerEvent(
        this.app.workspace.on("active-leaf-change", () =>
          this.touchActiveFile(),
        ),
      );
    }

    // 引擎发现/启停放「布局就绪」后再做——onload 绝不 await。原因：引擎起不来时
    // waitHealthy 会阻塞；Obsidian 启动会 await 每个插件的 onload，一旦卡住整
    // 个应用都起不来（用户实测：必须禁用插件才能启动）。后台跑完 updateViews 刷新面板。
    this.app.workspace.onLayoutReady(() => {
      void this.ensureCore();
      void this.checkVersion();
    });
  }

  onunload(): void {
    this.stopCore();
    if (this.digestTimer) clearInterval(this.digestTimer);
    // registerEvent / registerView / 多米诺事件由 Obsidian 自动清理
  }

  // ---- 生命周期 ----

  /** 探测引擎；managed 且需要时拉起 seren。force=true 时忽略 autoStart。 */
  async ensureCore(force = false): Promise<void> {
    if (await this.api.ping()) {
      this.status = "RUNNING";
      this.renderStatusBar();
      this.updateViews();
      return;
    }
    this.status = "CORE_STOPPED";
    const canSpawn =
      this.settings.mode === "managed" && (force || this.settings.autoStart);
    if (!canSpawn) {
      this.renderStatusBar();
      this.updateViews();
      return;
    }
    if (!this.startCore()) {
      this.renderStatusBar();
      this.updateViews();
      return;
    }
    const ok = await this.waitHealthy(15000);
    this.status = ok ? "RUNNING" : "CORE_STOPPED";
    this.renderStatusBar();
    this.updateViews();
  }

  private startCore(): boolean {
    if (this.proc) return true;
    const vaultPath = this.vaultPath();
    if (!vaultPath) return false;
    const cmd = this.resolveCoreCmd();
    if (!cmd) return false;
    const args = [
      "serve",
      vaultPath,
      "--port",
      String(this.settings.corePort),
      "--vault-name",
      this.vaultName(),
      "--token",
      this.settings.token,
    ];
    console.log("[seren] 准备启动引擎:", cmd, "→ serve ", vaultPath, "--port", this.settings.corePort, "--vault-name", this.vaultName());
    // mac/linux 下载的引擎二进制默认无 +x → spawn 报 EACCES；spawn 前补可执行位
    if (process.platform !== "win32" && existsSync(cmd) && isAbsolute(cmd)) {
      try {
        chmodSync(cmd, 0o755);
      } catch {
        /* ignore */
      }
    }
    try {
      // stdio:'ignore'：丢弃引擎写 stdout 的启动信息（否则管道写满会卡住子进程，
      // 也规避受限环境禁 stdio 管道的限制）；引擎只走 HTTP，重定向输出无意义。
      this.proc = spawn(cmd, args, { windowsHide: true, stdio: "ignore" });
    } catch (e) {
      console.error("[seren] spawn 失败", e);
      new Notice("Serendipity: 无法启动引擎（请检查核心路径）");
      return false;
    }
    this.proc.on("error", (e) => {
      console.error("[seren] 进程错误", e);
      this.proc = null;
      const info = this.coreSearchInfo();
      new Notice(
        info.found
          ? `Serendipity: 启动引擎出错（${e.message}）。请检查${this.settings.corePort}端口是否被占用、核心能否独立运行。`
          : `Serendipity: 未找到引擎可执行文件（${e.message}）。请在 设置→Serendipity Engine 填「核心路径」，或把 seren.exe 放到插件文件夹 / 加入 PATH。`,
      );
      this.renderStatusBar();
      this.updateViews();
    });
    this.proc.on("exit", () => {
      this.proc = null;
      this.status = "CORE_STOPPED";
      this.renderStatusBar();
      this.updateViews();
    });
    return true;
  }

  private stopCore(): void {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
    this.status = "DISABLED";
    this.renderStatusBar();
    this.updateViews();
  }

  /** 公开：手动停止引擎（设置页/命令用）。 */
  stopEngine(): void {
    this.stopCore();
  }

  private async waitHealthy(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      // 进程已退出/出错（proc=null）→ 不再空等，立即返回失败（ENOENT/端口占用等）
      if (!this.proc) return false;
      if (await this.api.ping()) return true;
      await new Promise((r) => setTimeout(r, 600));
    }
    return false;
  }

  /** 连接时引擎版本校验：/api/stats.version 必须 ≥ REQUIRED_ENGINE（最低引擎要求）。
   * 插件有独立版本号，这里只验引擎是否够新（避免旧引擎缺 /api/touch/digest 等端点）。 */
  private async checkVersion(): Promise<void> {
    if (!(await this.api.ping())) return;
    try {
      const s = await this.api.stats();
      // 引擎 version 带 "v"（如 v0.1.14）——归一化后再与最低要求比较。
      const engine = (s.version ?? "").replace(/^v/i, "");
      if (!isVersionAtLeast(engine, REQUIRED_ENGINE)) {
        new Notice(
          `Serendipity: 引擎 ${engine} 低于本插件要求的最低版本 v${REQUIRED_ENGINE}，请升级引擎（requires 契约）。`,
        );
      }
    } catch {
      /* 探测已过，此处静默 */
    }
  }

  // ---- 跳回（postMessage 桥）----

  /** 引擎点「打开」→ 就地跳回笔记。优先用 uri 解码出的 file 路径（llm-wiki/路径化
   * id 下更可靠），失败回退 openLinkText(id)。 */
  async openInObsidian(id: string, uri?: string): Promise<void> {
    const file = this.fileFromUri(uri);
    // 依次尝试 uri 的 file 路径 → 节点 id（文件名）
    const targets = file && file !== id ? [file, id] : [id];
    for (const target of targets) {
      try {
        console.log("[seren] 打开:", target);
        await this.app.workspace.openLinkText(target, "");
        return;
      } catch (e) {
        console.error("[seren] openLinkText 失败:", target, e);
      }
    }
    new Notice(`Serendipity: 无法打开「${id}」（已尝试 ${targets.join("、")}）`);
  }

  /** 从 obsidian://open?vault=X&file=Y 解出 file 路径参数；否则 null。 */
  private fileFromUri(uri?: string): string | null {
    if (!uri || !uri.startsWith("obsidian://")) return null;
    try {
      return new URL(uri).searchParams.get("file");
    } catch {
      return null;
    }
  }

  /** 引擎最低要求版本（供设置页展示）。 */
  requiredEngineVersion(): string {
    return REQUIRED_ENGINE;
  }

  /** 插件自身版本号（manifest.version，独立于引擎）。 */
  pluginVersion(): string {
    return this.manifest.version;
  }

  // ---- 面板 ----

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_SEREN)[0];
    if (!leaf) {
      // 默认开在主工作区（全宽）
      leaf = workspace.getLeaf(true);
      if (!leaf) return;
      await leaf.setViewState({ type: VIEW_TYPE_SEREN, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  /** 打开引擎完整 Web UI（浏览器）：原生界面只做核心漫游，高级功能（关系/相似/
   * 社区/导出）从这里进。引擎未运行则提示。 */
  async openFullUi(): Promise<void> {
    if (!(await this.api.ping())) {
      new Notice("Serendipity: 引擎未运行，先启动引擎");
      return;
    }
    const url = `http://127.0.0.1:${this.port}/`;
    try {
      const { shell } = require("electron") as { shell: { openExternal: (u: string) => Promise<void> } };
      await shell.openExternal(url);
    } catch (e) {
      console.error("[seren] openExternal 失败", e);
      window.open(url, "_blank");
    }
  }

  private updateViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SEREN)) {
      const view = leaf.view as SerendipityView;
      // onload 早期/恢复中的叶可能尚未挂上具体 view，或非本插件类——守卫后再渲染
      if (view && typeof view.render === "function") void view.render();
    }
  }

  // ---- 隐式 touch ----

  private touchActiveFile(): void {
    if (!this.settings.implicitTouch) return;
    if (this.touchTimer) clearTimeout(this.touchTimer);
    this.touchTimer = setTimeout(() => {
      this.touchTimer = null;
      const f = this.app.workspace.getActiveFile();
      if (!f) return;
      const id = f.basename;
      void this.api.touch(id, "").catch(() => {});
    }, 500);
  }

  // ---- 辅助 ----

  /** seren 可执行文件的候选路径（按优先级）：
   * ①核心路径设置 ②插件目录(manifest.dir) ③从 vault 推导 .obsidian/plugins/<id>。 */
  /** 插件自身目录（绝对路径）：manifest.dir 可能是 vault 相对路径
   * （如 ".obsidian\plugins\<folder>"），需解析成绝对；否则 join 后 existsSync 相对 CWD。 */
  private pluginDir(): string | null {
    const dir = (this.manifest as { dir?: string }).dir;
    if (!dir) return null;
    if (isAbsolute(dir)) return dir;
    const base = this.vaultPath();
    return base ? join(base, dir) : null;
  }

  /** 平台对应的引擎二进制名：Windows 为 seren.exe，mac/linux 为 seren（无后缀）。 */
  private static exeName(): string[] {
    return process.platform === "win32" ? ["seren.exe", "seren"] : ["seren", "seren.exe"];
  }

  private coreCandidates(): string[] {
    const c: string[] = [];
    if (this.settings.corePath) c.push(this.settings.corePath);
    const names = SerendipityPlugin.exeName();
    const pdir = this.pluginDir();
    if (pdir) for (const n of names) c.push(join(pdir, n));
    // manifest.dir 缺失时，从 vault 推导标准社区插件目录（按 manifest.id 命名）
    const base = this.vaultPath();
    const id = this.manifest.id;
    if (base && id) {
      const pluginsDir = join(base, ".obsidian", "plugins", id);
      for (const n of names) c.push(join(pluginsDir, n));
    }
    return c;
  }

  resolveCoreCmd(): string | null {
    for (const p of this.coreCandidates()) {
      if (existsSync(p)) return p;
    }
    // 兜底走 PATH；Windows 需带 .exe 才能被 CreateProcess 解析
    return process.platform === "win32" ? "seren.exe" : "seren";
  }

  /** 返回核心查找结果（供「未检测到引擎」占位页显示）。
   * found=false 表示所有候选都没找到 seren 可执行文件。 */
  coreSearchInfo(): { found: boolean; path: string } {
    const candidates = this.coreCandidates();
    for (const p of candidates) {
      if (existsSync(p)) return { found: true, path: p };
    }
    return {
      found: false,
      path:
        candidates.length > 0 ? candidates.join("\n  ") : "PATH 中的 seren",
    };
  }

  vaultPath(): string {
    const adapter = this.app.vault.adapter as unknown as {
      getBasePath?: () => string;
      basePath?: string;
    };
    return adapter?.getBasePath?.() ?? adapter?.basePath ?? "";
  }

  vaultName(): string {
    if (this.settings.vaultNameOverride) return this.settings.vaultNameOverride;
    return this.app.vault.getName();
  }

  async isCoreHealthy(): Promise<boolean> {
    return this.api.ping();
  }

  // ---- touch digest（v0.1.14，§3.7）被动提醒 ----

  /** 周期性轮询 /api/stats 的 digest_available；变化才重绘状态栏（非弹窗）。 */
  startDigestPolling(): void {
    if (!this.settings.digestReminder) return;
    if (this.digestTimer) clearInterval(this.digestTimer);
    this.digestTimer = setInterval(() => void this.checkDigest(), 30000);
  }

  /** 外部（设置页）同步 digest 提醒开关状态。 */
  setDigestAvailable(avail: boolean): void {
    this.digestAvailable = avail;
    this.renderStatusBar();
  }

  private async checkDigest(): Promise<void> {
    if (!this.settings.digestReminder) return;
    if (!(await this.api.ping())) return;
    try {
      const s = await this.api.stats();
      const avail = Boolean(s.digest_available);
      if (avail !== this.digestAvailable) {
        this.digestAvailable = avail;
        this.renderStatusBar();
      }
    } catch {
      /* 探测已过，静默 */
    }
  }

  /** 打开最新 digest 查看（状态栏「📋 有新的 digest」点击）。查看后即 ack 清提醒。 */
  async openDigest(): Promise<void> {
    let resp;
    try {
      resp = await this.api.touchDigest();
    } catch (e) {
      console.error("[seren] digest 读取失败", e);
      new Notice("Serendipity: digest 读取失败");
      return;
    }
    if (resp.digest) {
      // ack 只清提醒，不碰引擎任何数据（红线：touch 只读）
      try {
        await this.api.touchDigestAck(resp.digest.id);
      } catch {
        /* ignore */
      }
      this.digestAvailable = false;
      this.renderStatusBar();
    }
    new SerenDigestModal(this.app, this, resp).open();
  }

  /** 导出 digest 为 vault 笔记（引擎零写 vault——文件由插件主动生成）。 */
  async exportDigest(d: SerenDigest): Promise<void> {
    const ts = this.timestamp(new Date());
    const name = `serendipity-digest-${ts}.md`;
    const body = this.digestMarkdown(d);
    try {
      await this.app.vault.create(name, body);
      new Notice(`Serendipity: 已导出 ${name}`);
    } catch (e) {
      console.error("[seren] 导出 digest 失败", e);
      new Notice("Serendipity: 导出 digest 失败");
    }
  }

  private timestamp(d: Date): string {
    const p = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  private digestMarkdown(d: SerenDigest): string {
    const zh = (navigator.language || "en").toLowerCase().startsWith("zh");
    const lines: string[] = [];
    if (zh) {
      lines.push(`# Serendipity 行为信号 digest · ${d.since}`);
      lines.push(`> 窗口内新增 touch：**${d.total}** 次。`);
      lines.push("");
      lines.push("## 被反复点击");
    } else {
      lines.push(`# Serendipity behavior digest · ${d.since}`);
      lines.push(`> New touches in window: **${d.total}**.`);
      lines.push("");
      lines.push("## Top clicked");
    }
    for (const t of d.targets ?? []) lines.push(`- ${t.title} — ${t.count}`);
    if (zh) lines.push(`\n## 来源词`);
    else lines.push(`\n## Source queries`);
    for (const s of d.sources ?? []) lines.push(`- \`${s.id}\` — ${s.count}`);
    lines.push("");
    lines.push(zh ? `> 由 Obsidian 插件导出 · ${new Date().toISOString()}` : `> Exported by the Obsidian plugin · ${new Date().toISOString()}`);
    return lines.join("\n");
  }

  // ---- MCP（AI 接入）配置 ----

  /** 引擎是否已运行（MCP 配置可用的前提）。 */
  mcpReady(): boolean {
    return this.status === "RUNNING";
  }

  /** 生成可粘贴到任意 MCP 客户端的 mcpServers 配置 JSON（seren mcp <vault>，读取源）。
   * 只用 <vault>（不传 --db）——MCP 从源重解析，无需在插件侧复刻引擎 store 的 sha256 路径，任何平台都成立。 */
  mcpConfigJson(): string {
    const info = this.coreSearchInfo();
    const cmd = info.found ? info.path : process.platform === "win32" ? "seren.exe" : "seren";
    const cfg = {
      mcpServers: {
        seren: {
          command: cmd,
          args: ["mcp", this.vaultPath()],
        },
      },
    };
    return JSON.stringify(cfg, null, 2);
  }

  /** 复制 MCP 配置到剪贴板（Obsidian Electron：优先 navigator.clipboard，失败回退 electron.clipboard）。 */
  async copyMcpConfig(): Promise<void> {
    const text = this.mcpConfigJson();
    try {
      await navigator.clipboard.writeText(text);
      new Notice("Serendipity: MCP 配置已复制");
      return;
    } catch {
      /* 回退 */
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { clipboard } = require("electron");
      clipboard.writeText(text);
      new Notice("Serendipity: MCP 配置已复制");
    } catch {
      new Notice("Serendipity: 复制失败，请手动选择复制");
    }
  }

  private renderStatusBar(): void {
    if (!this.statusBarText) return;
    this.statusBarText.empty();
    const label = document.createElement("span");
    label.setText(this.status);
    label.addClass("seren-status");
    const icon = document.createElement("span");
    setIcon(icon, this.status === "RUNNING" ? "zap" : "circle-slash");
    this.statusBarText.appendChild(icon);
    this.statusBarText.appendChild(label);
    this.statusBarText.setAttribute("aria-label", `Serendipity: ${this.status}`);
    // digest 被动提醒（非弹窗）：digest_available 且开关开 → 显示可点击「有新的 digest」
    if (this.digestAvailable && this.settings.digestReminder) {
      const sep = this.statusBarText.createSpan({ text: " · ", cls: "seren-status-sep" });
      void sep;
      const btn = this.statusBarText.createSpan({ text: "📋 有新的 digest", cls: "seren-status-digest" });
      btn.setAttribute("role", "button");
      btn.setAttribute("aria-label", "查看最新行为信号 digest");
      btn.addEventListener("click", () => void this.openDigest());
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") void this.openDigest();
      });
      btn.setAttribute("tabindex", "0");
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.api.setConnection(this.settings.corePort, this.settings.token);
    // 后台探测/启停，不阻塞设置保存；ensureCore 结束会自行 updateViews
    void this.ensureCore();
  }
}
