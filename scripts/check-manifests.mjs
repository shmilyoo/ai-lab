// 文件职责：校验 ai-lab 包身份、yy-skills 发布入口与 DSH bundle 不会发生元数据漂移；
// 关系：由 package.json 的 check 脚本调用，package 名与 plugin 名刻意保持独立。

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_PACKAGE_NAME = 'ai-lab';
const EXPECTED_PLUGIN_NAME = 'yy-skills';
const EXPECTED_MARKETPLACE = 'ai-lab';

function readJson(relPath) {
  const file = join(ROOT, relPath);
  if (!existsSync(file)) throw new Error(`缺少 ${relPath}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} 应为 ${JSON.stringify(expected)}，实际为 ${JSON.stringify(actual)}`);
  }
}

const pkg = readJson('package.json');
const plugin = readJson('.claude-plugin/plugin.json');
const marketplace = readJson('.claude-plugin/marketplace.json');
const marketplaceEntry = marketplace.plugins?.find((entry) => entry.name === EXPECTED_PLUGIN_NAME);

assertEqual(pkg.name, EXPECTED_PACKAGE_NAME, 'package.json name');
assertEqual(plugin.name, EXPECTED_PLUGIN_NAME, '.claude-plugin/plugin.json name');
assertEqual(plugin.version, pkg.version, 'plugin version must match package version');
assertEqual(marketplace.name, EXPECTED_MARKETPLACE, 'marketplace name');
if (!marketplaceEntry) throw new Error(`marketplace 缺少 ${EXPECTED_PLUGIN_NAME} 条目`);
assertEqual(marketplaceEntry.version, plugin.version, 'marketplace plugin version');
assertEqual(pkg.dsh?.bundle?.patch, './.dsh-plugin/cordis.patch.yml', 'DSH bundle patch');

for (const file of ['.dsh-plugin/cordis.patch.yml', '.dsh-plugin/index.mjs']) {
  if (!existsSync(join(ROOT, file))) throw new Error(`缺少 ${file}`);
}

console.log(
  `[check-manifests] package ${EXPECTED_PACKAGE_NAME} / plugin ${EXPECTED_PLUGIN_NAME} ${plugin.version} / marketplace ${EXPECTED_MARKETPLACE} → ok`,
);
