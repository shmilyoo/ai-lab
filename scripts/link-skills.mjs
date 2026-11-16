#!/usr/bin/env node
// 文件职责：把仓库 skills/<name> 用符号链接挂到本机 agent 的 skills 目录，让仓库文件成为唯一事实源；
// 本机对 skill 的任何编辑都会通过链接直接写回仓库，因此不需要"双向同步"这一步。
// 关系：目标目录由 skills.config.json 的 targets 指定；与 scripts/build-catalog.mjs 共用 skills/ 目录约定。
// 约定：只创建、替换、删除符号链接，绝不删除真实目录；遇到既有真实目录一律跳过并提示用 adopt 收编。
// 为什么不用硬链接：目录无法硬链接（APFS/Linux 都拒绝），而文件硬链接会被 git 的替换式写入
// 和编辑器的「临时文件 + rename」保存打断；符号链接是路径别名，能保证两边始终是同一份文件。
// 注意：跨机同步靠 git——另一台机器 pull 之后链接自动指向新内容；不要用网盘或双向 rsync 同步 skills/。

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = join(ROOT, 'skills');
const PLATFORM = process.platform;

const USAGE = `用法：
  node scripts/link-skills.mjs status [--target <dir>]
  node scripts/link-skills.mjs link [--target <dir>] [--dry-run] [--force]
  node scripts/link-skills.mjs unlink [--target <dir>] [--dry-run]
  node scripts/link-skills.mjs adopt <skill-name> [--target <dir>]

不带 --target 时使用 skills.config.json 里的全部 targets。`;

/** 解析命令行：命令、可重复的 --target、开关位与位置参数。 */
function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { targets: [], dryRun: false, force: false, positional: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--target') {
      if (!rest[i + 1]) throw new Error('--target 需要一个目录参数');
      options.targets.push(rest[i + 1]);
      i += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`未知参数 ${arg}`);
    } else {
      options.positional.push(arg);
    }
  }
  return { command, options };
}

/** 展开 ~，其余路径原样返回。 */
function expandHome(value) {
  return value.startsWith('~/') ? join(homedir(), value.slice(2)) : value;
}

/** 目标目录：命令行优先，其次 skills.config.json。 */
function loadTargets(cliTargets) {
  if (cliTargets.length) return cliTargets.map(expandHome);
  const file = join(ROOT, 'skills.config.json');
  const config = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8'))
    : { targets: ['~/.cc-switch/skills'] };
  if (!Array.isArray(config.targets) || config.targets.length === 0) {
    throw new Error('skills.config.json 的 targets 不能为空');
  }
  return config.targets.map(expandHome);
}

/** 仓库里的 skill：子目录且带 SKILL.md；缺入口文件的目录只告警、不链接。 */
function listRepoSkills() {
  if (!existsSync(SKILLS_DIR)) return [];
  const names = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();

  const skills = [];
  for (const name of names) {
    if (!existsSync(join(SKILLS_DIR, name, 'SKILL.md'))) {
      console.warn(`[skip] skills/${name} 缺少 SKILL.md，不作为 skill 链接`);
      continue;
    }
    skills.push(name);
  }
  return skills;
}

/** lstat 的安全包装：不存在或读不到时返回 null。 */
function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

/** 读链接指向的原始文本，悬空链接也能读到；非链接返回 null。 */
function readLinkText(path) {
  try {
    return readlinkSync(path);
  } catch {
    return null;
  }
}

/** 判断某个路径的链接是否指进仓库 skills/。 */
function linkPointsIntoRepo(linkText) {
  return Boolean(linkText) && (linkText === SKILLS_DIR || linkText.startsWith(SKILLS_DIR + sep));
}

/** 判定目标路径当前状态：已链接 / 指向别处 / 悬空 / 真实目录 / 其他。 */
function inspectLink(linkPath, repoPath) {
  const stat = lstatOrNull(linkPath);
  if (!stat) return { kind: 'missing' };
  if (stat.isSymbolicLink()) {
    try {
      if (realpathSync(linkPath) === repoPath) return { kind: 'linked' };
      return { kind: 'foreign-link', target: readLinkText(linkPath) };
    } catch {
      return { kind: 'dangling-link', target: readLinkText(linkPath) };
    }
  }
  if (stat.isDirectory()) return { kind: 'real-dir' };
  return { kind: 'other-entry' };
}

