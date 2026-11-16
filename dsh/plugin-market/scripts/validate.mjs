#!/usr/bin/env node
// 文件职责：校验插件包与生成的 registry 是否一致，供 CI 与发布前自查。
// 检查项：集合一致、版本一致、install 命令一致、分类合法、必需文件存在。
// 关系：读取 dsh/plugins/*、registry/plugins.json 与 market.config.json；
// 生成逻辑在 build-registry.mjs。
// 约定：出现 error 以退出码 1 结束；warning 只提示。修复一般是重跑生成脚本，不是手改生成物。
// 注意：零插件时视为通过，这样新仓库首次 CI 不会因为空市场而失败。

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKET_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(MARKET_DIR, '../..');
const CONFIG = JSON.parse(readFileSync(join(MARKET_DIR, 'market.config.json'), 'utf8'));
const PLUGINS_DIR = join(ROOT, CONFIG.pluginsDir);

const errors = [];
const warnings = [];

const err = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

/** 先决条件：registry 必须已经生成。 */
function readRegistry() {
  const file = join(MARKET_DIR, 'registry/plugins.json');
  if (!existsSync(file)) {
    console.error('[validate] 缺少 registry/plugins.json，先运行 pnpm run registry');
    process.exit(1);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** 列出插件目录，跳过隐藏项与非目录。 */
function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

/** 收集磁盘上的插件包，解析失败的包记为 error 而不是跳过。 */
function readPackages() {
  return listDirs(PLUGINS_DIR)
    .map((dir) => {
      const manifestPath = join(PLUGINS_DIR, dir, 'package.json');
      if (!existsSync(manifestPath)) {
        err(`dsh/plugins/${dir}: 缺少 package.json`);
        return null;
      }
      try {
        return { dir, pkg: JSON.parse(readFileSync(manifestPath, 'utf8')) };
      } catch (error) {
        err(`dsh/plugins/${dir}: package.json 解析失败（${error.message}）`);
        return null;
      }
    })
    .filter(Boolean);
}

function validateRegistryShape(registry) {
  if (!Array.isArray(registry.plugins)) {
    err('registry.plugins 不是数组');
    return;
  }
  if (registry.count !== registry.plugins.length) {
    err(`registry.count=${registry.count} 与实际条目 ${registry.plugins.length} 不一致`);
  }
  if (Number.isNaN(Date.parse(registry.updated))) {
    err(`registry.updated 不是合法时间：${registry.updated}`);
  }
  if (new Set(registry.plugins.map((plugin) => plugin.name)).size !== registry.plugins.length) {
    err('registry 中存在重复的插件名');
  }
}

function validatePackage({ dir, pkg }, entry) {
  if (!pkg.name || !pkg.version) {
    err(`dsh/plugins/${dir}: 缺少 name 或 version`);
    return;
  }
  if (entry.version !== pkg.version) {
    err(`${pkg.name}: registry 版本 ${entry.version} 与 package.json 版本 ${pkg.version} 不一致，运行 pnpm run registry`);
  }
  if (entry.install !== `dsh plugin add ${pkg.name}@${pkg.version}`) {
    err(`${pkg.name}: install 命令与包名/版本不一致，运行 pnpm run registry`);
  }
  if (!CONFIG.categories.includes(entry.category)) {
    err(`${pkg.name}: 分类 ${entry.category} 不在 market.config.json 的 categories 内`);
  }
  if (!entry.description || !entry.description.zh) {
    warn(`${pkg.name}: 缺少中文摘要，市场卡片会只显示英文`);
  }

  const market = (pkg.dsh && pkg.dsh.market) || {};
  const patch = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch;
  if (!patch) {
    err(`${pkg.name}: package.json 缺少 dsh.bundle.patch，DSH 无法把它当作 bundle 安装`);
  } else if (!existsSync(join(PLUGINS_DIR, dir, patch))) {
    err(`${pkg.name}: dsh.bundle.patch 指向的 ${patch} 不存在`);
  }

  const icon = market.icon || 'assets/icon.svg';
  if (!existsSync(join(PLUGINS_DIR, dir, icon))) {
    err(`${pkg.name}: 图标 ${icon} 不存在`);
  }

  if (!Array.isArray(pkg.files) || !pkg.files.includes('lib')) {
    warn(`${pkg.name}: package.json 的 files 白名单缺少 lib，npm pack 可能带错文件`);
  }

  if (!existsSync(join(PLUGINS_DIR, dir, 'LICENSE'))) {
    warn(`${pkg.name}: 缺少 LICENSE`);
  }
}

function main() {
  const registry = readRegistry();
  validateRegistryShape(registry);
  if (!Array.isArray(registry.plugins)) {
    report();
    return;
  }

  const packages = readPackages();
  const entries = new Map(registry.plugins.map((plugin) => [plugin.name, plugin]));

  for (const item of packages) {
    const name = item.pkg.name;
    if (!name) continue;
    const entry = entries.get(name);
    if (!entry) {
      err(`${name}: 磁盘上有包但 registry 未收录，运行 pnpm run registry`);
      continue;
    }
    validatePackage(item, entry);
  }

  const diskNames = new Set(packages.map((item) => item.pkg.name).filter(Boolean));
  for (const name of entries.keys()) {
    if (!diskNames.has(name)) {
      err(`${name}: registry 有条目但 dsh/plugins 下没有对应包`);
    }
  }

  report();
}

/** 汇总输出；有 error 时以 1 退出。 */
function report() {
  for (const message of warnings) console.warn(`[validate] warning: ${message}`);
  if (errors.length) {
    for (const message of errors) console.error(`[validate] error: ${message}`);
    console.error(`[validate] 失败：${errors.length} 个错误，${warnings.length} 条警告`);
    process.exit(1);
  }
  console.log(`[validate] 通过：插件与 registry 一致（${warnings.length} 条警告）`);
}

main();
