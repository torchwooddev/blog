import { createServerFn } from '@tanstack/react-start'
import { deleteFiles, resolveFileRefs } from './storage.server'
import { getServerFnRequest, requireAuthenticatedUser } from './auth.server'

/**
 * getFiles 保持公开只读：附件桶本身公开读，登录墙会破坏公开文章页的附件展示。
 * deleteStorageFiles 是特权动作（B-01）：server function 可被未授权直调，
 * handler 入口必须校验终端用户 JWT；它返回 number（删除成功数），鉴权失败
 * 无法用返回值表达，因此抛 Error（调用点都在需登录的删除文章流程里，onError
 * 会以 toast 呈现消息）。
 */

/** 附件 ID → FileRef（详情页附件区、编辑器回显）。 */
export const getFiles = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { fileIds?: unknown }
    if (!Array.isArray(raw.fileIds)) return { fileIds: [] as string[] }
    return { fileIds: raw.fileIds.filter((id): id is string => typeof id === 'string') }
  })
  .handler(async ({ data }) => resolveFileRefs(data.fileIds))

/** 删除附件文件（文章删除协议的级联步骤；要求已登录终端用户）。 */
export const deleteStorageFiles = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { fileIds?: unknown }
    if (!Array.isArray(raw.fileIds)) return { fileIds: [] as string[] }
    return { fileIds: raw.fileIds.filter((id): id is string => typeof id === 'string') }
  })
  .handler(async ({ data }) => {
    const auth = await requireAuthenticatedUser(getServerFnRequest())
    if (!auth.ok) throw new Error(auth.message)
    return deleteFiles(data.fileIds)
  })
