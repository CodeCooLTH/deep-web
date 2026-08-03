'use client'

/**
 * CommentsClient — แท็บ "ความคิดเห็น" ในกล่องข้อความ (feature 00029)
 *
 * โครงตามที่ user เลือก (BRD BR-11..BR-14, อิงภาพ Meta Business Suite ที่ส่งมา 2026-08-03):
 *   [รายการโพสต์ เรียงตามคอมเมนต์ล่าสุด] [โพสต์ + คอมเมนต์ทั้งหมด + ช่องตอบ]
 *
 * Base: markup ของแถวรายการ/ช่องพิมพ์ยกมาจาก InboxList + ChatThread ของโปรเจกต์เอง
 * (ทั้งคู่ copy จาก theme/paces/Admin/TS/src/app/(admin)/apps/chat มาก่อนแล้ว) — ใช้ token
 * ของ Paces ล้วน ไม่มี arbitrary value และไม่มี emoji ในซอร์ส (HR7/HR12)
 *
 * รูปโพสต์ใช้ <img> ไม่ใช่ next/image เพราะ URL เป็น CDN ของ Meta (scontent-*.fbcdn.net)
 * ซึ่งไม่ได้อยู่ใน remotePatterns ของ next.config.ts — เพิ่ม host เข้าไปเป็นการเปิดช่องให้
 * โหลดรูปจากโดเมนภายนอกทั้งชุด จึงเลี่ยงไปก่อนใน v1
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { formatTimeHM, formatDateTimeTH } from '@/lib/format-date'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'

export type CommentPostItem = {
  id: string
  externalPostId: string
  message: string | null
  thumbnailUrl: string | null
  permalink: string | null
  lastCommentAt: string | null
  commentCount: number
  unansweredCount: number
  lastCommenterName: string | null
}

type CommentItem = {
  id: string
  externalCommentId: string
  parentExternalId: string | null
  fromName: string | null
  isFromPage: boolean
  message: string | null
  attachmentUrl: string | null
  createdTime: string
  editedAt: string | null
  isDeleted: boolean
  repliedByUserId: string | null
}

type ThreadData = {
  post: { id: string; message: string | null; permalink: string | null; thumbnailUrl: string | null }
  comments: CommentItem[]
}

export default function CommentsClient({ initialPosts }: { initialPosts: CommentPostItem[] }) {
  const [posts, setPosts] = useState(initialPosts)
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(initialPosts[0]?.id ?? null)
  const [thread, setThread] = useState<ThreadData | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  // ค้นหา (BRD Q-3) — ยิงที่ server เพราะต้องค้นในคอมเมนต์ ไม่ใช่แค่โพสต์ที่โหลดมาแล้ว
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/chat/comments/posts${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
        if (!res.ok) return
        const data = (await res.json()) as { items: CommentPostItem[] }
        setPosts(data.items)
      } catch {
        // ค้นหาไม่สำเร็จ = คงรายการเดิมไว้ ไม่ต้องรบกวนผู้ใช้
      }
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  const loadThread = useCallback(async (postId: string) => {
    setLoadingThread(true)
    setReplyTo(null)
    try {
      const res = await fetch(`/api/chat/comments/posts/${postId}`)
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        pacesToast.error(body?.error ?? 'โหลดความคิดเห็นไม่สำเร็จ')
        return
      }
      setThread((await res.json()) as ThreadData)
    } catch {
      pacesToast.error('โหลดความคิดเห็นไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
    } finally {
      setLoadingThread(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) void loadThread(selectedId)
  }, [selectedId, loadThread])

  /** คอมเมนต์ระดับบน + ลูกของแต่ละอัน (BR-13) */
  const tree = useMemo(() => {
    const list = thread?.comments ?? []
    const children = new Map<string, CommentItem[]>()
    for (const c of list) {
      if (!c.parentExternalId) continue
      const arr = children.get(c.parentExternalId) ?? []
      arr.push(c)
      children.set(c.parentExternalId, arr)
    }
    return list
      .filter((c) => !c.parentExternalId)
      .map((c) => ({ comment: c, replies: children.get(c.externalCommentId) ?? [] }))
  }, [thread])

  async function submitReply() {
    if (!replyTo || !replyText.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/chat/comments/${replyTo.id}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: replyText.trim() }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        pacesToast.error(body?.error ?? 'ตอบความคิดเห็นไม่สำเร็จ')
        return
      }
      setReplyText('')
      setReplyTo(null)
      pacesToast.success('ตอบความคิดเห็นแล้ว')
      if (selectedId) await loadThread(selectedId)
    } catch {
      pacesToast.error('ตอบความคิดเห็นไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
    } finally {
      setSending(false)
    }
  }

  const selectedPost = posts.find((p) => p.id === selectedId) ?? null

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── รายการโพสต์ ─────────────────────────────────────────── */}
      <div
        className={`border-default-200 flex min-w-0 flex-col border-e lg:flex lg:w-96 lg:shrink-0 ${
          selectedId ? 'hidden' : 'flex flex-1'
        }`}
      >
        <div className="border-default-200 border-b p-3">
          <div className="input-group">
            <span className="input-group-text">
              <Icon icon="search" />
            </span>
            <input
              type="search"
              className="form-input"
              placeholder="ค้นหาความคิดเห็นหรือชื่อผู้คอมเมนต์"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {posts.length === 0 ? (
            <div className="p-4">
              <SellerEmptyState
                compact
                icon="message-circle"
                title="ยังไม่มีความคิดเห็น"
                description="เมื่อมีคนคอมเมนต์ใต้โพสต์ของเพจ จะแสดงที่นี่"
              />
            </div>
          ) : (
            <div className="divide-default-200 divide-y">
              {posts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`flex w-full items-start gap-3 p-3 text-start ${
                    p.id === selectedId ? 'bg-primary/5' : 'hover:bg-default-100'
                  }`}
                >
                  {p.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnailUrl} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="bg-default-100 text-default-700 flex size-12 shrink-0 items-center justify-center rounded-lg">
                      <Icon icon="photo" className="text-xl" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="text-default-800 line-clamp-2 text-sm font-medium">
                      {p.message?.trim() || 'โพสต์ไม่มีข้อความ'}
                    </span>
                    <span className="text-default-700 mt-0.5 flex items-center gap-1.5 text-xs">
                      <span className="truncate">{p.lastCommenterName ?? 'ไม่ทราบชื่อ'}</span>
                      <span>·</span>
                      <span className="shrink-0">{p.commentCount} ความคิดเห็น</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-default-700 text-xs">
                      {p.lastCommentAt ? formatTimeHM(p.lastCommentAt) : ''}
                    </span>
                    {p.unansweredCount > 0 && (
                      <span className="bg-danger flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs text-white">
                        {p.unansweredCount}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── โพสต์ + ความคิดเห็น ─────────────────────────────────── */}
      <div className={`min-w-0 flex-1 flex-col ${selectedId ? 'flex' : 'hidden lg:flex'}`}>
        {!selectedPost ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <SellerEmptyState
              icon="message-circle"
              title="เลือกโพสต์เพื่อดูความคิดเห็น"
              description="รายการทางซ้ายเรียงตามโพสต์ที่มีความคิดเห็นล่าสุด"
            />
          </div>
        ) : (
          <>
            <div className="border-default-200 flex items-start gap-3 border-b p-3">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="กลับไปรายการโพสต์"
                className="hover:bg-default-100 text-default-700 flex size-9 shrink-0 items-center justify-center rounded-lg lg:hidden"
              >
                <Icon icon="arrow-left" className="text-lg" />
              </button>
              {selectedPost.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedPost.thumbnailUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-default-800 mb-0 line-clamp-2 text-sm font-medium">
                  {selectedPost.message?.trim() || 'โพสต์ไม่มีข้อความ'}
                </p>
                <p className="text-default-700 mb-0 text-xs">
                  {selectedPost.commentCount} ความคิดเห็น
                  {selectedPost.unansweredCount > 0 && ` · ยังไม่ตอบ ${selectedPost.unansweredCount}`}
                </p>
              </div>
              {selectedPost.permalink && (
                <a
                  href={selectedPost.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:bg-default-100 flex size-9 shrink-0 items-center justify-center rounded-lg"
                  aria-label="เปิดโพสต์บน Facebook"
                >
                  <Icon icon="external-link" className="text-lg" />
                </a>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              {loadingThread && !thread ? (
                <p className="text-default-700 text-center text-sm">กำลังโหลด...</p>
              ) : tree.length === 0 ? (
                <SellerEmptyState compact icon="message-circle" title="ยังไม่มีความคิดเห็นในโพสต์นี้" />
              ) : (
                tree.map(({ comment, replies }) => (
                  <div key={comment.id} className="mb-4">
                    <CommentBubble c={comment} onReply={() => setReplyTo(comment)} />
                    {replies.length > 0 && (
                      <div className="border-default-200 ms-6 mt-2 space-y-2 border-s ps-3">
                        {replies.map((r) => (
                          <CommentBubble key={r.id} c={r} onReply={() => setReplyTo(r)} />
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* ── ช่องตอบ ─────────────────────────────────────── */}
            <div className="border-default-200 border-t p-3">
              {replyTo ? (
                <>
                  <div className="text-default-700 mb-2 flex items-center gap-2 text-xs">
                    <Icon icon="corner-down-right" />
                    <span className="min-w-0 flex-1 truncate">
                      ตอบ {replyTo.fromName ?? 'ความคิดเห็น'}: {replyTo.message ?? '(ไม่มีข้อความ)'}
                    </span>
                    <button type="button" onClick={() => setReplyTo(null)} aria-label="ยกเลิกการตอบ">
                      <Icon icon="x" />
                    </button>
                  </div>
                  {/* BR-23: เตือนถาวร ไม่ใช่ toast ที่หายไป — คอมเมนต์เป็นข้อความสาธารณะ */}
                  <p className="text-warning mb-2 flex items-center gap-1.5 text-xs">
                    <Icon icon="alert-triangle" className="shrink-0" />
                    ทุกคนที่เห็นโพสต์นี้จะเห็นข้อความที่คุณตอบ — อย่าพิมพ์ที่อยู่หรือเบอร์ของลูกค้า
                  </p>
                  <div className="flex items-end gap-2">
                    <textarea
                      rows={2}
                      className="form-textarea grow"
                      placeholder="พิมพ์คำตอบสาธารณะ..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      disabled={sending}
                    />
                    <button
                      type="button"
                      onClick={submitReply}
                      disabled={sending || !replyText.trim()}
                      className="btn bg-primary hover:bg-primary-hover shrink-0 text-white disabled:opacity-60"
                    >
                      ตอบ <Icon icon="send-2" className="ms-1 text-xl" />
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-default-700 mb-0 text-center text-xs">
                  เลือก &quot;ตอบ&quot; ที่ความคิดเห็นเพื่อพิมพ์คำตอบ
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CommentBubble({ c, onReply }: { c: CommentItem; onReply: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          c.isFromPage ? 'bg-primary text-white' : 'bg-default-100 text-default-700'
        }`}
      >
        {c.isFromPage ? <Icon icon="building-store" className="text-base" /> : (c.fromName ?? '?').slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="bg-default-50 rounded-lg px-3 py-2">
          <p className="text-default-800 mb-0 text-xs font-semibold">
            {c.isFromPage ? 'เพจ' : (c.fromName ?? 'ไม่ทราบชื่อ')}
          </p>
          <p className="text-default-800 mb-0 whitespace-pre-wrap text-sm">
            {c.isDeleted ? 'ความคิดเห็นถูกลบ' : (c.message ?? '(ไม่มีข้อความ)')}
          </p>
          {c.attachmentUrl && !c.isDeleted && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.attachmentUrl} alt="" className="mt-2 max-h-40 rounded-lg" />
          )}
        </div>
        <div className="text-default-700 mt-1 flex items-center gap-2 text-xs">
          <span title={formatDateTimeTH(c.createdTime)}>{formatTimeHM(c.createdTime)}</span>
          {c.editedAt && <span>แก้ไขแล้ว</span>}
          {!c.isDeleted && (
            <button type="button" onClick={onReply} className="hover:underline">
              ตอบ
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
