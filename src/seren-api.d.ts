// ============================================================================
// seren-api.d.ts · Serendipity Engine REST 契约（插件侧副本）
//
// 依据：serendipity-engine/docs/api-contract.md（v0.2.0）。引擎与插件仓库的
// **唯一共享物**——改 API 必须同步两侧（引擎 api-contract.md ←→ 本文件）。
// 插件侧只是类型描述，不含任何实现；具体网络代码见 src/api.ts。
//
// 注意：本文描述的行为以引擎 v0.2.0 为准，字段改动要在此登记。
// base：`http://127.0.0.1:<port>`（serve 默认 8910，始终绑定 127.0.0.1）。
// 鉴权：所有 /api/* 请求带 `X-Seren-Token: <token>`（或 ?token=）；GET / 页面
// 本体不需要 token（引擎注入 __SEREN_TOKEN__ 到页内，iframe 无感）。
// ============================================================================

/** /api/stats · 库规模 */
export interface SerenStats {
  configured: boolean; // v0.2.0：是否已配库（v0.1.15 无库启动 → false；插件 spawn 带 vault → true）
  nodes: number;
  edges: number;
  version: string; // 引擎版本，如 "v0.2.0"
  revision: number; // 图版本号：自动/手动刷新后 +1
  is_pending: boolean; // 库有变化待刷新
  digest_available: boolean; // v0.1.14：有未读 touch digest（§3.7，被动提醒开关）
  dangling: number; // 悬空链接总条数
  dangling_refs: { source: string; target: string }[]; // 悬空明细（上限 50）
}

/** /api/hot 元素 */
export interface SerenHotItem {
  id: string;
  title: string;
  type: string;
  deg: number;
}
export type SerenHot = SerenHotItem[];

/** /api/roam 响应 */
export interface SerenAnchor {
  id: string;
  title: string;
  type: string;
  match: number; // 1-5：like/tag/alias/title/exact
  deg: number;
  random: boolean;
}
export interface SerenRoamItem {
  id: string;
  title: string;
  type: string;
  score: number;
  ppr: number;
  act: number;
  hops: number;
  path: string[]; // 白盒激活路径 A → B → C
  uri: string; // 跳转，空=不提供
}
export interface SerenFallbackHit {
  id: string;
  title: string;
  type: string;
  count: number;
  uri: string;
}
export interface SerenRoam {
  query: string;
  source: string;
  vault: string;
  anchors: SerenAnchor[];
  results: SerenRoamItem[];
  fallback: 0 | 1 | 2; // 0 正常簇 / 1 无锚点全文降级 / 2 簇空全文降级
  fallback_hits: SerenFallbackHit[];
}

/** /api/relation 响应 */
export interface SerenNodeRef {
  id: string;
  title: string;
  type: string;
}
export interface SerenRelation {
  from: SerenNodeRef;
  to: SerenNodeRef;
  direct: boolean;
  hops: number; // -1 = 不可达
  path: string[];
  affinity: number;
  ppr_from_to: number;
  ppr_to_from: number;
  activation: number;
  evidence: { a: string; b: string; witnesses: string[] }[];
  path_nodes: { id: string; title: string }[];
}

/** /api/config 响应 */
export interface SerenTuneParam {
  key: string;
  label: string;
  type: "int" | "float";
  min: number;
  max: number;
  step: number;
  default: number;
  group: string;
  hint: string;
}
export interface SerenConfig {
  params: SerenTuneParam[];
  source: string;
  vault: string;
  version: string;
  nodes: number;
  edges: number;
}

/** /api/refresh 响应 */
export interface SerenChange {
  id: string;
  title: string;
  kind: "added" | "updated" | "deleted";
  type: string;
  fields?: string[];
  added_refs?: number;
  removed_refs?: number;
}
export interface SerenRename {
  old_id: string;
  new_id: string;
  title: string;
  type: string;
}
export interface SerenRefresh {
  added: number;
  updated: number;
  deleted: number;
  renamed: number;
  unchanged: number;
  duration_ms: number;
  nodes: number;
  changes: SerenChange[];
  renames: SerenRename[];
}

/** /api/touch 响应 */
export interface SerenTouch {
  ok: boolean;
}

/** /api/similar 响应 */
export interface SerenSimilarItem {
  id: string;
  title: string;
  type: string;
  score: number; // Adamic-Adar
  shared: string[];
  shared_titles: string[];
  uri: string;
}
export interface SerenSimilar {
  id: string;
  results: SerenSimilarItem[];
}

/** /api/node 响应 */
export interface SerenNodeDetail {
  id: string;
  title: string;
  type: string;
  aliases?: string[];
  tags?: string[];
  text: string; // 正文摘要（截断 200 字符）
  deg: number;
  neighbors: SerenNodeRef[];
  backlinks: SerenNodeRef[];
}

/** /api/touch/stats 响应 */
export interface SerenTouchStats {
  total: number;
  targets: { id: string; count: number }[];
  sources: { id: string; count: number }[];
}

/** /api/communities 响应 */
export interface SerenCommunity {
  id: number;
  size: number;
  nodes: string[];
  titles: string[];
}
export interface SerenCommunities {
  modularity: number;
  community_count: number;
  membership: Record<string, number>;
  communities: SerenCommunity[];
}

/** /api/suggest-links 响应 */
export interface SerenSuggestLink {
  a: string;
  b: string;
  a_title: string;
  b_title: string;
  score: number; // Borda 聚合分
  algorithms: string[]; // aa / jaccard / ra
  shared: string[];
  a_uri: string;
  b_uri: string;
}
export interface SerenSuggestLinks {
  count: number;
  results: SerenSuggestLink[];
}

/** /api/touch/digest · 最新 touch digest（v0.1.14，引擎 §3.7） */
export interface SerenDigestTarget {
  id: string; // 节点 ID（Obsidian 下 = 文件名去 .md）
  title: string; // 标题（引擎已解析）
  count: number; // 窗口内点击次数
}
export interface SerenDigest {
  id: string; // 唯一 id（unix 纳秒）—— ack 用它
  generated_at: number; // 生成时间（unix 秒）
  window_start: number; // 窗口起点（上次 digest 时间，unix 秒）
  since: string; // 窗口起点人读串（展示用）
  total: number; // 窗口新增 touch 数
  targets: SerenDigestTarget[]; // TopN（幽灵过滤 + 标题）
  sources: { id: string; count: number }[]; // TopN 来源词
}
export interface SerenTouchDigestResp {
  digest: SerenDigest | null; // 无 digest → null
  available: boolean; // 有未读 digest
}

/** /api/mcp/status · serve 内嵌 MCP 状态（v0.2.0，§15）。旧引擎（无 /api/mcp）→ 端点 404。 */
export interface SerenMcpStatus {
  enabled: boolean; // /mcp 是否可访问（启停开关，内存态——重启 serve 后回默认开）
  configured: boolean; // 是否已配库（未配库时 MCP 工具给引导，无数据）
  tools: number; // 工具数（v0.2.0 = 9）
  transport?: string; // "streamable-http"
  endpoint?: string; // "/mcp"
}

