#!/usr/bin/env node
// 文件职责：把已安装的 ai-lab skills 更新到最新版本；支持 Claude Code、Codex、DSH
// 以及显式指定 skills 目录的其他 agent。
// 约定：只更新已有安装；Codex 最后更新，避免当前插件缓存被替换后中断脚本。

import {
  accessSync,
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_HTTPS = 'https://github.com/shmilyoo/ai-lab.git';
const REPO_SSH = 'git@github.com:shmilyoo/ai-lab.git';
const MARKETPLACE = 'ai-lab';
const PLUGIN = 'yy-skills@ai-lab';
const DSH_PACKAGE = 'github:shmilyoo/ai-lab';
const DSH_MAC_CLI = '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh';

const AGENT_ALIASES = new Map([
  ['cc', 'cc'],
  ['claude', 'cc'],
  ['claude-code', 'cc'],
  ['codex', 'codex'],
  ['dsh', 'dsh'],
  ['deepseek', 'dsh'],
  ['deepseek-harness', 'dsh'],
]);

const USAGE = `用法：
  node scripts/update-ai-lab.mjs [选项]

选项：
  --agents <list>       逗号分隔：cc,codex,dsh；默认三者全选，none 表示不更新已知 agent
  --extra <name=path>   额外 agent：名称=skills 目录，可重复
  --repo <path-or-url>  覆盖仓库来源；默认依次尝试 SSH 和 HTTPS
  --dry-run             只打印命令
  -h, --help            显示帮助

示例：
  node scripts/update-ai-lab.mjs --agents cc,codex,dsh
  node scripts/update-ai-lab.mjs --agents codex --extra other=~/.other/skills`;

function expandHome(value) {
  return value.startsWith('~/') ? join(homedir(), value.slice(2)) : value;
}

function parseArgs(argv) {
  const options = {
    agents: ['cc', 'codex', 'dsh'],
    extras: [],
    repo: process.env.AI_LAB_REPO || null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--agents') {
      const value = argv[i + 1];
      if (!value) throw new Error('--agents 需要一个逗号分隔的列表');
      options.agents = value.toLowerCase() === 'none' ? [] : normalizeAgents(value);
      i += 1;
    } else if (arg === '--extra') {
      const value = argv[i + 1];
      if (!value || !value.includes('=')) throw new Error('--extra 需要 name=path');
      const splitAt = value.indexOf('=');
      options.extras.push({
        name: value.slice(0, splitAt) || 'extra',
        path: expandHome(value.slice(splitAt + 1)),
      });
      i += 1;
    } else if (arg === '--repo') {
      const value = argv[i + 1];
      if (!value) throw new Error('--repo 需要一个路径或 URL');
      options.repo = value;
      i += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '-h' || arg === '--help') {
      console.log(USAGE);
      process.exit(0);
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  return options;
}

function normalizeAgents(value) {
  const agents = [];
  for (const raw of value.split(',')) {
    const name = raw.trim();
    if (!name) continue;
    const normalized = AGENT_ALIASES.get(name);
    if (!normalized) throw new Error(`未知 agent：${name}；请使用 --extra name=path`);
    if (!agents.includes(normalized)) agents.push(normalized);
  }
  return agents;
}

function isExecutable(file) {
  try {
    accessSync(file, constants.X_OK);
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function findExecutable(name, envName, candidates = []) {
  const override = process.env[envName];
  if (override) {
    const file = expandHome(override);
    if (!isExecutable(file)) throw new Error(`${envName} 指向的文件不可执行：${file}`);
    return file;
  }

  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  const pathDirs = (process.env.PATH || '').split(delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    for (const extension of extensions) {
      const file = join(dir, `${name}${extension}`);
      if (isExecutable(file)) return file;
    }
  }
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

function run(command, args, dryRun, extraEnv = {}) {
  const label = [command, ...args].join(' ');
  if (dryRun) {
    console.log(`[dry-run] ${label}`);
    return;
  }

  console.log(`[run] ${label}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.error) throw new Error(`${label}：${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} 退出码 ${result.status}`);
}

function updateClaude(dryRun) {
  const bin = findExecutable('claude', 'CLAUDE_BIN');
  if (!bin) throw new Error('找不到 claude；请先安装或设置 CLAUDE_BIN');
  run(bin, ['plugin', 'marketplace', 'update', MARKETPLACE], dryRun);
  run(bin, ['plugin', 'update', PLUGIN, '-y'], dryRun);
  return 'Claude Code 已更新；重启 Claude Code 后生效';
}

function readProfilePackage(profileDir) {
  const manifest = join(profileDir, 'package.json');
  if (!existsSync(manifest)) return null;
  return JSON.parse(readFileSync(manifest, 'utf8'));
}

function profileHasAiLab(pkg) {
  const dependencies = pkg?.dependencies || {};
  if (Object.hasOwn(dependencies, 'ai-lab')) return true;
  if (Object.values(dependencies).some((value) => (
    typeof value === 'string' && value.includes('shmilyoo/ai-lab')
  ))) return true;
  const bundles = pkg?.dsh?.profile?.bundles || [];
  return bundles.includes('ai-lab');
}

function updateDsh(dryRun) {
  const bin = findExecutable('dsh', 'DSH_BIN', [DSH_MAC_CLI]);
  if (!bin) throw new Error('找不到 dsh；请设置 DSH_BIN');

  const dshHome = expandHome(process.env.DSH_HOME || join(homedir(), '.dsh'));
  const profilesDir = join(dshHome, 'profiles');
  if (!existsSync(profilesDir)) {
    throw new Error(`找不到 DSH profiles 目录：${profilesDir}；请先手动安装 yy-skills`);
  }

  const profiles = readdirSync(profilesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => {
      const dir = join(profilesDir, entry.name);
      try {
        return { name: entry.name, pkg: readProfilePackage(dir) };
      } catch (error) {
        console.warn(`[warn] 跳过 ${entry.name}：package.json 无法解析（${error.message}）`);
        return null;
      }
    })
    .filter(Boolean)
    .filter(({ pkg }) => pkg && profileHasAiLab(pkg));

  if (profiles.length === 0) {
    throw new Error('DSH 中没有检测到已安装的 ai-lab；请先手动安装');
  }

  for (const { name } of profiles) {
    run(bin, ['plugin', '--profile', name, 'add', DSH_PACKAGE], dryRun);
  }
  return `DSH 已更新 profile：${profiles.map(({ name }) => name).join(', ')}；重启 DeepSeek Harness 后生效`;
}

function cloneRepo(repoOption, destination, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] git clone --depth 1 ${repoOption || `${REPO_SSH} (HTTPS fallback)`} ${destination}`);
    return;
  }

  const candidates = repoOption
    ? [repoOption]
    : [process.env.AI_LAB_REPO || REPO_SSH, REPO_HTTPS];
  const errors = [];

  for (const source of candidates.filter(Boolean)) {
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    console.log(`[run] git clone --depth 1 ${source} ${destination}`);
    const result = spawnSync('git', ['clone', '--depth', '1', source, destination], {
      stdio: 'pipe',
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o ConnectTimeout=20',
      },
    });
    if (result.status === 0) {
      if (result.stderr.trim()) console.log(result.stderr.trim());
      return source;
    }
    errors.push(`${source}: ${(result.stderr || result.stdout || '').trim()}`);
  }

  throw new Error(`无法克隆 ai-lab：\n${errors.join('\n')}`);
}

function listSkillNames(skillsDir) {
  if (!existsSync(skillsDir)) throw new Error(`仓库缺少 skills 目录：${skillsDir}`);
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .filter((entry) => existsSync(join(skillsDir, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

function syncExtras(extras, repoOption, dryRun) {
  if (extras.length === 0) return [];

  const checkout = mkdtempSync(join(tmpdir(), 'ai-lab-update-'));
  try {
    cloneRepo(repoOption, checkout, dryRun);
    const skillsDir = join(checkout, 'skills');
    const skills = dryRun ? [] : listSkillNames(skillsDir);
    const results = [];

    for (const extra of extras) {
      const target = resolve(extra.path);
      if (!existsSync(target)) {
        results.push({ name: extra.name, ok: false, message: `目录不存在：${target}` });
        continue;
      }
      if (!statSync(target).isDirectory()) {
        results.push({ name: extra.name, ok: false, message: `不是目录：${target}` });
        continue;
      }

      if (dryRun) {
        console.log(`[dry-run] 同步 ${extra.name} skills → ${target}`);
        results.push({ name: extra.name, ok: true, message: `将同步到 ${target}` });
        continue;
      }

      for (const skill of skills) {
        const source = join(skillsDir, skill);
        const destination = join(target, skill);
        rmSync(destination, { recursive: true, force: true });
        cpSync(source, destination, { recursive: true });
      }
      results.push({
        name: extra.name,
        ok: true,
        message: `已同步 ${skills.length} 个 skill 到 ${target}；未删除目标中的其他 skill`,
      });
    }
    return results;
  } finally {
    rmSync(checkout, { recursive: true, force: true });
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const results = [];

  const record = (name, action) => {
    try {
      results.push({ name, ok: true, message: action() });
    } catch (error) {
      results.push({ name, ok: false, message: error.message });
    }
  };

  if (options.agents.includes('cc')) record('cc', () => updateClaude(options.dryRun));
  if (options.agents.includes('dsh')) record('dsh', () => updateDsh(options.dryRun));

  if (options.extras.length > 0) {
    try {
      results.push(...syncExtras(options.extras, options.repo, options.dryRun));
    } catch (error) {
      results.push({ name: 'extra', ok: false, message: error.message });
    }
  }

  // Codex 必须最后执行：更新会替换当前 Codex 插件缓存。
  if (options.agents.includes('codex')) record('codex', () => updateCodex(options.dryRun));

  for (const result of results) {
    console.log(`${result.ok ? '[ok]' : '[failed]'} ${result.name}: ${result.message}`);
  }
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

function updateCodex(dryRun) {
  const bin = findExecutable('codex', 'CODEX_BIN');
  if (!bin) throw new Error('找不到 codex；请先安装或设置 CODEX_BIN');
  run(bin, ['plugin', 'marketplace', 'upgrade', MARKETPLACE], dryRun);
  run(bin, ['plugin', 'add', PLUGIN], dryRun);
  return 'Codex 已更新；新开 Codex 会话后生效';
}

main();
