#!/usr/bin/env node
/**
 * 文件职责：扫描 dsh/plugins/*，生成 DSH “发现”页可直接消费的 format-1 索引
 * dsh/plugin-market/registry/index.json。
 *
 * 关系：market.config.json 定义市场展示元数据与安装来源；各个插件 package.json 和
 * locale/*.json 提供版本、标题、描述及能力信息。validate.mjs 独立校验本脚本产物，
 * build-site.mjs 再把它复制进静态站点。
 *
 * 约定：registry/index.json 是生成物，禁止手改。当前默认安装来源为 Git，因此版本固定到
 * 当前 HEAD 的完整 commit；GitHub Actions 每次部署都会按被推送的 commit 重新生成索引。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKET_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(MARKET_DIR, '../..');
const CONFIG = JSON.parse(readFileSync(join(MARKET_DIR, 'market.config.json'), 'utf8'));
const PLUGINS_DIR = join(ROOT, CONFIG.pluginsDir);
const OUT_PATH = join(MARKET_DIR, 'registry/index.json');

const warnings = [];

function warn(message) {
  warnings.push(message);
}

/** 读取固定 40 位 commit；CI 使用 GITHUB_SHA，本地回落到当前 HEAD。 */
function readSourceCommit() {
  const fromEnvironment = process.env.MARKET_SOURCE_COMMIT || process.env.GITHUB_SHA;
  if (fromEnvironment && /^[0-9a-f]{40}$/.test(fromEnvironment)) return fromEnvironment;
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
}

/** 读取 commit 时间作为发布与排序时间；SOURCE_DATE_EPOCH 可覆盖以保证可复现构建。 */
function readPublishTimestamp(commit) {
  const fromEnvironment = process.env.SOURCE_DATE_EPOCH;
  if (fromEnvironment && /^\d+$/.test(fromEnvironment)) return Number(fromEnvironment);
  return Number(execFileSync('git', ['show', '-s', '--format=%ct', commit], { cwd: ROOT, encoding: 'utf8' }).trim());
}

/** 读取 locale/<language>.json 中的展示元数据。 */
function readLocaleMeta(pluginDir, language) {
  const localePath = join(pluginDir, 'locale', `${language}.json`);
  if (!existsSync(localePath)) {
    warn(`${relative(ROOT, pluginDir)}: 缺少 locale/${language}.json`);
    return {};
  }
  try {
    return JSON.parse(readFileSync(localePath, 'utf8')).meta || {};
  } catch (error) {
    warn(`${relative(ROOT, pluginDir)}: locale/${language}.json 解析失败（${error.message}）`);
    return {};
  }
}

/** 生成 format-1 本地化文本；en 是协议必填项。 */
function localizedText(en, zh) {
  return { en: en || zh || '', ...(zh ? { zh } : {}) };
}

/** 列出插件目录，跳过隐藏项与非目录。 */
function listPluginDirs() {
  if (!existsSync(PLUGINS_DIR)) return [];
  return readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

/** 把市场配置的安装来源转换为 format-1 source。 */
function buildSource(pluginPath, commit) {
  if (CONFIG.source && CONFIG.source.type === 'npm') {
    return {
      type: 'npm',
      ...(CONFIG.source.registry ? { registry: CONFIG.source.registry } : {}),
    };
  }
  return {
    type: 'git',
    url: CONFIG.repoUrl,
    commit,
    path: pluginPath,
  };
}

/** 把插件目录转换成 format-1 索引条目；必需元数据不完整时跳过。 */
function buildEntry(dir, commit, publishTimestamp) {
  const pluginPath = `${CONFIG.pluginsDir}/${dir}`;
  const pluginDir = join(ROOT, pluginPath);
  const manifestPath = join(pluginDir, 'package.json');
  if (!existsSync(manifestPath)) {
    warn(`${pluginPath}: 缺少 package.json，已跳过`);
    return null;
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    warn(`${pluginPath}: package.json 解析失败（${error.message}），已跳过`);
    return null;
  }
  if (!pkg.name || !pkg.version) {
    warn(`${pluginPath}: package.json 缺少 name 或 version，已跳过`);
    return null;
  }

  const market = (pkg.dsh && pkg.dsh.market) || {};
  const summary = market.summary || {};
  const zhMeta = readLocaleMeta(pluginDir, 'zh');
  const enMeta = readLocaleMeta(pluginDir, 'en');
  const category = market.category || 'other';

  if (!CONFIG.metadata.categories[category]) {
    warn(`${pkg.name}: 分类 ${category} 未在 market.config.json 中声明`);
  }

  const labels = Array.isArray(market.capabilities) ? market.capabilities : [];
  for (const label of labels) {
    if (!CONFIG.metadata.labels[label]) warn(`${pkg.name}: 标签 ${label} 未在 market.config.json 中声明`);
  }

  const patch = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch;
  if (!patch) {
    warn(`${pkg.name}: 缺少 dsh.bundle.patch`);
  } else if (!existsSync(join(pluginDir, patch))) {
    warn(`${pkg.name}: dsh.bundle.patch 指向的 ${patch} 不存在`);
  }

  const icon = market.icon || 'assets/icon.svg';
  if (!existsSync(join(pluginDir, icon))) warn(`${pkg.name}: 图标 ${icon} 不存在`);

  const addedTimestamp = Number.isFinite(Date.parse(market.added)) ? Math.floor(Date.parse(market.added) / 1000) : publishTimestamp;
  const versions = [{
    version: pkg.version,
    publishTimestamp,
    source: buildSource(pluginPath, commit),
    engines: pkg.engines && pkg.engines.dsh ? { dsh: pkg.engines.dsh } : {},
  }];

  return {
    name: pkg.name,
    title: localizedText(enMeta.title, zhMeta.title),
    description: localizedText(
      summary.en || enMeta.description || pkg.description,
      summary.zh || zhMeta.description,
    ),
    icon: `${CONFIG.rawContentBaseUrl}/${commit}/${pluginPath}/${icon}`,
    author: CONFIG.author,
    homepage: `${CONFIG.repoUrl}/tree/${CONFIG.branch}/${pluginPath}`,
    repository: { url: CONFIG.repoUrl, directory: pluginPath },
    metadata: {
      category,
      keywords: Array.isArray(pkg.keywords) ? pkg.keywords : [],
      labels,
      sortKeys: { added: addedTimestamp },
    },
    versions,
  };
}

function main() {
  const commit = readSourceCommit();
  const publishTimestamp = readPublishTimestamp(commit);
  const plugins = listPluginDirs()
    .map((dir) => buildEntry(dir, commit, publishTimestamp))
    .filter(Boolean)
    .sort((left, right) => {
      const added = right.metadata.sortKeys.added - left.metadata.sortKeys.added;
      return added || left.name.localeCompare(right.name);
    });

  const index = {
    format: 1,
    title: CONFIG.name,
    description: CONFIG.description,
    metadata: CONFIG.metadata,
    plugins,
  };

  writeFileSync(OUT_PATH, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`[build-index] ${plugins.length} 个插件 @ ${commit.slice(0, 12)} → ${relative(ROOT, OUT_PATH)}`);

  if (warnings.length) {
    console.warn(`[build-index] ${warnings.length} 条警告：`);
    for (const message of warnings) console.warn(`  - ${message}`);
  }
}

main();
