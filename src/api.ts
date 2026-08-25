// ============================================================================
// src/api.ts · Seren REST 客户端（插件侧）
//
// 用 Obsidian 的 requestUrl()（Electron net.request，本地 http，无 CORS 限制），
// 非全局 fetch（Electron 沙箱内 fetch 对非回环也可能被代理）。所有 /api/* 带
// X-Seren-Token 鉴权；GET / 页面（iframe 用）由引擎注入 token，不需要这里处理。
//
// 类型以 src/seren-api.d.ts（= 引擎 docs/api-contract.md）为准。
// ============================================================================
import { requestUrl } from "obsidian";
import type {
  SerenStats,
  SerenRoam,
  SerenRelation,
  SerenConfig,
  SerenRefresh,
  SerenTouch,
  SerenSimilar,
  SerenNodeDetail,
  SerenTouchStats,
  SerenCommunities,
  SerenSuggestLinks,
  SerenHot,
} from "./seren-api";

export interface SerenConnection {
  port: number;
  token: string;
}

export class SerenError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "SerenError";
  }
}

export class SerenApi {
  private c: SerenConnection;

  constructor(port: number, token: string) {
    this.c = { port, token };
  }

  setConnection(port: number, token: string) {
    this.c = { port, token };
  }

  private url(path: string): string {
    return `http://127.0.0.1:${this.c.port}${path}`;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await requestUrl({
      url: this.url(path),
      method: "GET",
      headers: { "X-Seren-Token": this.c.token },
      throw: false,
    });
    if (res.status >= 300) {
      throw new SerenError(`引擎返回 ${res.status}: ${res.text}`, res.status);
    }
    return res.json as T;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await requestUrl({
      url: this.url(path),
      method: "POST",
      headers: {
        "X-Seren-Token": this.c.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
      throw: false,
    });
    if (res.status >= 300) {
      throw new SerenError(`引擎返回 ${res.status}: ${res.text}`, res.status);
    }
    return res.json as T;
  }

  /** 健康探测：/api/stats 通且带 token → true。用于「发现引擎」与启动后等待。 */
  async ping(): Promise<boolean> {
    try {
      await this.get<SerenStats>("/api/stats");
      return true;
    } catch {
      return false;
    }
  }

  /** 读取库规模 + 版本（D6 版本契约比对用）。 */
  stats(): Promise<SerenStats> {
    return this.get<SerenStats>("/api/stats");
  }

  hot(n = 20): Promise<SerenHot> {
    return this.get<SerenHot>(`/api/hot?n=${n}`);
  }

  roam(params: Record<string, string | number>): Promise<SerenRoam> {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    );
    return this.get<SerenRoam>(`/api/roam?${qs.toString()}`);
  }

  relation(from: string, to: string): Promise<SerenRelation> {
    return this.get<SerenRelation>(
      `/api/relation?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
  }

  config(): Promise<SerenConfig> {
    return this.get<SerenConfig>("/api/config");
  }

  refresh(limit = 50): Promise<SerenRefresh> {
    return this.post<SerenRefresh>(`/api/refresh?limit=${limit}`, {});
  }

  /** 反馈埋点：仅记录不演化（引擎红线）。失败不抛，调用方按需处理。 */
  touch(target: string, from?: string): Promise<SerenTouch> {
    return this.post<SerenTouch>("/api/touch", { target, from: from ?? "" });
  }

  similar(id: string, k = 10): Promise<SerenSimilar> {
    return this.get<SerenSimilar>(
      `/api/similar?id=${encodeURIComponent(id)}&k=${k}`,
    );
  }

  node(id: string): Promise<SerenNodeDetail> {
    return this.get<SerenNodeDetail>(`/api/node?id=${encodeURIComponent(id)}`);
  }

  touchStats(n = 10): Promise<SerenTouchStats> {
    return this.get<SerenTouchStats>(`/api/touch/stats?n=${n}`);
  }

  communities(resolution?: number, seed?: number): Promise<SerenCommunities> {
    const qs: string[] = [];
    if (resolution !== undefined) qs.push(`resolution=${resolution}`);
    if (seed !== undefined) qs.push(`seed=${seed}`);
    return this.get<SerenCommunities>(
      `/api/communities${qs.length ? "?" + qs.join("&") : ""}`,
    );
  }

  suggestLinks(k = 50): Promise<SerenSuggestLinks> {
    return this.get<SerenSuggestLinks>(`/api/suggest-links?k=${k}`);
  }
}
