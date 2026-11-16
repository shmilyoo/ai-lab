# ai-lab DSH 插件市场

这是一个自托管的 DeepSeek Harness format-1 插件索引。索引地址：

```text
https://shmilyoo.github.io/ai-lab/index.json
```

## 在 DSH 中添加

打开 **插件 → 发现 → 索引源**，粘贴上面的 URL 并保存。DSH 会读取索引中的插件、
版本兼容性和安装来源。

## 本地开发

```bash
pnpm registry   # 生成 registry/index.json
pnpm validate   # 校验索引、插件包与安装来源
pnpm site       # 生成 site/dist
pnpm check      # 依次执行 catalog、索引、校验和站点构建
```

本地预览：

```bash
python3 -m http.server 4173 -d dsh/plugin-market/site/dist
```

然后打开 `http://127.0.0.1:4173/`。

## 发布

插件默认使用固定 Git commit 安装，不依赖 npm 发布：

1. 提交并推送 `main`。
2. GitHub Actions 根据当前 commit 重新生成 `registry/index.json`。
3. `deploy-market` 将 `site/dist` 发布到 GitHub Pages。

仓库设置中需要把 Pages 的 Source 设为 **GitHub Actions**。

## 新增插件

1. 在 `dsh/plugins/<name>/package.json` 填写 `dsh.bundle.patch`、`dsh.client` 和
   `dsh.market`。
2. 在 `locale/zh.json`、`locale/en.json` 填写市场标题与描述。
3. 确保 `lib/` 已构建并提交。
4. 运行 `pnpm check`。
