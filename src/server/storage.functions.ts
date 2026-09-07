import { createServerFn } from '@tanstack/react-start'
import { deleteFiles, resolveFileRefs } from './storage.server'

/** 附件 ID → FileRef（详情页附件区、编辑器回显）。 */
export const getFiles = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { fileIds?: unknown }
    if (!Array.isArray(raw.fileIds)) return { fileIds: [] as string[] }
    return { fileIds: raw.fileIds.filter((id): id is string => typeof id === 'string') }
  })
  .handler(async ({ data }) => resolveFileRefs(data.fileIds))

/** 删除附件文件（文章删除协议的级联步骤）。 */
export const deleteStorageFiles = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { fileIds?: unknown }
    if (!Array.isArray(raw.fileIds)) return { fileIds: [] as string[] }
    return { fileIds: raw.fileIds.filter((id): id is string => typeof id === 'string') }
  })
  .handler(async ({ data }) => deleteFiles(data.fileIds))
