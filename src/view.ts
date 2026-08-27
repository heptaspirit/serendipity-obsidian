// ============================================================================
// src/view.ts · Serendipity Engine 面板（原生界面）
//
// 参考引擎 Web UI 的结构做原生版：初始显示热门节点气泡云（/api/hot），
// 搜索/随机 → 结果卡片（类型徽标 + 标题 + 分数 + 路径 + 操作：继续/相似/打开）。
// 原生 Obsidian DOM → 主题自动跟随、可响应窄宽；点卡片直接 openLinkText 跳回。
// 参数/相似用 Obsidian 原生 Modal。
// ============================================================================
import { ItemView, WorkspaceLeaf, Modal, Setting, Notice, App } from "obsidian";
import type SerendipityPlugin from "./main";
import { t } from "./i18n";
import type { SerenRoam, SerenRoamItem, SerenHot, SerenConfig, SerenSimilar, SerenTouchDigestResp, SerenDigest, SerenAnchor, SerenNodeDetail, SerenRelation, SerenNodeRef } from "./seren-api";

export const VIEW_TYPE_SEREN = "serendipity-engine-view";

interface RoamParams {
  top: number;
  hops: number;
  lambda: number;
  theta: number;
}

const DEFAULT_PARAMS: RoamParams = { top: 15, hops: 3, lambda: 0.7, theta: 0.1 };

export class SerendipityView extends ItemView {
  private rootEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private busy = false;
  private renderGen = 0;
  params: RoamParams = { ...DEFAULT_PARAMS };

  constructor(leaf: WorkspaceLeaf, private plugin: SerendipityPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_SEREN;
  }
  getDisplayText(): string {
    return "Serendipity Engine";
  }
  getIcon(): string {
    return "network";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }
  async onClose(): Promise<void> {
    this.rootEl = null;
    this.bodyEl = null;
    this.contentEl.empty();
  }

  // ---- 渲染入口 ----
  async render(): Promise<void> {
    // 并发守卫：onOpen 与 updateViews 可能并发各调一次 render()，若各自在 await
    // 后 append 会叠出两套工具栏。用单调 renderGen，只有最后一次（gen 匹配）才建 DOM。
    const gen = ++this.renderGen;
    this.contentEl.empty();
    this.busy = false;
    const healthy = await this.plugin.isCoreHealthy();
    if (gen !== this.renderGen) return;
    if (!healthy) {
      this.renderEngineState();
      return;
    }
    this.renderRover();
  }

  // ---- 状态：未找到 / 未启动 ----
  private renderEngineState(): void {
    this.rootEl = this.contentEl.createDiv({ cls: "seren-native seren-state" });
    const info = this.plugin.coreSearchInfo();
    const found = info.found;
    this.rootEl.createEl("div", { text: t(found ? "notRunning" : "notFound"), cls: "seren-state-title" });
    this.rootEl.createEl("div", { text: t("serviceNoResp", { port: String(this.plugin.port) }), cls: "seren-state-sub" });
    const hint = this.rootEl.createEl("div", { cls: "seren-state-hint" });
    if (found) {
      // 路径单独成块（等宽、可截断），说明一句放下面
      this.rootEl.createEl("div", { text: t("foundLabel"), cls: "seren-state-label" });
      this.rootEl.createDiv({ cls: "seren-state-pathbox", text: info.path });
      hint.setText(t("foundHint"));
    } else {
      hint.setText(t("missingHint"));
      const list = this.rootEl.createDiv({ cls: "seren-state-list" });
      for (const p of info.path.split("\n")) if (p.trim()) list.createDiv({ text: "  " + p.trim(), cls: "seren-state-path" });
    }
    const actions = this.rootEl.createDiv({ cls: "seren-state-actions" });
    actions.createEl("button", { text: t("retry"), cls: "seren-btn-ghost" }).addEventListener("click", () => void this.render());
    if (found) {
      actions.createEl("button", { text: t("startEngine"), cls: "seren-btn-primary" }).addEventListener("click", () => {
        void this.plugin.ensureCore(true).then(() => this.render());
      });
    }
  }

