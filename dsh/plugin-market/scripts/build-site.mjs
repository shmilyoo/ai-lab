#!/usr/bin/env node
/**
 * 文件职责：把静态市场页与已校验的 format-1 索引组装到 site/dist。
 *
 * 关系：输入为 site/index.html 和 registry/index.json，输出供 GitHub Pages 或本地预览使用。
 * 约定：dist 是生成物；站点只请求同目录 index.json，不直接读取仓库目录结构。
 */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKET_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_DIR = join(MARKET_DIR, 'site');
const DIST_DIR = join(SITE_DIR, 'dist');
const INDEX_PATH = join(MARKET_DIR, 'registry/index.json');
const DIST_INDEX_PATH = join(DIST_DIR, 'index.json');

const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
if (index.format !== 1 || !Array.isArray(index.plugins)) {
  throw new Error('[build-site] registry/index.json 不是 format-1 索引');
}

rmSync(DIST_DIR, { recursive: true, force: true });
mkdirSync(DIST_DIR, { recursive: true });
cpSync(join(SITE_DIR, 'index.html'), join(DIST_DIR, 'index.html'));
writeFileSync(DIST_INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`);
console.log(`[build-site] ${index.plugins.length} 个插件 → ${DIST_DIR}`);
