#!/usr/bin/env node
// 文件职责：扫描 skills/、dsh/plugins/、agents/ 的元数据，生成根目录 catalog.json。
// 关系：读取 skills/*/SKILL.md 的 frontmatter 与 dsh/plugins/*/package.json；
// 产物供仓库外的工具或站点消费。元数据缺失直接报错，不静默跳过。
// 约定：catalog.json 是生成物，不要手改。
// 注意：ROOT 由本文件位置向上推一层得到，任意工作目录下运行结果一致。

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = join(ROOT, 'catalog.json');

/** 统一的失败出口：带前缀报错，非零退出交给 CI 判断。 */
function fail(message) {
  throw new Error(`[build-catalog] ${message}`);
}

/** 列出目录下的子目录，跳过隐藏项与非目录。 */
function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

/**
 * 解析 SKILL.md 的 YAML frontmatter。
 * 只覆盖本仓库用到的子集：`key: value` 单行值，以及 `key: >` / `key: |` 折叠块。
 * 嵌套映射、锚点等复杂 YAML 不支持，skill 里不要用。
 */
function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const meta = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    const raw = kv[2].trim();
    let value = raw;
    if (raw === '>' || raw === '|' || raw === '>-' || raw === '|-') {
      const block = [];
      while (i + 1 < lines.length && (lines[i + 1].startsWith('  ') || !lines[i + 1].trim())) {
        block.push(lines[i + 1].trim());
        i += 1;
      }
      value = block.join(' ').trim();
    } else {
      value = raw.replace(/^['"]|['"]$/g, '');
    }
    meta[key] = value;
  }
  return meta;
}

/** 读取 skills/：每个目录必须有 SKILL.md 且 frontmatter 带 description。 */
function readSkills() {
  return listDirs(join(ROOT, 'skills')).map((dir) => {
    const file = join(ROOT, 'skills', dir, 'SKILL.md');
    if (!existsSync(file)) fail(`skills/${dir} 缺少 SKILL.md`);
    const meta = parseFrontmatter(readFileSync(file, 'utf8'));
    if (!meta.description) fail(`skills/${dir}/SKILL.md 的 frontmatter 缺少 description`);
    return {
      name: meta.name || dir,
      description: meta.description,
      path: `skills/${dir}`,
      version: meta.version || '0.0.0',
    };
  });
}

/** 读取 dsh/plugins/：中文摘要优先市场字段，缺省回落到包描述。 */
function readPlugins() {
  return listDirs(join(ROOT, 'dsh/plugins')).map((dir) => {
    const manifest = join(ROOT, 'dsh/plugins', dir, 'package.json');
    if (!existsSync(manifest)) fail(`dsh/plugins/${dir} 缺少 package.json`);
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    const market = (pkg.dsh && pkg.dsh.market) || {};
    const summary = market.summary || {};
    return {
      name: pkg.name,
      version: pkg.version,
      description: summary.zh || pkg.description || '',
      category: market.category || 'other',
      path: `dsh/plugins/${dir}`,
    };
  });
}

/** 读取 agents/：目录名即资产名，内容由目录内的文件自述。 */
function readAgents() {
  return listDirs(join(ROOT, 'agents')).map((dir) => ({
    name: dir,
    path: `agents/${dir}`,
  }));
}

function main() {
  const catalog = {
    generatedAt: new Date().toISOString(),
    skills: readSkills(),
    plugins: readPlugins(),
    agents: readAgents(),
  };
  catalog.counts = {
    skills: catalog.skills.length,
    plugins: catalog.plugins.length,
    agents: catalog.agents.length,
  };

  writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(
    `[build-catalog] skills ${catalog.counts.skills} / plugins ${catalog.counts.plugins} / agents ${catalog.counts.agents} → catalog.json`,
  );
}

main();