  // ---- 运行中：原生漫游 UI ----
  private renderRover(): void {
    this.rootEl = this.contentEl.createDiv({ cls: "seren-native seren-rover" });

    const bar = this.rootEl.createDiv({ cls: "seren-toolbar" });
    const input = bar.createEl("input", { type: "text", cls: "seren-query" });
    input.setAttribute("placeholder", t("searchPh"));
    input.setAttribute("aria-label", t("searchPh"));
    bar.createEl("button", { text: t("roamBtn"), cls: "seren-btn" }).addEventListener("click", () => void this.roam(input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void this.roam(input.value);
    });
    const act = bar.createDiv({ cls: "seren-toolbar-icons" });
    this.iconBtn(act, "🎲", t("diceTitle"), () => void this.roam("", true));
    this.iconBtn(act, "↻", t("refresh"), () => void this.refreshGraph());
    this.iconBtn(act, "⚙", t("params"), () => void this.openParams());
    this.iconBtn(act, "↗", t("openFullUi"), () => void this.plugin.openFullUi());
    // 分隔 + 停止引擎（停止后状态页可再启动）
    act.createSpan({ cls: "seren-toolbar-sep" });
    this.iconBtn(act, "⏹", t("stopEngine"), () => this.plugin.stopEngine());

    const status = this.rootEl.createDiv({ cls: "seren-status" });
    this.bodyEl = this.rootEl.createDiv({ cls: "seren-body" });

    void this.loadHome(status, input);
  }

  private iconBtn(parent: HTMLElement, glyph: string, title: string, onClick: () => void): void {
    const b = parent.createEl("button", { cls: "seren-icon-btn" });
    b.setText(glyph);
    b.setAttribute("title", title);
    b.setAttribute("aria-label", title);
    b.addEventListener("click", onClick);
  }

