/**
 * 文件职责：「测试菜单」面板的内容页。
 * 关系：在布局的 `main` 槽位以 key = menu-example 注册（见 src/client/index.ts）；
 *       左侧栏选中同一个 panel id 时，AppFrame 的 MainPanel 渲染这个组件。
 * 约定：`main` 槽位不提供页面骨架，页面自己负责内边距、最大宽度与滚动；
 *       间距/字号照宿主页面（插件管理页）的 head 节奏，颜色只取 --dsw-alias-* 主题 token。
 * 注意：本页没有 Session 绑定，不要读取 session 相关 hook；也不要在组件外写 DOM。
 */

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** 页面容器：占满主栏高度，左右内边距随视口收敛，内容超高时由自己滚动。 */
const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  boxSizing: 'border-box',
  height: '100%',
  padding: '28px clamp(24px, 4vw, 48px) 48px',
  overflowY: 'auto',
  color: 'var(--dsw-alias-label-primary)',
} as const

/** 内容列：与宿主页面一致，最宽 960px。 */
const columnStyle = { width: '100%', maxWidth: '960px' } as const

/** 标题：沿用宿主页面 head 的 20 / 28 / 500。 */
const titleStyle = { margin: 0, fontSize: 20, fontWeight: 500, lineHeight: '28px' } as const

/** 正文：页面真正要展示的一句话，用主文本色保证可读。 */
const bodyStyle = { margin: '12px 0 0', fontSize: 14, lineHeight: '22px' } as const

/**
 * 渲染测试菜单页面。
 * @param props - main 槽位的运行参数 + 本插件字典的 t（由注册时的 `locale: NS` 注入）。
 */
export function MenuPage({ t }: PropsRuntime<'main'> & PropsLocale<'menuExample'>) {
  return (
    <div style={pageStyle}>
      <div style={columnStyle}>
        <h1 style={titleStyle}>{t('page.title')}</h1>
        <p style={bodyStyle}>{t('page.body')}</p>
      </div>
    </div>
  )
}
