// ============================================================================
// src/engine-download.ts · 引擎二进制下载（GitHub Releases）
//
// 引擎发布产物命名（见引擎仓库 .github/workflows/release.yml 矩阵）：
//   seren-<tag>-<os>-<arch>，windows 加 .exe
//   os: windows / linux / darwin；arch: amd64 / arm64（windows 只构建 amd64）
// 插件用它做「一键下载/更新引擎核心」——唯一的外网出口，仅用户按钮触发
// （经设置页二次确认），只拉 release 元数据与二进制，绝不带出 vault 数据。
// ============================================================================
import { requestUrl } from "obsidian";

export const ENGINE_REPO = "heptaspirit/serendipity-engine";

export interface SerenReleaseInfo {
  tag: string; // 如 "v0.2.1"
  name: string; // 资产文件名，如 "seren-v0.2.1-windows-amd64.exe"
  size: number; // 字节
  url: string; // browser_download_url（github.com → 302 → objects.githubusercontent.com）
}

/** 当前平台的发布资产 os/arch（与 release.yml 矩阵一致）；无对应构建 → null。 */
export function assetNameForPlatform(): { os: string; arch: string } | null {
  const os =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "darwin"
        : process.platform === "linux"
          ? "linux"
          : null;
  const arch =
    process.arch === "x64"
      ? "amd64"
      : process.arch === "arm64"
        ? "arm64"
        : null;
  if (!os || !arch) return null;
  // windows 只构建 amd64（release.yml 矩阵）；win-arm 回退 amd64（系统 x64 模拟可跑）
  if (os === "windows" && arch !== "amd64") return { os, arch: "amd64" };
  return { os, arch };
}

/** 查最新 release 并挑出当前平台的资产；无匹配 → 抛错（含原因）。 */
export async function resolveLatestDownload(): Promise<SerenReleaseInfo> {
  const resp = await requestUrl({
    url: `https://api.github.com/repos/${ENGINE_REPO}/releases/latest`,
    method: "GET",
    headers: { Accept: "application/vnd.github+json" },
    throw: false,
  });
  if (resp.status >= 300) {
    throw new Error(`GitHub 返回 ${resp.status}`);
  }
  const rel = resp.json as {
    tag_name?: string;
    assets?: { name: string; browser_download_url: string; size: number }[];
  };
  const tag = rel.tag_name;
  if (!tag || !Array.isArray(rel.assets)) throw new Error("release 数据异常");
  const plat = assetNameForPlatform();
  if (!plat) {
    throw new Error(
      "当前平台没有对应引擎构建（支持 windows-amd64 / linux-amd64 / linux-arm64 / darwin-amd64 / darwin-arm64）",
    );
  }
  const want = `seren-${tag}-${plat.os}-${plat.arch}` + (plat.os === "windows" ? ".exe" : "");
  const asset = rel.assets.find((a) => a.name === want);
  if (!asset) throw new Error(`release ${tag} 缺少资产 ${want}`);
  return { tag, name: asset.name, size: asset.size, url: asset.browser_download_url };
}

/** 下载 release 二进制 → ArrayBuffer。 */
export async function downloadRelease(info: SerenReleaseInfo): Promise<ArrayBuffer> {
  const resp = await requestUrl({
    url: info.url,
    method: "GET",
    headers: { Accept: "application/octet-stream" },
    throw: false,
  });
  if (resp.status >= 300) {
    throw new Error(`下载失败：GitHub 返回 ${resp.status}`);
  }
  return resp.arrayBuffer;
}
