#!/usr/bin/env node
/**
 * 文件职责：校验 format-1 索引、磁盘插件和安装来源的一致性，供 CI 与发布前自查。
 *
 * 关系：读取 dsh/plugin-market/registry/index.json、market.config.json 与 dsh/plugins/*；
 * 生成逻辑在 build-index.mjs，站点复制逻辑在 build-site.mjs。
 *
 * 约定：结构错误一律以退出码 1 结束；warning 只提示。修复生成物应重跑
 * `pnpm registry`，不要手改 registry/index.json。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const MARKET_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(MARKET_DIR, '../..');
const CONFIG = JSON.parse(readFileSync(join(MARKET_DIR, 'market.config.json'), 'utf8'));
const PLUGINS_DIR = join(ROOT, CONFIG.pluginsDir);
const INDEX_PATH = join(MARKET_DIR, 'registry/index.json');

const errors = [];
const warnings = [];
const err = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

const LANGUAGE_ID = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:\d*[A-Za-z-][0-9A-Za-z-]*|0|[1-9]\d*)(?:\.(?:\d*[A-Za-z-][0-9A-Za-z-]*|0|[1-9]\d*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const COMMIT = /^[0-9a-f]{40}$/u;

function readJson(file) {
  if (!existsSync(file)) throw new Error(`缺少 ${relative(ROOT, file)}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function validateLocalized(value, path, required = false) {
  if (typeof value === 'string') {
    if (!value.trim()) err(`${path} 不能为空`);
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    err(`${path} 必须是字符串或本地化对象`);
    return;
  }
  for (const [language, text] of Object.entries(value)) {
    if (!LANGUAGE_ID.test(language)) err(`${path}.${language} 不是合法语言 id`);
    if (typeof text !== 'string' || !text.trim()) err(`${path}.${language} 不能为空`);
  }
  if (required && !Object.hasOwn(value, 'en')) err(`${path} 必须包含 en`);
}

function validateDeclarations(metadata) {
  for (const group of ['categories', 'labels', 'sortKeys']) {
    if (!metadata[group] || typeof metadata[group] !== 'object' || Array.isArray(metadata[group])) {
      err(`$.metadata.${group} 必须是对象`);
      continue;
    }
    for (const [id, declaration] of Object.entries(metadata[group])) {
      if (!id) err(`$.metadata.${group} 不能声明空 id`);
      validateLocalized(declaration && declaration.title, `$.metadata.${group}.${id}.title`, true);
      if (group === 'sortKeys' && declaration.order !== 'asc' && declaration.order !== 'desc') {
        err(`$.metadata.sortKeys.${id}.order 必须是 asc 或 desc`);
      }
    }
  }
}

function validateSource(source, path, pluginPath, expectedVersion) {
  if (!source || typeof source !== 'object') {
    err(`${path} 必须是对象`);
    return;
  }
  if (source.type === 'npm') {
    if (CONFIG.source.type !== 'npm') err(`${path}.type 与 market.config.json 的 npm 来源不一致`);
    return;
  }
  if (source.type !== 'git') {
    err(`${path}.type 必须是 npm 或 git`);
    return;
  }
  if (source.url !== CONFIG.repoUrl) err(`${path}.url 必须等于 market.config.json 的 repoUrl`);
  if (!COMMIT.test(source.commit || '')) err(`${path}.commit 必须是 40 位小写 commit SHA`);
  if (source.path !== pluginPath) err(`${path}.path 必须是 ${pluginPath}`);
  if (CONFIG.source.type !== 'git') err(`${path}.type 与 market.config.json 的 git 来源不一致`);

  let manifestText;
  try {
    manifestText = execFileSync('git', ['show', `${source.commit}:${pluginPath}/package.json`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    err(`${path}.source.commit ${source.commit} 中不存在 ${pluginPath}/package.json`);
    return;
  }
  try {
    const sourcePackage = JSON.parse(manifestText);
    if (sourcePackage.version !== expectedVersion) {
      err(`${path}.source.commit 中 package.json 版本 ${sourcePackage.version} 与索引 ${expectedVersion} 不一致`);
    }
  } catch (error) {
    err(`${path}.source.commit 中 package.json 无法解析：${error.message}`);
  }
}

function validateVersion(version, path, pluginPath) {
  if (!SEMVER.test(version && version.version)) err(`${path}.version 不是精确 SemVer`);
  if (!Number.isInteger(version.publishTimestamp) || version.publishTimestamp < 0) {
    err(`${path}.publishTimestamp 必须是非负整数秒`);
  }
  validateSource(version.source, `${path}.source`, pluginPath, version.version);
  if (version.engines && version.engines.dsh && typeof version.engines.dsh !== 'string') {
    err(`${path}.engines.dsh 必须是字符串`);
  }
}

function validateIndex(index) {
  if (index.format !== 1) err('$.format 必须是 1');
  validateLocalized(index.title, '$.title', true);
  if (index.description !== undefined) validateLocalized(index.description, '$.description');
  if (!index.metadata || typeof index.metadata !== 'object') {
    err('$.metadata 必须是对象');
    return;
  }
  validateDeclarations(index.metadata);
  if (!Array.isArray(index.plugins)) {
    err('$.plugins 必须是数组');
    return;
  }

  const names = new Set();
  index.plugins.forEach((plugin, position) => {
    const path = `$.plugins[${position}]`;
    if (!PACKAGE_NAME.test(plugin.name || '')) err(`${path}.name 不是合法 npm 包名`);
    if (names.has(plugin.name)) err(`${path}.name 重复`);
    names.add(plugin.name);
    if (plugin.title !== undefined) validateLocalized(plugin.title, `${path}.title`);
    if (plugin.description !== undefined) validateLocalized(plugin.description, `${path}.description`);
    if (plugin.icon && !/^(?:https:|data:image\/)/.test(plugin.icon)) err(`${path}.icon 必须是 https 或 data 图片 URL`);
    if (plugin.repository && plugin.repository.url !== CONFIG.repoUrl) err(`${path}.repository.url 必须等于 repoUrl`);
    if (!plugin.metadata || typeof plugin.metadata !== 'object') {
      err(`${path}.metadata 必须是对象`);
    } else {
      if (!Object.hasOwn(index.metadata.categories, plugin.metadata.category)) {
        err(`${path}.metadata.category 未声明`);
      }
      if (!Array.isArray(plugin.metadata.labels)) err(`${path}.metadata.labels 必须是数组`);
      else for (const label of plugin.metadata.labels) {
        if (!Object.hasOwn(index.metadata.labels, label)) err(`${path}.metadata.labels 包含未声明的 ${label}`);
      }
      if (!plugin.metadata.sortKeys || typeof plugin.metadata.sortKeys !== 'object') {
        err(`${path}.metadata.sortKeys 必须是对象`);
      } else for (const [key, value] of Object.entries(plugin.metadata.sortKeys)) {
        if (!Object.hasOwn(index.metadata.sortKeys, key)) err(`${path}.metadata.sortKeys 包含未声明的 ${key}`);
        if (typeof value !== 'number') err(`${path}.metadata.sortKeys.${key} 必须是数字`);
      }
    }
    if (!plugin.repository || !plugin.repository.directory) {
      err(`${path}.repository.directory 必须指向插件目录`);
      return;
    }
    if (!Array.isArray(plugin.versions) || plugin.versions.length === 0) {
      err(`${path}.versions 必须是非空数组`);
      return;
    }
    const versions = new Set();
    plugin.versions.forEach((version, versionPosition) => {
      if (versions.has(version.version)) err(`${path}.versions[${versionPosition}].version 重复`);
      versions.add(version.version);
      validateVersion(version, `${path}.versions[${versionPosition}]`, plugin.repository.directory);
    });
  });
}

function listPluginPackages() {
  if (!existsSync(PLUGINS_DIR)) return [];
  return readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => {
      const pluginPath = `${CONFIG.pluginsDir}/${entry.name}`;
      const manifestPath = join(ROOT, pluginPath, 'package.json');
      if (!existsSync(manifestPath)) {
        err(`${pluginPath}: 缺少 package.json`);
        return null;
      }
      try {
        return { dir: entry.name, pluginPath, pkg: JSON.parse(readFileSync(manifestPath, 'utf8')) };
      } catch (error) {
        err(`${pluginPath}: package.json 解析失败（${error.message}）`);
        return null;
      }
    })
    .filter(Boolean);
}

function validatePackage(pkgEntry, entry, index) {
  const { dir, pluginPath, pkg } = pkgEntry;
  if (entry.versions[0].version !== pkg.version) {
    err(`${pkg.name}: 索引版本 ${entry.versions[0].version} 与 package.json ${pkg.version} 不一致`);
  }
  const market = (pkg.dsh && pkg.dsh.market) || {};
  if (entry.metadata.category !== (market.category || 'other')) err(`${pkg.name}: 分类与 package.json 不一致`);
  if (!index.metadata.categories[entry.metadata.category]) err(`${pkg.name}: 分类未声明`);
  const patch = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch;
  if (!patch) err(`${pkg.name}: package.json 缺少 dsh.bundle.patch`);
  else if (!existsSync(join(PLUGINS_DIR, dir, patch))) err(`${pkg.name}: 补丁文件 ${patch} 不存在`);
  if (!pkg.dsh || !pkg.dsh.client) warn(`${pkg.name}: 未声明 dsh.client，插件没有客户端界面`);
  if (pkg.dsh && pkg.dsh.client) {
    for (const output of ['lib/index.js', 'lib/client.js']) {
      if (!existsSync(join(PLUGINS_DIR, dir, output))) err(`${pkg.name}: 构建产物 ${output} 不存在，先运行 pnpm --filter ${pkg.name} build`);
    }
  }
  if (!Array.isArray(pkg.files) || !pkg.files.includes('lib')) warn(`${pkg.name}: files 白名单缺少 lib`);
  if (!existsSync(join(PLUGINS_DIR, dir, 'LICENSE'))) warn(`${pkg.name}: 缺少 LICENSE`);
  const icon = market.icon || 'assets/icon.svg';
  if (!existsSync(join(PLUGINS_DIR, dir, icon))) err(`${pkg.name}: 图标 ${icon} 不存在`);
  if (!entry.title || !entry.title.en) err(`${pkg.name}: 索引缺少英文标题`);
  if (!entry.description || !entry.description.en) err(`${pkg.name}: 索引缺少英文描述`);
  if (!pkg.engines || !pkg.engines.dsh) warn(`${pkg.name}: package.json 未声明 engines.dsh，安装兼容性无法判断`);
  if (!entry.homepage || entry.homepage !== `${CONFIG.repoUrl}/tree/${CONFIG.branch}/${pluginPath}`) {
    err(`${pkg.name}: homepage 与插件目录不一致`);
  }
}

function main() {
  let index;
  try {
    index = readJson(INDEX_PATH);
  } catch (error) {
    console.error(`[validate] ${error.message}，先运行 pnpm registry`);
    process.exit(1);
  }

  validateIndex(index);

  const packages = listPluginPackages();
  const entries = new Map((index.plugins || []).map((plugin) => [plugin.name, plugin]));
  for (const item of packages) {
    const entry = entries.get(item.pkg.name);
    if (!entry) {
      err(`${item.pkg.name}: 磁盘上有包但索引未收录`);
      continue;
    }
    validatePackage(item, entry, index);
  }
  for (const name of entries.keys()) {
    if (!packages.some((item) => item.pkg.name === name)) err(`${name}: 索引有条目但磁盘没有对应包`);
  }

  report();
}

function report() {
  for (const message of warnings) console.warn(`[validate] warning: ${message}`);
  if (errors.length) {
    for (const message of errors) console.error(`[validate] error: ${message}`);
    console.error(`[validate] 失败：${errors.length} 个错误，${warnings.length} 条警告`);
    process.exit(1);
  }
  console.log(`[validate] 通过：format-1 索引与插件一致（${warnings.length} 条警告）`);
}

main();
