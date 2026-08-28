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
//   - 进程清理：spawn 传 --pid-file（引擎原子写自身 PID）；stopCore/pagehide 整树强杀
//     （taskkill /T /F，不留孤儿）；启动前 clearStaleCore 校验并杀掉上次异常退出的残留。
//   - 隐式 touch：active-leaf-change → POST /api/touch（仅记录不演化，引擎红线）。
//
// API 契约见 src/seren-api.d.ts + 引擎 docs/api-contract.md。
// ============================================================================
import { Plugin, Notice, setIcon } from "obsidian";
import { spawn, spawnSync, ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import { join, isAbsolute, basename } from "path";
import { existsSync, chmodSync, readFileSync, writeFileSync } from "fs";
import { SerenApi, SerenError } from "./api";
import { SerendipityView, SerenDigestModal, VIEW_TYPE_SEREN } from "./view";
import { SerendipitySettingTab } from "./settings";
import { resolveLatestDownload, downloadRelease } from "./engine-download";
import type { SerenDigest, SerenMcpStatus } from "./seren-api";

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
  engineVersion: string; // 插件下载的引擎 tag（如 "v0.2.1"）；手动放置的二进制不记录
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
  engineVersion: "",
};

/** 引擎最低要求（v0.2.0 起 serve 内嵌 /mcp + /api/mcp/*）。
 * 插件独立版本号（REQUIRED_ENGINE 是引擎兼容性下限，与插件自身版本解耦——见 docs/api-contract.md §3）。 */
const REQUIRED_ENGINE = "0.2.0";

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

/** 整树强杀进程：win 用 taskkill /T /F（硬杀，seren 的 store 是 bbolt、按操作开关，不损坏数据）；
 * posix 用 SIGTERM。进程已退出时静默。 */
function killTree(pid: number): void {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
    });
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* 已退出 */
    }
  }
}

export default class SerendipityPlugin extends Plugin {
  settings!: SerendipitySettings;
  api!: SerenApi;
  status: LifecycleStatus = "INSTALLED";

  private proc: ChildProcess | null = null;
  /** spawn 记录的引擎进程 PID（兜底句柄；权威句柄是引擎自己写的 pid-file）。 */
  private pid: number | null = null;
  private statusBarText: HTMLElement | null = null;
  private touchTimer: ReturnType<typeof setTimeout> | null = null;
  /** 上一次 touch 的笔记 basename——作为下一次 touch 的 from（阅读来源/有向转移信号）。 */
  private lastActiveId: string | null = null;
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