  private async loadHome(status: HTMLElement, input: HTMLInputElement): Promise<void> {
    try {
      const s = await this.plugin.api.stats();
      const pre = s.configured === false ? `${t("notConfigured")} · ` : "";
      status.setText(`${pre}${s.nodes} ${t("nodes")} · ${s.edges} ${t("edges")} · ${s.version}`);
    } catch {
      status.setText(t("loading"));
    }
    // MCP 状态（主界面）：反映 serve 内嵌 /mcp 的实时启停状态（v0.2.0），点击复制配置
    const mcp = status.createSpan({ cls: "seren-mcp-chip" });
    mcp.setAttribute("role", "button");
    mcp.setAttribute("tabindex", "0");
    mcp.setAttribute("aria-label", t("copyMcpConfig"));
    mcp.setAttribute("title", t("copyMcpConfig"));
    mcp.setText(t("mcpStatusLoading"));
    mcp.addEventListener("click", () => void this.plugin.copyMcpConfig());
    mcp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") void this.plugin.copyMcpConfig();
    });
    // 异步查询 MCP 状态：已启用 / 已停用 / 未配库 / 旧引擎（无 /api/mcp）
    void this.plugin.mcpStatus().then((st) => {
      if (!mcp.isConnected) return;
      if (!st) mcp.setText(t("mcpStatusLegacy"));
      else if (!st.configured) mcp.setText(t("mcpStatusNoVault"));
      else mcp.setText(st.enabled ? t("mcpStatusEnabled") : t("mcpStatusDisabled"));
    });
    // 初始：热门节点气泡云（web 界面同款味道），无 query 时不空屏
    await this.renderHot(input);
  }

  private async renderHot(input: HTMLInputElement): Promise<void> {
    const body = this.bodyEl;
    if (!body) return;
    body.empty();
    try {
      const hot = await this.plugin.api.hot(24);
      const wrap = body.createDiv({ cls: "seren-hot" });
      wrap.createDiv({ text: t("hotTitle"), cls: "seren-hot-title" });
      const cloud = wrap.createDiv({ cls: "seren-hot-cloud" });
      for (const h of hot) {
        const b = cloud.createEl("button", { cls: "seren-bubble", text: h.title });
        b.setAttribute("aria-label", h.type);
        b.addEventListener("click", () => {
          input.value = h.id;
          void this.roam(h.id);
        });
      }
      if (!hot.length) body.createDiv({ text: t("noResult"), cls: "seren-empty-list" });
    } catch (e) {
      console.error("[seren] hot 失败", e);
      body.createDiv({ text: t("roamFail"), cls: "seren-loading" });
    }
  }

  private async refreshGraph(): Promise<void> {
    try {
      const r = await this.plugin.api.refresh();
      new Notice(t("refreshDone", { a: String(r.added), u: String(r.updated), d: String(r.deleted) }));
      void this.render();
    } catch (e) {
      console.error("[seren] refresh 失败", e);
      new Notice(t("refreshFail"));
    }
  }

  private async roam(query: string, random = false): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const body = this.bodyEl;
    if (!body) {
      this.busy = false;
      return;
    }
    body.empty();
    body.createDiv({ text: t("loading"), cls: "seren-loading" });
    try {
      const p = this.params;
      const out = await this.plugin.api.roam(
        random ? { random: 1, top: p.top } : { q: query, top: p.top, hops: p.hops, lambda: p.lambda, theta: p.theta },
      );
      this.renderResults(body, out);
    } catch (e) {
      console.error("[seren] roam 失败", e);
      body.empty();
      body.createDiv({ text: t("roamFail"), cls: "seren-loading" });
    } finally {
      this.busy = false;
    }
  }

  private renderResults(body: HTMLElement, out: SerenRoam): void {
    body.empty();
    // 锚点按 match（1-5）→ 度降序；主锚点（showA[0]）= 当前节点（v0.2.0 前端回填）。
    const anchors = (out.anchors ?? []).slice().sort((a, b) => (b.match - a.match) || (b.deg - a.deg));
    if (anchors.length) {
      // 当前节点操作栏：对主锚点提供 详情/相似/关系 三键（参照引擎 Web UI #current-node）
      this.renderCurrentNode(body, anchors[0]);
      const an = body.createDiv({ cls: "seren-anchors" });
      for (const a of anchors) {
        const c = an.createSpan({ cls: "seren-anchor", text: (a.random ? "🎲 " : "") + a.title });
        c.setAttribute("title", a.id);
        c.addEventListener("click", () => void this.roam(a.id));
      }
    }
    if (!out.results || out.results.length === 0) {
      body.createDiv({ text: out.fallback === 0 ? t("noResult") : t("deadendSub"), cls: "seren-empty-list" });
      return;
    }
    for (const item of out.results) body.appendChild(this.card(item));
  }

  /** 当前节点操作栏（v0.2.0）：标题（别名优先）+ 详情/相似/关系 三键。点标题 → 从该节点继续漫游。 */
  private renderCurrentNode(body: HTMLElement, anchor: SerenAnchor): void {
    const bar = body.createDiv({ cls: "seren-current-node" });
    bar.createSpan({ text: t("curNodePh"), cls: "seren-current-node-label" });
    const title = bar.createSpan({ text: anchor.title || anchor.id, cls: "seren-current-node-title" });
    title.setAttribute("title", anchor.id);
    title.addEventListener("click", () => this.roamNode(anchor.id));
    // 主锚点标题若非人读的（如 "人物_002"），尽量显示别名（/api/node aliases，v0.1.15）
    void this.plugin.api
      .node(anchor.id)
      .then((d) => {
        if (d && Array.isArray(d.aliases) && d.aliases.length && title.isConnected) {
          title.setText(d.aliases[0]);
          title.addClass("seren-current-node-alias");
        }
      })
      .catch(() => {});
    this.chip(bar, t("preview"), () => void this.openNodeDetail(anchor.id, anchor.title || anchor.id));
    this.chip(bar, t("similar"), () => void this.openSimilar(anchor.id, anchor.title || anchor.id));
    this.chip(bar, t("relation"), () => void this.openRelation(anchor.id, anchor.title || anchor.id));
  }

  private card(item: SerenRoamItem): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "seren-card";

    // 标题独占一行（可换行）
    const title = wrapper.createDiv({ cls: "seren-card-title", text: item.title || item.id });
    // 副行：类型 + 分数
    const sub = wrapper.createDiv({ cls: "seren-card-sub" });
    sub.createSpan({ cls: "seren-card-type", text: item.type });
    sub.createSpan({ cls: "seren-card-score", text: item.score?.toFixed(2) ?? "" });
    // 路径行
    const meta = wrapper.createDiv({ cls: "seren-card-meta" });
    const pathParts: string[] = [];
    if (item.hops !== undefined && item.hops > 0) pathParts.push(`${item.hops}${t("hopUnit")}`);
    if (item.path && item.path.length) pathParts.push(item.path.join(" → "));
    meta.createSpan({ text: pathParts.join(" · ") || item.id, cls: "seren-card-path" });

    // 操作行
    const actions = wrapper.createDiv({ cls: "seren-card-actions" });
    this.chip(actions, "↺ " + t("roamFromNode"), () => this.roamFrom(item));
    this.chip(actions, t("similar"), () => void this.openSimilar(item.id, item.title || item.id));
    this.chip(actions, t("open"), () => void this.plugin.openInObsidian(item.id, item.uri));

    // 默认：点卡片/标题 → 从该节点继续漫游（web 界面同款）；「打开」chip → 跳回笔记
    wrapper.addEventListener("click", () => this.roamFrom(item));
    return wrapper;
  }

  /** 从该节点继续漫游（并记录 touch）。 */
  private roamFrom(item: SerenRoamItem): void {
    void this.plugin.api.touch(item.id, "").catch(() => {}).then(() => this.roam(item.id));
  }

  private chip(parent: HTMLElement, text: string, onClick: () => void): void {
    const b = parent.createEl("button", { cls: "seren-chip", text });
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
  }

  // ---- 参数 Modal ----
  private async openParams(): Promise<void> {
    let cfg: SerenConfig | null = null;
    try {
      cfg = await this.plugin.api.config();
    } catch {
      /* ignore */
    }
    new SerenParamsModal(this.app, this, cfg).open();
  }

  // ---- 相似 Modal ----
  private async openSimilar(id: string, title: string): Promise<void> {
    let sim: SerenSimilar | null = null;
    try {
      sim = await this.plugin.api.similar(id, 10);
    } catch {
      sim = null;
    }
    new SerenSimilarModal(this.app, this, id, title, sim).open();
  }

  // ---- 节点详情（预览）Modal（v0.2.0 前端回填）----
  private async openNodeDetail(id: string, title: string): Promise<void> {
    let d: SerenNodeDetail | null = null;
    try {
      d = await this.plugin.api.node(id);
    } catch {
      d = null;
    }
    new SerenNodeDetailModal(this.app, this, id, title, d).open();
  }

  // ---- 关系查询 Modal（v0.2.0 前端回填）----
  private openRelation(id: string, title: string): void {
    new SerenRelationModal(this.app, this, id, title).open();
  }

  /** 从某节点继续漫游（当前节点栏标题 / 详情 / 关系 Modal 的路径节点点击复用）。 */
  roamNode(id: string): void {
    void this.roam(id);
  }

  /** 查询两节点关系（供关系 Modal 用）。 */
  relation(from: string, to: string): Promise<SerenRelation> {
    return this.plugin.api.relation(from, to);
  }

  /** 供 Modal 等子对象跳回笔记。 */
  openNode(id: string, uri?: string): void {
    void this.plugin.openInObsidian(id, uri);
  }
}

