# YY Skills

面向 Claude Code、Codex 和 DeepSeek Harness 的 Agent Skills 仓库。

所有 skill 都放在 [`skills/`](./skills) 下，每个直接子目录包含一个
`SKILL.md`，可附带 `references/`、`scripts/`、`assets/` 等资源。

## 安装

### Claude Code

```bash
claude plugin marketplace add shmilyoo/ai-lab
claude plugin install yy-skills@ai-lab
```

安装后重启 Claude Code，或新开一个会话。

### Codex

```bash
codex plugin marketplace add shmilyoo/ai-lab
codex plugin add yy-skills@ai-lab
```

安装后新开一个 Codex 会话。

### DeepSeek Harness

桌面端默认使用 `web` profile：

```bash
dsh plugin --profile web add github:shmilyoo/ai-lab
```

如果使用其他 profile，把 `web` 替换成对应的 profile 名称。安装后重启
DeepSeek Harness。

## 更新

三个客户端都直接使用同一个 GitHub 仓库作为来源。更新仓库并重新运行对应
客户端的更新或安装命令后，重启目标客户端即可。

该仓库不会生成或保存第二份 skill 副本，`skills/` 始终是唯一事实源。

## 版本

当前插件版本是 `0.1.0`，由以下三个文件共同定义：

- `package.json`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`

发布新版本时三者必须同步修改，`pnpm check` 会校验版本一致性。Git tag 使用
`yy-skills--v<version>`。
