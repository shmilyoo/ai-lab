---
name: update-ai-lab
description: Update an existing ai-lab `yy-skills` installation to the latest released skills for selected agents. Use after the plugin has been installed manually and the user wants to refresh Claude Code, Codex, DeepSeek Harness, or another agent's skills directory.
---

# Update AI Lab

只更新已经安装的 `yy-skills`，不负责首次安装。

## 选择目标

除非用户的同一条请求已经明确指定目标，否则先问一次：

> 要更新到哪些 agent？
>
> - [x] `cc` — Claude Code
> - [x] `codex` — Codex
> - [x] `dsh` — DeepSeek Harness
>
> 直接回复“全部”或“默认”表示保持三项全选；也可以取消某一项，或追加其他 agent。

如果用户追加了其他 agent，询问该 agent 的 skills 目录。明确告知：该目录下与仓库同名的 `skills/*` 会被最新版本替换，其他 skill 不会改动。

## 执行

把回答映射为脚本参数：

- 默认或全部：`--agents cc,codex,dsh`
- 只选部分：`--agents cc,codex`
- 其他 agent：为每个目录追加 `--extra name=path`

```bash
node <this-skill-dir>/scripts/update-ai-lab.mjs --agents <...>
```

优先执行脚本，不要在脚本可用时手动重复底层更新命令。脚本按 Claude Code、DSH、其他 agent、Codex 的顺序执行，最后才更新 Codex，避免当前插件缓存被替换后中断更新流程。

脚本约定：

- Claude Code 和 Codex 使用市场 `ai-lab`、插件 `yy-skills@ai-lab`。
- DSH 只更新 `~/.dsh/profiles` 中已经安装 `ai-lab` 的 profile。
- `CLAUDE_BIN`、`CODEX_BIN`、`DSH_BIN` 可覆盖可执行文件路径。
- `--repo` 可覆盖仓库来源；默认依次尝试 SSH 和 HTTPS GitHub 地址。
- `--dry-run` 只打印将执行的命令。
- 其他 agent 只同步 `skills/<name>/` 目录；不删除目标里额外保留的旧 skill。

## 版本前提

更新的是已发布版本。若远端版本号未变，Claude Code 和 Codex 可能复用现有缓存；发布新内容前先把
`package.json`、`.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json` 的版本同步提升并推送。

## 汇报

按 agent 汇报成功或失败，并提示重启对应客户端或新开会话。不要声称已经替用户重启。若有失败，给出失败的 agent、命令和错误摘要，同时保留其他成功结果。