class SerenParamsModal extends Modal {
  constructor(app: App, private view: SerendipityView, private cfg: SerenConfig | null) {
    super(app);
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: t("paramsTitle"), cls: "seren-modal-title" });
    const defs = [
      { key: "top" as const, label: t("paramTop"), min: 1, max: 60, step: 1 },
      { key: "hops" as const, label: t("paramHops"), min: 1, max: 5, step: 1 },
      { key: "lambda" as const, label: t("paramLambda"), min: 0, max: 1, step: 0.05 },
      { key: "theta" as const, label: t("paramTheta"), min: 0, max: 1, step: 0.05 },
    ];
    const byKey = (k: string) => this.cfg?.params?.find((p) => p.key === k) ?? null;
    for (const d of defs) {
      const p = byKey(d.key);
      const v = this.view.params;
      new Setting(contentEl)
        .setName(p?.label ?? d.label)
        .addSlider((sl) =>
          sl.setLimits(p?.min ?? d.min, p?.max ?? d.max, p?.step ?? d.step).setValue(v[d.key]).onChange((n: number) => {
            v[d.key] = n;
          }),
        );
    }
    new Setting(contentEl).addButton((b) => b.setButtonText(t("done")).onClick(() => this.close()));
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

class SerenSimilarModal extends Modal {
  constructor(app: App, private view: SerendipityView, private nodeId: string, private nodeTitle: string, private sim: SerenSimilar | null) {
    super(app);
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: `${t("similarTitle")} · ${this.nodeTitle}`, cls: "seren-modal-title" });
    if (!this.sim || !this.sim.results?.length) {
      contentEl.createDiv({ text: t("similarEmpty"), cls: "seren-empty-list" });
    } else {
      const list = contentEl.createDiv({ cls: "seren-sim-list" });
      for (const r of this.sim.results) {
        const row = list.createDiv({ cls: "seren-sim-item" });
        const lbl = row.createSpan({ text: r.title, cls: "seren-sim-lbl" });
        lbl.addEventListener("click", () => this.view.openNode(r.id, r.uri));
        const sco = row.createSpan({ text: r.score?.toFixed(3) ?? "", cls: "seren-sim-score" });
        void sco;
      }
    }
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