    // 兜住应用退出：Electron 关窗可靠触发 pagehide（补 Obsidian 不调 onunload 的路径，
    // 否则留孤儿占端口/连旧引擎）。经 registerDomEvent 注册，unload 时自动解绑。
    this.registerDomEvent(window, "pagehide", () => this.stopCore());

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
    // 启动自愈：杀上次异常退出残留的孤儿（读 pid-file，校验是 seren 才杀），
    // 治「端口被占 / 一直连到旧引擎」。只在本进程无自管 proc 时执行，防误杀自己。
    await this.clearStaleCore();
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
      // 引擎启动时原子写自身 PID 到 pid-file（优雅退出删）——插件清理句柄的权威来源
      "--pid-file",
      join(vaultPath, ".serendipity", "seren.pid"),
    ];
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
      this.pid = this.proc.pid ?? null; // 兜底句柄；pid-file 是权威
    } catch (e) {
      console.error("[seren] spawn 失败", e);
      new Notice("Serendipity: 无法启动引擎（请检查核心路径）");
      return false;
    }
    this.proc.on("error", (e) => {
      console.error("[seren] 进程错误", e);
      this.proc = null;
      this.pid = null;
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
      this.pid = null;
      this.status = "CORE_STOPPED";
      this.renderStatusBar();
      this.updateViews();
    });
    return true;
  }

  private stopCore(): void {
    // 引擎自己写的 pid-file 是权威句柄，优先；兜底用 spawn 记录的 this.pid
    const pid = this.readPidFile() ?? this.pid;
    if (pid) killTree(pid);
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
    this.pid = null;
    this.status = "DISABLED";
    this.renderStatusBar();
    this.updateViews();
  }

  /** 公开：手动停止引擎（设置页/命令用）。 */
  stopEngine(): void {
    this.stopCore();
  }

  // ---- 进程句柄（pid-file 自愈）----

  /** 读引擎写的 pid-file（<vault>/.serendipity/seren.pid）。不存在/空/非法 → null。 */
  private readPidFile(): number | null {
    const pidFile = join(this.vaultPath(), ".serendipity", "seren.pid");
    try {
      const n = parseInt(readFileSync(pidFile, "utf8").trim(), 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null; // 文件不存在 / 读取失败
    }
  }

  /** 校验 PID 确实是 seren 进程（win 比对镜像名，posix 看 comm 含 seren）——绝不误杀无关程序。 */
  private isSerenProcess(pid: number): boolean {
    try {
      if (process.platform === "win32") {
        const expected = basename(this.resolveCoreCmd() ?? "seren.exe").toLowerCase();
        const res = spawnSync(
          "tasklist",
          ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
          { encoding: "utf8", windowsHide: true },
        );
        const line = String(res.stdout ?? "")
          .split(/\r?\n/)
          .find((l) => l.includes(`"${pid}"`));
        if (!line) return false; // 无该 PID 的行（进程已退出 / 不是任务列表项）
        const img = line.split(",")[0].replace(/"/g, "").trim().toLowerCase();
        return img === expected;
      }
      const res = spawnSync("ps", ["-p", String(pid), "-o", "comm="], {
        encoding: "utf8",
      });
      return String(res.stdout ?? "").toLowerCase().includes("seren");
    } catch {
      return false; // 查询失败 → 宁可不动手
    }
  }

  /** 启动自愈：杀掉上次异常退出残留的孤儿（仅当进程在且是 seren）。本进程有自管 proc 时跳过。 */
  private async clearStaleCore(): Promise<void> {
    if (this.proc) return; // 自己管的进程在 → 不清理，防误杀自己
    const pid = this.readPidFile();
    if (!pid) return;
    if (this.isSerenProcess(pid)) killTree(pid);
    await new Promise((r) => setTimeout(r, 500)); // 等端口释放，避免新 spawn 撞 EADDRINUSE
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
      const target = f.basename;
      const from = this.lastActiveId ?? ""; // 上一篇被 touch 的笔记 = 来源（A→B→C 形成链）
      void this.api.touch(target, from).catch(() => {});
      this.lastActiveId = target; // 记住当前，作下一次的 from
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

  /** 下载最新引擎二进制到插件目录（GitHub Releases，用户按钮触发）。
   * Windows 下覆盖运行中的 exe 会被锁 → 先停引擎再写。返回安装的 tag（如 "v0.2.1"）。 */
  async downloadEngineCore(): Promise<string> {
    const info = await resolveLatestDownload();
    const dir = this.pluginDir();
    if (!dir) throw new Error("无法定位插件目录（manifest.dir 缺失）");
    if (this.proc) this.stopCore(); // 解锁运行中的 exe（Windows 占用会 EPERM）
    const dest = join(dir, info.name.endsWith(".exe") ? "seren.exe" : "seren");
    const data = await downloadRelease(info);
    writeFileSync(dest, Buffer.from(data));
    if (process.platform !== "win32") chmodSync(dest, 0o755); // 下载的文件默认无 +x
    this.settings.engineVersion = info.tag;
    await this.saveSettings();
    return info.tag;
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

  /** 查询 serve 内嵌 MCP 状态（v0.2.0，/api/mcp/status）。未连接 / 旧引擎（无该端点）→ null，表示不可监控。 */
  async mcpStatus(): Promise<SerenMcpStatus | null> {
    if (!(await this.api.ping())) return null;
    try {
      return await this.api.mcpStatus();
    } catch {
      return null; // 旧引擎（无 /api/mcp）→ 非可监控
    }
  }

  /** 切换 /mcp 端点启停（v0.2.0）。返回是否操作成功；引擎未运行 / 旧引擎 → false。 */
  async setMcpEnabled(on: boolean): Promise<boolean> {
    if (!(await this.api.ping())) return false;
    try {
      if (on) await this.api.mcpEnable();
      else await this.api.mcpDisable();
      return true;
    } catch {
      return false;
    }
  }

  /** 生成可粘贴到任意 MCP 客户端的 mcpServers 配置 JSON（serve 内嵌 /mcp，Streamable HTTP，v0.2.0）。
   * 引擎 serve 运行时 MCP 才可接入（Web+REST+MCP 三合一）；/mcp 仅 Host 校验，token 头为附加保险（同引擎前端一键配置）。 */
  mcpConfigJson(): string {
    const cfg = {
      mcpServers: {
        seren: {
          type: "streamable-http",
          url: `http://127.0.0.1:${this.port}/mcp`,
          headers: { "X-Seren-Token": this.settings.token },
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
