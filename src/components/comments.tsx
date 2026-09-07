import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Textarea } from '#/components/ui/textarea'
import { DATABASE_ID, COLLECTIONS } from '#/lib/blog-schema'
import { describeError } from '#/lib/errors'
import { runIdempotent } from '#/lib/idempotency'
import { commentsChannel } from '#/lib/queries'
import { commentsOptions } from '#/lib/query-options'
import { parseComment, type Comment } from '#/lib/types'
import { getRealtimeConnection, subscribeRealtimeStatus, tw, useAuth } from '#/lib/torchwood-client'

/**
 * 评论区：Client 面直发评论 + Realtime WebSocket 订阅。
 * realtime 网关只接受终端用户 JWT（拒绝匿名与 API Key），因此登录后才开始订阅。
 *
 * 事件语义（at-least-once）：按 event_id 幂等去重；seq 作为本频道续传游标，
 * 断线重连成功后用 listChanges(since_seq) 补齐窗口，再衔接实时帧。
 */
export function CommentsSection({ postId }: { postId: string }) {
  const auth = useAuth()
  const comments = useQuery(commentsOptions(postId))
  useRealtimeComments(postId)

  return (
    <section className="space-y-4" aria-label="评论">
      <h2 className="text-lg font-semibold">评论（{comments.data?.length ?? 0}）</h2>

      {auth.status === 'signedIn' ? (
        <CommentForm postId={postId} />
      ) : (
        <Alert>
          <AlertTitle>想参与讨论？</AlertTitle>
          <AlertDescription>
            评论通过浏览器直连 Torchwood Client API 发表，需要先{' '}
            <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              登录
            </Link>{' '}
            或{' '}
            <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
              注册
            </Link>
            。
          </AlertDescription>
        </Alert>
      )}

      {comments.data && comments.data.length > 0 ? (
        <ul className="space-y-3">
          {comments.data.map((comment) => (
            <li key={comment.id}>
              <Card>
                <CardContent className="flex items-start justify-between gap-4 py-4">
                  <p className="whitespace-pre-wrap text-sm">{comment.content}</p>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={comment.createdAt}>
                    {formatDateTime(comment.createdAt)}
                  </time>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">还没有评论，来抢沙发。</p>
      )}
    </section>
  )
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function CommentForm({ postId }: { postId: string }) {
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')

  const mutation = useMutation({
    // 写幂等：同一次提交（含网络层重试）共用一个 Idempotency-Key。
    mutationFn: (text: string) =>
      runIdempotent(() =>
        tw.databases.createDocument(DATABASE_ID, COLLECTIONS.comments, {
          data: { post_id: postId, content: text },
        }),
      ),
    onMutate: (text) => {
      const optimistic: Comment = {
        id: `optimistic-${Date.now()}`,
        postId,
        content: text,
        createdAt: new Date().toISOString(),
        version: 1,
      }
      queryClient.setQueryData<Comment[]>(['comments', postId], (old) => [...(old ?? []), optimistic])
    },
    onError: (error: unknown) => {
      void queryClient.invalidateQueries({ queryKey: ['comments', postId] })
      toast.error(describeError(error))
    },
    onSettled: () => {
      // 服务端确认后对账（乐观条目会被真实数据替换）。
      void queryClient.invalidateQueries({ queryKey: ['comments', postId] })
    },
  })

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        const text = content.trim()
        if (!text) return
        mutation.mutate(text, {
          onSuccess: () => setContent(''),
        })
      }}
    >
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="写下你的评论……"
        rows={3}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={mutation.isPending || content.trim().length === 0}>
          发表评论
        </Button>
      </div>
    </form>
  )
}

/** Realtime 事件帧 payload 里文档的形状（与 REST Document 同形，出站帧不含 ACL）。 */
interface EventDocument {
  id?: unknown
  data?: unknown
  created_at?: unknown
  version?: unknown
}

function useRealtimeComments(postId: string): void {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const seen = useRef(new Set<string>())
  const maxSeq = useRef(0)

  useEffect(() => {
    if (auth.status !== 'signedIn') return

    const applyPayloads = (payloads: Record<string, unknown>[]) => {
      const fresh: Comment[] = []
      for (const payload of payloads) {
        const eventId = typeof payload['event_id'] === 'string' ? payload['event_id'] : null
        if (!eventId || seen.current.has(eventId)) continue
        seen.current.add(eventId)

        const seq = typeof payload['seq'] === 'number' ? payload['seq'] : Number(payload['seq'] ?? 0)
        if (Number.isFinite(seq) && seq > maxSeq.current) maxSeq.current = seq

        const event = typeof payload['event'] === 'string' ? payload['event'] : ''
        if (!event.endsWith('.create')) continue

        const doc = payload['data'] as EventDocument | undefined
        if (!doc || typeof doc !== 'object' || typeof doc.id !== 'string') continue
        const now = new Date().toISOString()
        const comment = parseComment({
          id: doc.id,
          data: (doc.data ?? {}) as Record<string, unknown>,
          created_at: typeof doc.created_at === 'string' ? doc.created_at : now,
          updated_at: typeof doc.created_at === 'string' ? doc.created_at : now,
          version: typeof doc.version === 'number' ? doc.version : 1,
        })
        if (comment.postId !== postId) continue
        fresh.push(comment)
      }
      if (fresh.length === 0) return
      queryClient.setQueryData<Comment[]>(['comments', postId], (old) => {
        const withoutOptimistic = (old ?? []).filter((c) => !c.id.startsWith('optimistic-'))
        const known = new Set(withoutOptimistic.map((c) => c.id))
        return [...withoutOptimistic, ...fresh.filter((c) => !known.has(c.id))]
      })
    }

    // 1) 实时帧。
    const connection = getRealtimeConnection()
    const subscription = connection.subscribe(commentsChannel(), (event) => {
      applyPayloads([event.payload])
    })

    // 2) 断线补偿：重连成功后拉 listChanges(since_seq)（补发先于新实时帧到达的语义由去重保证）。
    const unsubscribeStatus = subscribeRealtimeStatus((status) => {
      if (status !== 'connected') return
      tw.databases
        .listChanges(DATABASE_ID, COLLECTIONS.comments, { since_seq: maxSeq.current })
        .then((result) => {
          const payloads = (result.changes ?? []).map((change) => ({
            event_id: change.event_id,
            event: change.event,
            seq: change.seq,
            data: change.data,
          }))
          applyPayloads(payloads)
        })
        .catch(() => {
          // EVENTS.RESUME_EXPIRED（窗口过期）等情况：全量刷新兜底，游标重建。
          maxSeq.current = 0
          seen.current.clear()
          void queryClient.invalidateQueries({ queryKey: ['comments', postId] })
        })
    })

    return () => {
      subscription.unsubscribe()
      unsubscribeStatus()
    }
  }, [auth.status, postId, queryClient])
}
