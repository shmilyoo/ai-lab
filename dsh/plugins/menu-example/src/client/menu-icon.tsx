/**
 * 文件职责：左侧栏「测试菜单」入口的图标。
 * 关系：注册进 `sidebar.panellist` 时作为组件传入；按钮、文案、选中态与无障碍名称都由侧栏外壳负责。
 * 约定：只画图形，不处理点击；图标必须是行内 glyph 的直接子元素，外面不要再套 inline 容器，
 *       否则它会成为行盒的基线，把图标抬到文字上方。
 * 注意：配色沿用 DSH 官方插件图标同一档蓝紫，浅色与深色主题下都足够清晰；
 *       不要在这里画背景块或圆角底板，插件管理器的卡片自己会画底板。
 */

import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * 画一个「列表 / 菜单」字形：三行「圆点 + 横条」，缩到 16px 也读得出是菜单。
 * @param props - 侧栏给的图标展示参数：请求的边长，以及该面板是否被选中（这里不改变造型）。
 */
export function MenuIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <circle cx="9.5" cy="11" r="2" fill="#7CB7FF" />
      <path d="M15.5 11H26.5" stroke="#679EFE" strokeWidth={3.5} strokeLinecap="round" />
      <circle cx="9.5" cy="18" r="2" fill="#7CB7FF" />
      <path d="M15.5 18H26.5" stroke="#679EFE" strokeWidth={3.5} strokeLinecap="round" />
      <circle cx="9.5" cy="25" r="2" fill="#7CB7FF" />
      <path d="M15.5 25H26.5" stroke="#679EFE" strokeWidth={3.5} strokeLinecap="round" />
    </svg>
  )
}
