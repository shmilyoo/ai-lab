/**
 * 文件职责：本插件界面文案的本地化字典（运行时用），命名空间为 `menuExample`。
 * 关系：src/client/index.ts 用 NS 注册字典并 bind 出 t；menu-page.tsx / menu-icon.tsx 消费它。
 *       根目录 locale/*.json 是插件管理器展示用的标题/描述，与这里的运行时字典是两回事。
 * 约定：zh 是 key 的唯一来源；新增文案先写 zh，再补 en —— en 的 key 缺失会直接在编译期报错。
 * 注意：可见文案一律走 ctx.locale（t()），不要在组件里写死中文字符串，否则切语言时不会跟随。
 */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** 本插件拥有的字典命名空间。 */
export const NS = 'menuExample'

/** 简体中文字典（key 集合的唯一来源）。 */
export const zh = {
  /** 左侧栏入口文案。 */
  'panel.label': '测试菜单',
  /** 面板页标题。 */
  'page.title': '测试菜单',
  /** 面板页正文，即需求里要求显示的内容。 */
  'page.body': '这是一个测试菜单',
}

/** 字典 key 的联合类型，供编译期校验与 t() 补全使用。 */
export type MenuExampleKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 「测试菜单」插件自己的界面文案。 */
    menuExample: MenuExampleKey
  }
}

/** 英文字典：与 zh 逐 key 对应。 */
export const en: Record<MenuExampleKey, string> = {
  'panel.label': 'Test menu',
  'page.title': 'Test menu',
  'page.body': 'This is a test menu',
}