/** 建链接；Windows 用 junction（普通目录不需要管理员权限）。 */
function createLink(repoPath, linkPath, dryRun) {
  if (dryRun) return;
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(repoPath, linkPath, PLATFORM === 'win32' ? 'junction' : 'dir');
}

/** 删除链接本身；调用方必须先确认它是链接，绝不能对真实目录调用。 */
function removeLink(linkPath, dryRun) {
  if (dryRun) return;
  unlinkSync(linkPath);
}

/** 状态文字，供 status 输出。 */
function labelOf(state) {
  switch (state.kind) {
    case 'linked':
      return '已链接到仓库';
    case 'missing':
      return '缺失（可 link）';
    case 'foreign-link':
      return `已链接到别处：${state.target}`;
    case 'dangling-link':
      return `悬空链接：${state.target}`;
    case 'real-dir':
      return '本机真实目录（可用 adopt 收编）';
    case 'other-entry':
      return '同名普通文件，未处理';
    default:
      return '未知状态';
  }
}

/** link：为每个仓库 skill 在目标目录建立或修复链接。 */
function commandLink(targets, options) {
  const skills = listRepoSkills();
  if (!skills.length) {
    console.log('仓库 skills/ 下还没有 skill，先新增一个再来链接。');
    return;
  }

  let created = 0;
  let untouched = 0;
  for (const target of targets) {
    console.log(`\n目标：${target}`);
    if (!options.dryRun) mkdirSync(target, { recursive: true });
    for (const name of skills) {
      const repoPath = join(SKILLS_DIR, name);
      const linkPath = join(target, name);
      const state = inspectLink(linkPath, repoPath);

      if (state.kind === 'linked') {
        untouched += 1;
        continue;
      }
      if (state.kind === 'missing') {
        createLink(repoPath, linkPath, options.dryRun);
        console.log(`  + ${name}${options.dryRun ? '（dry-run，未落盘）' : ''}`);
        created += 1;
        continue;
      }
      if (state.kind === 'foreign-link' || state.kind === 'dangling-link') {
        if (options.force) {
          removeLink(linkPath, options.dryRun);
          createLink(repoPath, linkPath, options.dryRun);
          console.log(`  ~ ${name} 已改为指向仓库${options.dryRun ? '（dry-run）' : ''}`);
          created += 1;
        } else {
          console.log(`  ! ${name} 未改动：${labelOf(state)}；确认后加 --force`);
          untouched += 1;
        }
        continue;
      }
      if (state.kind === 'real-dir') {
        if (existsSync(repoPath)) {
          console.log(`  ! ${name} 本机是真实目录，仓库里也有同名 skill，未改动。`);
          console.log(`      先比对再决定：diff -r "${linkPath}" "${repoPath}"；需要收编时手动合并后删除本机目录再 link。`);
        } else {
          console.log(`  ! ${name} 是真实目录，未改动。收编命令：`);
          console.log(`      node scripts/link-skills.mjs adopt ${name} --target ${target}`);
        }
        untouched += 1;
        continue;
      }
      console.log(`  ! ${name} 位置被同名普通文件占用，未改动`);
      untouched += 1;
    }
  }

  console.log(`\n完成：新建 ${created} 个链接，未改动 ${untouched} 个。`);
  if (created && !options.dryRun) {
    console.log('提示：链接不进入 git，本机编辑会直接改到仓库文件；改完按需 commit。');
  }
}

