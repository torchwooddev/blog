import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { Textarea } from '#/components/ui/textarea'
import { DATABASE_ID, COLLECTIONS } from '#/lib/blog-schema'
import { formatRelative } from '#/lib/format'
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

  const count = comments.data?.length ?? 0
  return (
    <section className="space-y-6 border-t pt-10" aria-label="评论">
      <h2 className="text-base font-semibold tracking-tight">
        评论 <span className="font-normal text-muted-foreground">（{count}）</span>
      </h2>

      {auth.status === 'signedIn' ? (
        <CommentForm postId={postId} />
      ) : (
        <div className="flex flex-col items-start justify-between gap-3 rounded-xl border bg-muted/40 p-4 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">登录后即可参与讨论。</p>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <Link to="/login">登录</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full">
              <Link to="/register">注册</Link>
            </Button>
          </div>
        </div>
      )}

      {comments.isLoading ? (
        <div className="space-y-5">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.data && comments.data.length > 0 ? (
        <ul className="divide-y">
          {comments.data.map((comment) => (
            <li key={comment.id} className="flex gap-3 py-5 first:pt-0">
              <CommentAvatar name={comment.authorName} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold">{comment.authorName ?? '匿名读者'}</span>
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={comment.createdAt}
                    title={comment.createdAt}
                  >
                    {formatRelative(comment.createdAt)}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[15px] leading-7">{comment.content}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
          还没有评论，来抢沙发。
        </p>
      )}
    </section>
  )
}

function CommentAvatar({ name }: { name: string | null }) {
  const initial = (name ?? '?').trim().slice(0, 1).toUpperCase()
  return (
    <Avatar className="size-8">
      <AvatarFallback className="bg-foreground/5 text-[11px] text-foreground ring-1 ring-border">
        {initial}
      </AvatarFallback>
    </Avatar>
  )
}

function CommentForm({ postId }: { postId: string }) {
  const queryClient = useQueryClient()
  const auth = useAuth()
  const [content, setContent] = useState('')

  const displayName = auth.account?.name || auth.account?.email || null

  const mutation = useMutation({
    // 写幂等：同一次提交（含网络层重试）共用一个 Idempotency-Key。
    mutationFn: (text: string) =>
      runIdempotent(() =>
        tw.databases.createDocument(DATABASE_ID, COLLECTIONS.comments, {
          data: {
            post_id: postId,
            content: text,
            ...(auth.account ? { author_id: auth.account.id } : {}),
            ...(displayName ? { author_name: displayName } : {}),
          },
        }),
      ),
    onMutate: (text) => {
      const optimistic: Comment = {
        id: `optimistic-${Date.now()}`,
        postId,
        content: text,
        authorId: auth.account?.id ?? null,
        authorName: displayName,
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
    <div className="flex gap-3">
      <CommentAvatar name={displayName} />
      <form
        className="flex-1 space-y-2.5"
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
          className="rounded-xl bg-muted/40"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" className="rounded-full px-5" disabled={mutation.isPending || content.trim().length === 0}>
            发表评论
          </Button>
        </div>
      </form>
    </div>
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
