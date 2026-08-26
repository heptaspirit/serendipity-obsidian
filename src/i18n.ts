// ============================================================================
// src/i18n.ts · 插件侧轻量双语（zh/en）。引擎内部 UI 已有自己的 i18n（zh/en）；
// 这里是插件自身文案（占位页/提示/设置说明），跟随 navigator.language。
// ============================================================================

type Dict = Record<string, { zh: string; en: string }>;

const DICT: Dict = {
  title: { zh: "Serendipity Engine", en: "Serendipity Engine" },
  notDetected: { zh: "未检测到引擎", en: "Engine not detected" },
  notFound: { zh: "未找到引擎可执行文件", en: "Engine executable not found" },
  notRunning: { zh: "引擎未启动", en: "Engine not running" },
  serviceNoResp: {
    zh: "检测不到本地引擎服务（http://127.0.0.1:{{port}}）。",
    en: "Local engine service not detected (http://127.0.0.1:{{port}}).",
  },
  foundLabel: { zh: "已找到引擎可执行文件：", en: "Engine executable found:" },
  foundHint: {
    zh: "若仍连不上，请检查端口是否被占用、或核心能否独立启动。",
    en: "If still unreachable, check whether the port is occupied or the core can run standalone.",
  },
  missingHint: {
    zh: "本插件是引擎（seren）的轻客户端，不打包引擎。请在 设置 → Serendipity Engine → 「核心路径」填入 seren.exe 的绝对路径，或把 seren.exe 复制到插件目录、加入 PATH。插件已按以下顺序探测，均未命中：",
    en: "This plugin is a light client of the engine (seren) and does not bundle it. In Settings → Serendipity Engine → \"Core path\", set the absolute path to seren.exe, or copy seren.exe into the plugin folder / add it to PATH. The plugin searched (all missed):",
  },
  startEngine: { zh: "启动引擎", en: "Start engine" },
  stopEngine: { zh: "停止引擎", en: "Stop engine" },
  retry: { zh: "重新检测", en: "Re-check" },
  cannotOpen: {
    zh: "Serendipity: 无法打开「{{id}}」（已尝试 {{targets}}）",
    en: "Serendipity: could not open \"{{id}}\" (tried {{targets}})",
  },
  settingsDesc: {
    zh: "图谱漫游轻客户端：把引擎（seren）的漫游能力嵌进 Obsidian。设置「引擎核心」与「连接」参数。",
    en: "Graph-roam light client: brings the engine (seren) roaming into Obsidian. Configure \"Core\" and \"Connection\".",
  },
  status: { zh: "当前状态", en: "Current status" },
  searchPh: { zh: "搜索笔记名 / 标签 / 任意词…", en: "Search note / tag / keyword…" },
  roamBtn: { zh: "漫游", en: "Roam" },
  diceTitle: { zh: "🎲 随便逛逛", en: "🎲 Roam" },
  loading: { zh: "加载中…", en: "Loading…" },
  noResult: { zh: "没有命中——换个关键词，或点「🎲」随便逛逛", en: "No hits — try another keyword, or press 🎲" },
  deadendSub: { zh: "这个节点比较安静，换个关键词试试", en: "This node is quiet — try another keyword" },
  roamFail: { zh: "查询失败", en: "Query failed" },
  hopUnit: { zh: "跳", en: "hop" },
  roamFromNode: { zh: "继续漫游", en: "continue" },
  openFullUi: { zh: "打开引擎完整界面", en: "Open engine full UI" },
  nodes: { zh: "节点", en: "nodes" },
  edges: { zh: "边", en: "edges" },
  refresh: { zh: "对账刷新", en: "Refresh" },
  params: { zh: "漫游参数", en: "Params" },
  refreshDone: {
    zh: "已刷新：新增 {{a}} · 更新 {{u}} · 删除 {{d}}",
    en: "Refreshed: +{{a}} ~{{u}} -{{d}}",
  },
  refreshFail: { zh: "刷新失败", en: "Refresh failed" },
  paramsTitle: { zh: "⚙ 漫游参数", en: "⚙ Roam params" },
  paramTop: { zh: "结果条数", en: "Results" },
  paramHops: { zh: "最大跳数", en: "Hops" },
  paramLambda: { zh: "激活衰减 λ", en: "Decay λ" },
  paramTheta: { zh: "剪枝阈值 θ", en: "Threshold θ" },
  done: { zh: "完成", en: "Done" },
  open: { zh: "打开", en: "Open" },
  hotTitle: { zh: "🔥 热门节点", en: "🔥 Popular" },
  similar: { zh: "相似", en: "Similar" },
  similarTitle: { zh: "🔗 相似节点", en: "🔗 Similar nodes" },
  similarEmpty: { zh: "没有相似节点", en: "No similar nodes" },
  digestTitle: { zh: "📋 行为信号 digest", en: "📋 Behavior digest" },
  digestSince: { zh: "窗口起点", en: "Window since" },
  digestTotal: { zh: "新增 touch", en: "New touches" },
  digestTargets: { zh: "被反复点击", en: "Top clicked" },
  digestSources: { zh: "来源词", en: "Source queries" },
  digestEmpty: { zh: "暂无 digest", en: "No digest yet" },
  digestExport: { zh: "导出为笔记", en: "Export as note" },
  mcpStatusReady: { zh: "🔌 MCP 就绪 · 点击复制", en: "🔌 MCP ready · click to copy" },
  copyMcpConfig: { zh: "一键复制 MCP 配置", en: "Copy MCP config" },
};

const LANG = (navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en";

/** 取文案；可选 {{var}} 占位符替换。 */
export function t(key: string, vars?: Record<string, string>): string {
  let s = DICT[key]?.[LANG] ?? DICT[key]?.zh ?? key;
  if (vars) for (const k in vars) s = s.replace("{{" + k + "}}", vars[k]);
  return s;
}

export function isZh(): boolean {
  return LANG === "zh";
}