/** status：列出每个 skill 在每个目标目录的链接状态，并找出仓库已删但链接还在的残留。 */
function commandStatus(targets) {
  const skills = listRepoSkills();
  console.log(`仓库 skills：${skills.length} 个`);
  let problems = 0;

  for (const target of targets) {
    console.log(`\n目标：${target}`);
    if (!existsSync(target)) {
      console.log('  （目标目录不存在，可用 link 创建）');
      problems += 1;
      continue;
    }
    for (const name of skills) {
      const state = inspectLink(join(target, name), join(SKILLS_DIR, name));
      const mark = state.kind === 'linked' ? ' ' : '!';
      if (state.kind !== 'linked') problems += 1;
      console.log(`  ${mark} ${name.padEnd(30)} ${labelOf(state)}`);
    }

    const stale = readdirSync(target, { withFileTypes: true })
      .filter((entry) => entry.isSymbolicLink() && linkPointsIntoRepo(readLinkText(join(target, entry.name))))
      .map((entry) => entry.name)
      .filter((name) => !skills.includes(name));
    for (const name of stale) {
      console.log(`  ! ${name.padEnd(30)} 仓库里已不存在该 skill，链接残留；用 unlink 清理`);
    }
    problems += stale.length;
  }

  console.log(problems ? `\n发现 ${problems} 处需要处理。` : '\n全部同步，无异常。');
}

/** unlink：删除指进仓库的链接，真实目录一律不碰。 */
function commandUnlink(targets, options) {
  let removed = 0;
  for (const target of targets) {
    if (!existsSync(target)) continue;
    console.log(`\n目标：${target}`);
    for (const entry of readdirSync(target, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) continue;
      const linkPath = join(target, entry.name);
      if (!linkPointsIntoRepo(readLinkText(linkPath))) continue;
      removeLink(linkPath, options.dryRun);
      console.log(`  - ${entry.name}${options.dryRun ? '（dry-run，未落盘）' : ''}`);
      removed += 1;
    }
  }
  console.log(`\n完成：删除 ${removed} 个链接（真实目录未动）。`);
}

/** adopt：把本机已有真实目录搬进仓库，再在原位置建链接。 */
function commandAdopt(name, targets, options) {
  if (!name) throw new Error('adopt 需要一个 skill 名');
  if (name.includes('/') || name.includes(sep)) throw new Error('skill 名不能包含路径分隔符');

  const target = targets[0];
  const localPath = join(target, name);
  const repoPath = join(SKILLS_DIR, name);

  if (existsSync(repoPath)) throw new Error(`skills/${name} 已存在，不能收编；请先处理仓库里的同名目录`);
  const stat = lstatOrNull(localPath);
  if (!stat) throw new Error(`${localPath} 不存在`);
  if (stat.isSymbolicLink()) throw new Error(`${localPath} 是符号链接，不是本机真实目录`);
  if (!stat.isDirectory()) throw new Error(`${localPath} 不是目录`);

  if (options.dryRun) {
    console.log(`将移动 ${localPath} → ${repoPath}，再把 ${localPath} 建为指向仓库的链接。`);
    return;
  }

  mkdirSync(SKILLS_DIR, { recursive: true });
  try {
    renameSync(localPath, repoPath);
  } catch (error) {
    // 跨文件系统时 rename 会失败，退回到复制后删除；删除前再确认是目录。
    if (error.code !== 'EXDEV') throw error;
    cpSync(localPath, repoPath, { recursive: true });
    if (!lstatOrNull(repoPath)?.isDirectory()) throw new Error('复制失败，未删除本机目录');
    rmSync(localPath, { recursive: true, force: true });
  }
  createLink(repoPath, localPath, false);

  console.log(`已收编 ${name}：文件现在位于 skills/${name}，${localPath} 是指向它的链接。`);
  console.log(`下一步：node scripts/build-catalog.mjs，然后按需 git add skills/${name}`);
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (!['status', 'link', 'unlink', 'adopt'].includes(command)) {
    console.error(USAGE);
    process.exit(1);
  }
  const targets = loadTargets(options.targets);

  switch (command) {
    case 'status':
      commandStatus(targets);
      break;
    case 'link':
      commandLink(targets, options);
      break;
    case 'unlink':
      commandUnlink(targets, options);
      break;
    case 'adopt':
      commandAdopt(options.positional[0], targets, options);
      break;
    default:
      console.error(USAGE);
      process.exit(1);
  }
}

main();
