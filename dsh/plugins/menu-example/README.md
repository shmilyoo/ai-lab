# 测试菜单 · dsh-menu-example

在 DeepSeek Harness 的左侧栏新增一行「测试菜单」，点开后主栏面板显示「这是一个测试菜单」。

## 功能

- 左侧栏入口：`sidebar.panellist` 槽位注册的一行图标 + 文案，位置在官方入口之后（`order: 100`）。
- 面板内容：`main` 槽位以同一个 id（`menu-example`）注册的页面组件，选中即渲染。
- 文案走 `ctx.locale`（简体中文 / 英文两套字典），颜色只用 `--dsw-alias-*` 主题 token，跟随明暗主题。
- 纯客户端插件：Host 半部分只有一条空记录，原因是 Client 模块要挂在一条可启用的 Loader 记录上。

## 安装

本地目录（开发调试）：

```bash
pnpm install
pnpm --filter @shmilyoo/dsh-menu-example build
```

然后在 DSH 的 **Plugins** 页用「添加插件」选中本目录，或用 `plugin_manager` 的 `install_bundle` 指向
本目录的绝对路径。装上后新开一个会话即可在左侧栏看到入口。

发布到 npm 之后也可以直接装：

```bash
dsh plugin add @shmilyoo/dsh-menu-example@0.1.0
```

## 目录结构

| 路径 | 职责 |
|---|---|
| `package.json` | 包清单：`dsh.bundle.patch`、`dsh.client`、市场展示字段 |
| `cordis.patch.yml` | 把插件记录插进 profile 的 Loader 补丁 |
| `src/index.ts` | Host 半部分（空实现） |
| `src/client/index.ts` | Client 半部分：注册侧栏入口与主栏面板 |
| `src/client/locales.ts` | 界面文案字典与命名空间声明 |
| `src/client/menu-icon.tsx` | 侧栏入口图标 |
| `src/client/menu-page.tsx` | 面板内容页 |
| `scripts/build.mjs` | 编译 `src/` → `lib/index.js`、`lib/client.js` |
| `lib/` | 生成物，由 `pnpm build` 产出，不要手改 |
| `locale/*.json` | 插件管理器展示用的标题 / 描述 / 详情文档 |
| `assets/icon.svg` | 插件图标 |
| `docs/` | 详情页的单图文档与插图 |

## 开发

```bash
pnpm typecheck   # tsc --noEmit，类型校验
pnpm build       # 编译到 lib/
pnpm check       # 二者串联
```

`lib/client.js` 是 `window.__ModuleLoader__.load({...})` 工厂格式，由 Web 端模块加载器装载；
产物里保留了工厂包装，`react`、`react/jsx-runtime` 一律 external，由页面模块表提供。

## 约定与限制

- 面板 id（`menu-example`）在 `sidebar.panellist` 与 `main` 两处必须一致；复用官方 id 会顶替官方入口。
- 没有 Session 绑定，页面不读取会话数据，也不发任何 Host 请求。
- 卸载 / 禁用插件时，两处注册随 `ctx.effect` 一起清理，当前主栏会退回会话面板。
