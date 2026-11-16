#!/usr/bin/env node
// 文件职责：把 src/ 的 TypeScript 编译成 DSH 可加载的两个产物。
//   lib/index.js  —— Host 半部分，标准 ESM，由 Cordis Loader 直接 import；
//   lib/client.js —— Client 半部分，window.__ModuleLoader__.load 工厂包装，由 Web 端模块加载器装载。
// 关系：package.json 的 exports 指向这两个产物；改了 src/ 就必须重跑 pnpm build。
// 约定：Client 产物必须保持「只注册工厂、不立刻执行」的形态——副作用都留在 apply(ctx) 里；
//       react / react-dom / react-jsx-runtime 由页面模块表提供（DSH web 的 staticModules 种子），
//       所以所有裸模块导入一律 external，不能打进产物，否则页面上会出现第二份 React。
// 注意：这里只做语法级转译与打包，不做类型检查；类型校验由 `pnpm typecheck` 负责。

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'lib')
const BANNER = '/* 生成物：由 scripts/build.mjs 从 src/ 编译而来，不要手改。 */'

/** 读取插件清单，用包名做 Client 模块表的 id。 */
async function readManifest() {
  return JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'))
}

/** 编译 Host 半部分：逐文件转译成 ESM，保留相对导入。 */
async function buildHost() {
  await build({
    absWorkingDir: ROOT,
    entryPoints: ['src/index.ts'],
    outfile: 'lib/index.js',
    bundle: false,
    format: 'esm',
    platform: 'neutral',
    target: ['node22'],
    banner: { js: BANNER },
    logLevel: 'warning',
  })
}

/** 打包 Client 半部分，并套上模块加载器的工厂外壳。 */
async function buildClient(packageName) {
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: ['src/client/index.ts'],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: ['es2022'],
    jsx: 'automatic',
    // 裸模块请求全部交给页面的模块表（react、react/jsx-runtime 等都在种子里）。
    packages: 'external',
    logLevel: 'warning',
  })
  // esbuild 的 "use strict" 在最前面，但工厂函数里它前面还有声明，会被当成普通语句，
  // 所以这里把它挪到工厂体的第一条语句，严格模式才真正生效。
  const bundle = result.outputFiles[0].text.replace(/^"use strict";\n/, '')
  const wrapped = [
    `${BANNER}\nwindow.__ModuleLoader__.load({id:\`${packageName}\`,factory:require=>{"use strict";`,
    'var module={exports:{}};var exports=module.exports;',
    bundle,
    'return module.exports}});',
    '',
  ].join('')
  await writeFile(resolve(OUT_DIR, 'client.js'), wrapped, 'utf8')
}

async function main() {
  const manifest = await readManifest()
  await mkdir(OUT_DIR, { recursive: true })
  await buildHost()
  await buildClient(manifest.name)
  console.log(`[build] ${manifest.name} → lib/index.js, lib/client.js`)
}

main().catch((error) => {
  console.error('[build] 失败：', error)
  process.exitCode = 1
})
