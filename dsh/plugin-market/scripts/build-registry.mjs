#!/usr/bin/env node
// 文件职责：扫描 dsh/plugins/* 的包元数据，生成 dsh/plugin-market/registry/plugins.json。
// 关系：字段契约对齐 awesome-dsh-plugin 的 plugins.json，DSH 市场页与 dshmarket 客户端
// 可直接消费（DSH 侧通过 DSHM_REGISTRY_URL 指向本文件）；一致性校验由同目录 validate.mjs 负责。
// 约定：registry 是生成物，禁止手改；插件的市场展示信息写在各自 package.json 的 `dsh.market`。
// 注意：生成的 URL 假设插件位于 <repoUrl>/tree/<branch>/<pluginsDir>/<dir>，
// 调整仓库结构时同步改 market.config.json，不要在这里硬编码路径。

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKET_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(MARKET_DIR, '../..');
const CONFIG = JSON.parse(readFileSync(join(MARKET_DIR, 'market.config.json'), 'utf8'));
const PLUGINS_DIR = join(ROOT, CONFIG.pluginsDir);
const OUT_PATH = join(MARKET_DIR, 'registry/plugins.json');

const warnings = [];

function warn(message) {
  warnings.push(message);
}

/** 列出插件目录，跳过隐藏项与非目录。 */
function listPluginDirs() {
  if (!existsSync(PLUGINS_DIR)) return [];
  return readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

/** 把一个插件目录的元数据转成 registry 条目；元数据不全时告警并跳过。 */
function buildEntry(dir) {
  const manifestPath = join(PLUGINS_DIR, dir, 'package.json');
  if (!existsSync(manifestPath)) {
    warn(`${dir}: 缺少 package.json，已跳过`);
    return null;
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    warn(`${dir}: package.json 解析失败（${error.message}），已跳过`);
    return null;
  }
  if (!pkg.name || !pkg.version) {
    warn(`${dir}: package.json 缺少 name 或 version，已跳过`);
    return null;
  }

  const market = (pkg.dsh && pkg.dsh.market) || {};
  const summary = market.summary || {};
  const description = {
    en: summary.en || pkg.description || '',
    zh: summary.zh || '',
  };
  if (!description.zh) {
    warn(`${pkg.name}: dsh.market.summary.zh 为空，市场卡片会缺中文说明`);
  }

  const category = market.category || 'other';
  if (!CONFIG.categories.includes(category)) {
    warn(`${pkg.name}: 分类 ${category} 不在 market.config.json 的 categories 内`);
  }

  const patch = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch;
  if (!patch) {
    warn(`${pkg.name}: 缺少 dsh.bundle.patch`);
  } else if (!existsSync(join(PLUGINS_DIR, dir, patch))) {
    warn(`${pkg.name}: dsh.bundle.patch 指向的 ${patch} 不存在`);
  }

  const icon = market.icon || 'assets/icon.svg';
  if (!existsSync(join(PLUGINS_DIR, dir, icon))) {
    warn(`${pkg.name}: 图标 ${icon} 不存在`);
  }

  return {
    name: pkg.name,
    owner: CONFIG.owner,
    url: `${CONFIG.repoUrl}/tree/${CONFIG.branch}/${CONFIG.pluginsDir}/${dir}`,
    category,
    description,
    npm: pkg.name,
    version: pkg.version,
    capabilities: Array.isArray(market.capabilities) ? market.capabilities : [],
    install: `dsh plugin add ${pkg.name}@${pkg.version}`,
    icon: `${CONFIG.iconBaseUrl}/${CONFIG.pluginsDir}/${dir}/${icon}`,
    added: market.added || null,
  };
}

function main() {
  const plugins = listPluginDirs()
    .map(buildEntry)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  const registry = {
    name: CONFIG.name,
    url: CONFIG.repoUrl,
    source: `github:${CONFIG.repo}`,
    updated: new Date().toISOString(),
    count: plugins.length,
    categories: [...CONFIG.categories].sort(),
    plugins,
  };

  writeFileSync(OUT_PATH, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`[build-registry] ${plugins.length} 个插件 → ${relative(ROOT, OUT_PATH)}`);

  if (warnings.length) {
    console.warn(`[build-registry] ${warnings.length} 条警告：`);
    for (const message of warnings) console.warn(`  - ${message}`);
  }
}

main();
