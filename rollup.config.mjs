// ============================================================================
// rollup.config.mjs · Serendipity Engine Obsidian 插件构建
//
// 用 Rollup + @rollup/plugin-typescript（tsc API 进程内编译）打包 src/main.ts →
// 单文件 main.js（Obsidian 社区插件三件套：main.js / manifest.json / styles.css）。
// 选 Rollup 而非 esbuild：esbuild 以常驻 service 进程经 stdio 管道通信，在受限
// 执行环境（沙箱禁止管道子进程）会 EPERM；Rollup 纯 JS、走内存，环境更通用。
// obsidian/electron/node 内建模块一律 external，由 Obsidian 运行时提供。
// ============================================================================
import typescript from "@rollup/plugin-typescript";

const nodeBuiltins = [
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "events",
  "fs",
  "net",
  "os",
  "path",
  "process",
  "stream",
  "tls",
  "util",
  "url",
];

const watch = process.argv.includes("--watch");

export default {
  input: "src/main.ts",
  output: {
    file: "main.js",
    format: "cjs",
    exports: "default", // Obsidian 需要 module.exports = 插件类
    sourcemap: "inline",
    banner: `/* Serendipity Engine · Obsidian thin-shell plugin — built ${new Date().toISOString()} */`,
  },
  external: ["obsidian", "electron", ...nodeBuiltins],
  plugins: [
    typescript({ tsconfig: "./tsconfig.json" }),
  ],
};