/** 节点详情（预览）Modal（v0.2.0 前端回填）。参照引擎 Web UI showPreview/detailGroup。 */
class SerenNodeDetailModal extends Modal {
  constructor(
    app: App,
    private view: SerendipityView,
    private nodeId: string,
    private nodeTitle: string,
    private d: SerenNodeDetail | null,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: t("detailTitle"), cls: "seren-modal-title" });
    if (!this.d) {
      contentEl.createDiv({ text: t("detailFail"), cls: "seren-empty-list" });
      return;
    }
    const d = this.d;
    const head = contentEl.createDiv({ cls: "seren-detail-head" });
    head.createEl("span", { text: d.title || d.id, cls: "seren-detail-title" });
    head.createEl("span", { text: d.type || "", cls: "seren-detail-tag" });
    const meta = contentEl.createDiv({ cls: "seren-detail-meta" });
    meta.createSpan({ text: `id: ${d.id}`, cls: "seren-detail-id" });
    if (d.deg !== undefined) {
      meta.createSpan({ text: `${t("deg")} ${d.deg}`, cls: "seren-detail-tag" });
    }
    if (d.text) contentEl.createDiv({ text: d.text, cls: "seren-detail-text" });
    else contentEl.createDiv({ text: t("detailTextNone"), cls: "seren-detail-text seren-detail-empty" });
    contentEl.appendChild(this.detailGroup(t("neighbors"), d.neighbors));
    contentEl.appendChild(this.detailGroup(t("backlinks"), d.backlinks));
  }

  /** 邻居/被引用：按类型分组、去重、点击 → 从该节点继续漫游（关闭详情）。 */
  private detailGroup(label: string, refs: SerenNodeRef[] | undefined): HTMLElement {
    const wrap = document.createElement("div");
    wrap.createDiv({ text: label, cls: "seren-detail-group" });
    const seen = new Set<string>();
    const uniq: SerenNodeRef[] = [];
    for (const r of refs ?? []) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        uniq.push(r);
      }
    }
    if (!uniq.length) {
      wrap.createDiv({ text: t("none"), cls: "seren-detail-empty" });
      return wrap;
    }
    const groups = new Map<string, SerenNodeRef[]>();
    for (const r of uniq) {
      const k = r.type || "note";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    for (const [type, nodes] of groups) {
      const row = wrap.createDiv({ cls: "seren-detail-nodes" });
      row.createSpan({ text: `${type} ·`, cls: "seren-detail-group-type" });
      for (const r of nodes) {
        const p = row.createEl("button", { cls: "seren-node-pill", text: r.title || r.id });
        p.setAttribute("title", r.id);
        p.addEventListener("click", () => {
          this.close();
          this.view.roamNode(r.id);
        });
      }
    }
    return wrap;
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** 关系查询 Modal（v0.2.0 前端回填）。参照引擎 Web UI queryRelation：from 预填当前节点，to 手输。 */
class SerenRelationModal extends Modal {
  private fromEl: HTMLInputElement | null = null;
  private toEl: HTMLInputElement | null = null;
  private resultEl: HTMLElement | null = null;

  constructor(
    app: App,
    private view: SerendipityView,
    private fromId: string,
    private fromTitle: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: t("relTitle"), cls: "seren-modal-title" });
    contentEl.createDiv({ text: t("relHint"), cls: "seren-detail-text seren-detail-empty" });

    new Setting(contentEl)
      .setName(t("relFrom"))
      .addText((tc) => {
        tc.setValue(this.fromTitle || this.fromId);
        this.fromEl = tc.inputEl;
      });
    new Setting(contentEl)
      .setName(t("relTo"))
      .addText((tc) => {
        tc.setPlaceholder(t("relToPh"));
        this.toEl = tc.inputEl;
      });
    new Setting(contentEl).addButton((b) =>
      b.setButtonText(t("relGo")).setCta().onClick(() => void this.query()),
    );
    this.resultEl = contentEl.createDiv({ cls: "seren-rel-result" });
    this.toEl?.focus();
  }

  private async query(): Promise<void> {
    const el = this.resultEl;
    if (!el) return;
    const from = (this.fromEl?.value ?? "").trim();
    const to = (this.toEl?.value ?? "").trim();
    if (!from || !to) {
      el.setText(t("relEmpty"));
      return;
    }
    el.setText(t("loading"));
    let r: SerenRelation;
    try {
      r = await this.view.relation(from, to);
    } catch {
      el.setText(t("relFail"));
      return;
    }
    el.empty();
    this.renderRel(r);
  }

  private renderRel(r: SerenRelation): void {
    const el = this.resultEl!;
    const path = r.path || [];
    const pathNodes = r.path_nodes || [];
    const nodeTitle = (id: string) => pathNodes.find((n) => n.id === id)?.title || id;
    if (path.length) {
      const maze = el.createDiv({ cls: "seren-rel-path" });
      path.forEach((id, i) => {
        if (i > 0) maze.createSpan({ text: " → ", cls: "seren-rel-arrow" });
        const p = maze.createEl("button", { cls: "seren-node-pill", text: nodeTitle(id) });
        p.setAttribute("title", id);
        p.addEventListener("click", () => {
          this.close();
          this.view.roamNode(id);
        });
      });
    } else {
      el.createDiv({ text: t("relNoPath"), cls: "seren-detail-empty" });
    }
    const stats: string[] = [];
    if (r.direct) stats.push(t("relDirect"));
    if (r.affinity !== undefined) stats.push(`affinity ${r.affinity.toFixed(4)}`);
    if (r.activation !== undefined) {
      stats.push(`${t("relStats")} ${r.activation.toFixed(3)}${r.hops >= 0 ? ` (${r.hops}${t("hopUnit")})` : ""}`);
    }
    if (r.ppr_from_to !== undefined) stats.push(`ppr→ ${r.ppr_from_to.toFixed(4)}`);
    if (r.ppr_to_from !== undefined) stats.push(`ppr← ${r.ppr_to_from.toFixed(4)}`);
    if (stats.length) el.createDiv({ text: stats.join(" · "), cls: "seren-rel-stats" });
    const evi = (r.evidence || []).map((ev) => (ev.witnesses || []).join("、")).filter(Boolean);
    if (evi.length) el.createDiv({ text: `${t("relEvidence")}: ${evi.join("；")}`, cls: "seren-rel-stats" });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class SerenDigestModal extends Modal {
  constructor(
    app: App,
    private plugin: SerendipityPlugin,
    private resp: SerenTouchDigestResp,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: t("digestTitle"), cls: "seren-modal-title" });
    const d = this.resp.digest;
    if (!d) {
      contentEl.createDiv({ text: t("digestEmpty"), cls: "seren-empty-list" });
      return;
    }
    const hdr = contentEl.createDiv({ cls: "seren-digest-hdr" });
    hdr.createSpan({ text: `${t("digestSince")} ${d.since}`, cls: "seren-digest-since" });
    hdr.createSpan({ text: `${t("digestTotal")} ${d.total}`, cls: "seren-digest-total" });

    if (d.targets && d.targets.length) {
      contentEl.createDiv({ text: t("digestTargets"), cls: "seren-digest-sub" });
      const list = contentEl.createDiv({ cls: "seren-digest-list" });
      for (const tg of d.targets) {
        const row = list.createDiv({ cls: "seren-digest-row" });
        const lbl = row.createSpan({ text: tg.title, cls: "seren-digest-lbl" });
        lbl.setAttribute("title", t("open"));
        lbl.addEventListener("click", () => this.plugin.openInObsidian(tg.id));
        row.createSpan({ text: String(tg.count), cls: "seren-digest-count" });
      }
    } else {
      contentEl.createDiv({ text: t("digestEmpty"), cls: "seren-empty-list" });
    }

    if (d.sources && d.sources.length) {
      contentEl.createDiv({ text: t("digestSources"), cls: "seren-digest-sub" });
      const list = contentEl.createDiv({ cls: "seren-digest-list" });
      for (const s of d.sources) {
        const row = list.createDiv({ cls: "seren-digest-row" });
        row.createSpan({ text: s.id, cls: "seren-digest-lbl" });
        row.createSpan({ text: String(s.count), cls: "seren-digest-count" });
      }
    }

    new Setting(contentEl)
      .addButton((b) => b.setButtonText(t("digestExport")).onClick(() => void this.plugin.exportDigest(d)))
      .addButton((b) => b.setButtonText(t("done")).onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
