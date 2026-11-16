/**
 * 文件职责：本插件的 Host 半部分。
 * 关系：package.json 的 "." 导出指向编译产物 lib/index.js；cordis.patch.yml 把这条记录插进 profile。
 *       真正的界面能力在 src/client/ 里（浏览器半部分），Host 侧不注册 Service、Tool 或事件。
 * 约定：Host 半部分保持空实现即可——它的存在只是为了让 Loader 有一条可启用的记录，
 *       Client 模块（package.json 的 dsh.client）依附于这条记录加载。
 * 注意：以后要加 Host 能力（Service、Tool、事件监听）时，必须在 apply 里用 ctx.effect / ctx.on
 *       注册并返回清理函数，不要把副作用写在模块顶层。
 */

import type { Context } from '@deepseek-ai/cordis'

/**
 * 不提供任何 Host 侧能力。
 * @param context - Host 插件上下文（当前未使用，保留签名以便日后扩展）。
 */
export function apply(context: Context): void {
  void context
}
