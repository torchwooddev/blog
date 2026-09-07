import { createFileRoute } from '@tanstack/react-router'
import {
  extractUploadFile,
  uploadToBlogBucket,
  verifyUploader,
} from '#/server/storage.server'

/**
 * POST /api/upload：附件上传（multipart，字段名 file）。
 * 同源代理 → 校验调用者 JWT（终端用户）→ Server 面 SDK 上传到 blog-media 桶。
 * 返回解析后的 FileRef（含决定性的 view/preview/download URL）。
 */
export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await verifyUploader(request)
        if (!auth.ok) {
          return Response.json({ ok: false, message: auth.message }, { status: auth.status })
        }
        let file: File
        try {
          const form = await request.formData()
          const extracted = extractUploadFile(form)
          if (extracted instanceof File) {
            file = extracted
          } else {
            return Response.json({ ok: false, message: extracted.message }, { status: extracted.status })
          }
        } catch {
          return Response.json({ ok: false, message: '请求必须是 multipart/form-data。' }, { status: 400 })
        }
        try {
          const ref = await uploadToBlogBucket(file)
          return Response.json({ ok: true, file: ref })
        } catch (e) {
          return Response.json(
            { ok: false, message: e instanceof Error ? e.message : '上传失败' },
            { status: 502 },
          )
        }
      },
    },
  },
})
