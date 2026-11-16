/**
 * 文件职责：Client（浏览器）半部分——把「测试菜单」接进 Web 界面的两个槽位：
 *           1. `sidebar.panellist`：左侧栏的全局面板入口（图标 + 文案）；
 *           2. `main`：该入口被选中后，中央主栏面板的内容页。
 * 关系：面板 id 在这两处必须完全一致——侧栏点击时外壳用同一个 id 选中 `main` 面板
 *       （注册了入口却没有对应的 main 记录，点击会报错且不切换）。
 *       页面与图标组件分别在 menu-page.tsx / menu-icon.tsx，文案在 locales.ts。
 * 约定：所有注册都包在 ctx.effect 里，插件被卸载（或 profile 层移除）时由 Cordis 自动清理；
 *       组件只拿槽位注入的 props，不 import 任何 Harness Client 包。
 * 注意：factory（lib/client.js）里不要有副作用，注册动作全部发生在 apply 里。
 */

import type { Context } from '@deepseek-ai/cordis'
// 以下都是 type-only import：只为把各插件合并到 Context / SlotMap 的声明带进编译单元。
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { MenuIcon } from './menu-icon.tsx'
import { MenuPage } from './menu-page.tsx'
import { en, NS, zh } from './locales.ts'

/** 本插件依赖的 Client 服务：槽位注册（slots）与本地化（locale）。 */
export const inject = ['slots', 'locale']

/**
 * 侧栏入口 id，同时也是 `main` 槽位的 panel key。
 * 用一个不会被官方占用的自有 id：复用官方 id 会顶替官方那个入口，而不是新增一条。
 */
const PANEL_ID = 'menu-example'

/**
 * Client 插件入口。
 * @param ctx - Client 根上下文。
 */
export function apply(ctx: Context): void {
  // 先注册字典再 bind，否则 t() 找不到这个命名空间。
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'menu-example: dictionaries')
  const t = ctx.locale.bind(NS)

  // 左侧栏入口：外壳负责按钮、选中态与无障碍名称，label 是 thunk，切语言时不用重新注册。
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 100,
    locale: NS,
    label: () => t('panel.label'),
  }, MenuIcon)), 'menu-example: sidebar entry')

  // 主栏面板页：key 与上面的 id 一一对应，注册时带上 locale，页面就能拿到类型化的 t。
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
  }, MenuPage)), 'menu-example: panel page')
}
