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
 * รูปโพสต์ใช้ img element ธรรมดา ไม่ใช่ next/image เพราะ URL เป็น CDN ของ Meta (scontent-*.fbcdn.net)
 * ซึ่งไม่ได้อยู่ใน remotePatterns ของ next.config.ts — เพิ่ม host เข้าไปเป็นการเปิดช่องให้
 * โหลดรูปจากโดเมนภายนอกทั้งชุด จึงเลี่ยงไปก่อนใน v1
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { formatTimeHM, formatDateTimeTH } from '@/lib/format-date'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'
import EmojiPicker from '../[conversationId]/components/EmojiPicker'
import { subscribeShopComments } from '@/lib/comment-realtime'
import { ChannelBadgeOverlay } from '../components/ChannelBadge'

export type ChannelOption = { id: string; name: string; provider: string; avatarUrl: string | null }

export type CommentPostItem = {
  id: string
  externalPostId: string
  channel: ChannelOption
  message: string | null
  thumbnailUrl: string | null
  permalink: string | null
  lastCommentAt: string | null
  commentCount: number
  unansweredCount: number
  lastCommenterName: string | null
  mediaType: string | null
  reactionCount: number | null
  fbCommentCount: number | null
  shareCount: number | null
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
  post: {
    id: string
    message: string | null
    permalink: string | null
    thumbnailUrl: string | null
    mediaType: string | null
    reactionCount: number | null
    fbCommentCount: number | null
    shareCount: number | null
  }
  channel: { name: string; avatarUrl: string | null; provider: string }
  comments: CommentItem[]
}

/** โพสต์วิดีโอหรือเปล่า — Graph ส่ง media_type เป็น 'video' ส่วน status_type เก่าใช้ 'added_video' */
function isVideoPost(mediaType: string | null | undefined): boolean {
  return !!mediaType && (mediaType === 'video' || mediaType.includes('video'))
}

export default function CommentsClient({
  initialPosts,
  shopId,
  channels,
}: {
  initialPosts: CommentPostItem[]
  /** ใช้ subscribe `comments:shop:{shopId}` — null = ไม่ subscribe (ไม่มีร้าน active) */
  shopId: string | null
  /** เพจที่ร้านเชื่อมไว้ — ใช้ทำตัวกรอง (user 2026-08-03: 'มีสิทธิ์ได้มาจากหลาย page ที่เชื่อม') */
  channels: ChannelOption[]
}) {
  const [posts, setPosts] = useState(initialPosts)
  const [q, setQ] = useState('')
  // null = ทุกเพจ; ตัวกรองอยู่ที่ server เหมือนแท็บข้อความ ไม่ใช่กรองเฉพาะที่โหลดมาแล้ว
  const [channelId, setChannelId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(initialPosts[0]?.id ?? null)
  const [thread, setThread] = useState<ThreadData | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  // แนบรูปในคำตอบ (user สั่ง 2026-08-03) — เอกสาร Meta: comment รับ `attachment_url` ได้
  // ใช้ท่าเดียวกับแชท: อัปขึ้น storage ของเราก่อน แล้ว server ค่อยทำ presigned URL ให้ Meta ดึง
  const [pendingFile, setPendingFile] = useState<{ fileId: string; previewUrl: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refreshPosts = useCallback(async (keyword: string, ch: string | null) => {
    try {
      const params = new URLSearchParams()
      if (keyword.trim()) params.set('q', keyword.trim())
      if (ch) params.set('channelId', ch)
      const qs = params.toString()
      const res = await fetch(`/api/chat/comments/posts${qs ? `?${qs}` : ''}`)
      if (!res.ok) return
      const data = (await res.json()) as { items: CommentPostItem[] }
      setPosts(data.items)
    } catch {
      // โหลดไม่สำเร็จ = คงรายการเดิมไว้ ไม่ต้องรบกวนผู้ใช้
    }
  }, [])

  // ค้นหา (BRD Q-3) — ยิงที่ server เพราะต้องค้นในคอมเมนต์ ไม่ใช่แค่โพสต์ที่โหลดมาแล้ว
  useEffect(() => {
    const t = setTimeout(() => void refreshPosts(q, channelId), 350)
    return () => clearTimeout(t)
  }, [q, channelId, refreshPosts])

  const loadThread = useCallback(async (postId: string, opts?: { silent?: boolean }) => {
    // silent = รอบ poll: ห้ามโชว์ spinner, ห้ามล้างคอมเมนต์ที่กำลังจะตอบ, ห้าม toast รบกวน
    if (!opts?.silent) {
      setLoadingThread(true)
      setReplyTo(null)
    }
    try {
      const res = await fetch(`/api/chat/comments/posts/${postId}`)
      if (!res.ok) {
        if (!opts?.silent) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          pacesToast.error(body?.error ?? 'โหลดความคิดเห็นไม่สำเร็จ')
        }
        return
      }
      setThread((await res.json()) as ThreadData)
    } catch {
      if (!opts?.silent) pacesToast.error('โหลดความคิดเห็นไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
    } finally {
      if (!opts?.silent) setLoadingThread(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) void loadThread(selectedId)
  }, [selectedId, loadThread])

  /**
   * ของใหม่เข้ามาเองทุก 15 วินาที (user report 2026-08-03 "ลองทักแล้วมันไม่ขึ้นใน tab ความคิดเห็น")
   *
   * ทำไม poll ไม่ใช่ realtime แบบแชท: ฝั่งแชทได้ broadcast มาจาก DB trigger บนตาราง ChatMessage
   * (migration 20260703000400) ซึ่งตาราง PageComment ยังไม่มี — จะทำให้เหมือนกันต้องเพิ่ม trigger
   * = migration บนฐานที่แชร์กับ prod. คอมเมนต์ไม่ได้ถี่เท่าแชทและไม่ต้องตอบภายในวินาที
   * 15 วินาทีจึงพอสำหรับ v1 แล้วค่อยยกไป realtime จริงพร้อมกับตอนทำ trigger
   *
   * หยุดเมื่อแท็บไม่ได้อยู่หน้าจอ — ไม่มีใครดูอยู่ก็ไม่ต้องยิง
   */
  const refreshAll = useCallback(() => {
    void refreshPosts(q, channelId)
    if (selectedId) void loadThread(selectedId, { silent: true })
  }, [q, channelId, selectedId, refreshPosts, loadThread])

  // realtime จริง (user สั่ง 2026-08-03 "ทำ trigger ให้เป็น realtime จริงเลย") — DB trigger บน
  // PageComment ยิง broadcast `comments:shop:{shopId}` แบบ signal-only แล้ว client refetch เอง
  // ดู migration 20260803180000_page_comment_realtime_broadcast
  useEffect(() => {
    if (!shopId) return
    return subscribeShopComments(shopId, refreshAll)
  }, [shopId, refreshAll])

  // fallback: realtime หลุด/socket ตาย → ยังตามของใหม่ได้ทุก 60 วิ (ถี่กว่านี้ไม่จำเป็นแล้ว
  // เพราะทางหลักคือ broadcast) — หยุดเมื่อแท็บไม่ได้อยู่หน้าจอ
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) refreshAll()
    }, 60_000)
    return () => clearInterval(timer)
  }, [refreshAll])

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

  async function pickFile(file: File | null) {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/chat/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        pacesToast.error(body?.error ?? 'อัปโหลดรูปไม่สำเร็จ')
        return
      }
      const data = (await res.json()) as { fileId: string }
      setPendingFile({ fileId: data.fileId, previewUrl: URL.createObjectURL(file) })
    } catch {
      pacesToast.error('อัปโหลดรูปไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function submitReply() {
    // เอกสาร Meta: ต้องมีอย่างน้อย message หรือ attachment — รูปอย่างเดียวส่งได้
    if (!replyTo || (!replyText.trim() && !pendingFile) || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/chat/comments/${replyTo.id}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: replyText.trim(), fileId: pendingFile?.fileId ?? null }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        pacesToast.error(body?.error ?? 'ตอบความคิดเห็นไม่สำเร็จ')
        return
      }
      setReplyText('')
      setPendingFile(null)
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
        {channels.length > 0 && (
          // ตัวกรองเพจ (user 2026-08-03) — เดิมซ่อนเมื่อมีเพจเดียวเพราะคิดว่าเป็นปุ่มที่กดแล้วไม่มีอะไร
          // เปลี่ยน แต่ user รายงานว่า "ตัวกรองยังไม่มี" (ร้านที่ทดสอบมีเพจเดียว) — แถวนี้ทำหน้าที่
          // บอกด้วยว่า "คอมเมนต์พวกนี้มาจากเพจไหน" ซึ่งมีค่าแม้มีเพจเดียว จึงแสดงเสมอเหมือนแท็บข้อความ
          <div className="border-default-200 flex gap-1 overflow-x-auto border-b p-2">
            <button
              type="button"
              onClick={() => setChannelId(null)}
              className={`min-h-9 shrink-0 rounded-lg px-3 text-sm ${
                channelId === null ? 'bg-primary text-white' : 'text-default-700 hover:bg-default-100'
              }`}
            >
              ทั้งหมด
            </button>
            {channels.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChannelId(c.id)}
                title={c.name}
                className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm ${
                  channelId === c.id ? 'bg-primary text-white' : 'text-default-700 hover:bg-default-100'
                }`}
              >
                <Icon icon="brand-facebook" className="text-base" />
                <span className="max-w-32 truncate">{c.name}</span>
              </button>
            ))}
          </div>
        )}
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
                  {/* รูปโพสต์ + ป้ายเพจมุมล่างขวา (user 2026-08-03 'ต้องมี icon page ติดไว้ด้วย
                      ว่าเป็นของเพจไหน') — pattern overlay เดียวกับ ChannelBadge บน avatar ในแท็บข้อความ */}
                  <span className="relative shrink-0">
                    {p.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnailUrl} alt="" className="size-12 rounded-lg object-cover" />
                    ) : (
                      <span className="bg-default-100 text-default-700 flex size-12 items-center justify-center rounded-lg">
                        <Icon icon="photo" className="text-xl" />
                      </span>
                    )}
                    {/* ใช้ ChannelBadgeOverlay ตัวเดียวกับ badge ช่องทางในแท็บข้อความ — มีโลโก้
                        Facebook เป็นไฟล์ asset อยู่แล้ว (/images/logos/facebook.svg) ไม่ต้อง
                        hardcode สีแบรนด์ซ้ำที่นี่ และหน้าตาตรงกันทั้งสองแท็บโดยอัตโนมัติ */}
                    <ChannelBadgeOverlay channel={p.channel.provider} imageUrl={p.channel.avatarUrl ?? undefined} />
                    {isVideoPost(p.mediaType) && (
                      // โพสต์วิดีโอ — บอกตั้งแต่รายการ ไม่ต้องเปิดเข้าไปถึงจะรู้
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex size-6 items-center justify-center rounded-full bg-black/50 text-white">
                          <Icon icon="player-play-filled" className="text-xs" />
                        </span>
                      </span>
                    )}
                  </span>
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
            {/* หัวโพสต์ — โครงตามหน้าโพสต์จริงของ Facebook ที่ user ส่งมา 2026-08-03:
                รูป/วิดีโอปก → ข้อความโพสต์ → แถวยอด ไลก์ · ความคิดเห็น · แชร์
                วิดีโอเล่นในหน้าเราไม่ได้ (URL วิดีโอของ Meta เป็น signed URL อายุสั้น + ไม่มีสิทธิ์
                อ่านไฟล์) จึงเป็นรูปปก + ปุ่มเล่นที่พาไปเปิดของจริงบน Facebook */}
            <div className="border-default-200 border-b">
              <div className="flex items-start gap-3 p-3">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="กลับไปรายการโพสต์"
                  className="hover:bg-default-100 text-default-700 flex size-9 shrink-0 items-center justify-center rounded-lg lg:hidden"
                >
                  <Icon icon="arrow-left" className="text-lg" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-default-800 mb-0 whitespace-pre-wrap text-sm">
                    {selectedPost.message?.trim() || 'โพสต์ไม่มีข้อความ'}
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

              {selectedPost.thumbnailUrl && (
                <a
                  href={selectedPost.permalink ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-default-100 relative block"
                  aria-label={isVideoPost(selectedPost.mediaType) ? 'เล่นวิดีโอบน Facebook' : 'เปิดโพสต์บน Facebook'}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedPost.thumbnailUrl} alt="" className="max-h-72 w-full object-contain" />
                  {isVideoPost(selectedPost.mediaType) && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex size-14 items-center justify-center rounded-full bg-black/55 text-white">
                        <Icon icon="player-play-filled" className="text-2xl" />
                      </span>
                    </span>
                  )}
                </a>
              )}

              <div className="text-default-700 flex flex-wrap items-center gap-4 px-3 py-2 text-xs">
                <span className="flex items-center gap-1">
                  <Icon icon="thumb-up" className="text-sm" />
                  {selectedPost.reactionCount ?? '–'}
                </span>
                <span className="flex items-center gap-1">
                  <Icon icon="message-circle-2" className="text-sm" />
                  {selectedPost.fbCommentCount ?? selectedPost.commentCount}
                </span>
                <span className="flex items-center gap-1">
                  <Icon icon="share-3" className="text-sm" />
                  {selectedPost.shareCount ?? '–'}
                </span>
                {selectedPost.unansweredCount > 0 && (
                  <span className="text-danger font-medium">ยังไม่ตอบ {selectedPost.unansweredCount}</span>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              {loadingThread && !thread ? (
                <p className="text-default-700 text-center text-sm">กำลังโหลด...</p>
              ) : tree.length === 0 ? (
                <SellerEmptyState compact icon="message-circle" title="ยังไม่มีความคิดเห็นในโพสต์นี้" />
              ) : (
                tree.map(({ comment, replies }) => (
                  <div key={comment.id} className="mb-5">
                    <CommentBubble c={comment} channel={thread?.channel} onReply={() => setReplyTo(comment)} />
                    {replies.length > 0 && (
                      // ย่อหน้าเฉย ๆ แบบ Facebook — เส้นตั้งของเดิมทำให้อ่านเป็น "บล็อกโค้ด" มากกว่าบทสนทนา
                      <div className="ms-10 mt-2 space-y-3">
                        {replies.map((r) => (
                          <CommentBubble key={r.id} c={r} channel={thread?.channel} isReply onReply={() => setReplyTo(r)} />
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
                  {pendingFile && (
                    <div className="relative mb-2 inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pendingFile.previewUrl} alt="" className="max-h-28 rounded-lg" />
                      <button
                        type="button"
                        onClick={() => setPendingFile(null)}
                        aria-label="เอารูปออก"
                        className="absolute end-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/50 text-white"
                      >
                        <Icon icon="x" className="text-sm" />
                      </button>
                    </div>
                  )}
                  <div className="relative flex items-end gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || sending}
                      aria-label="แนบรูปในคำตอบ"
                      className="hover:bg-default-100 text-default-700 flex size-11 shrink-0 items-center justify-center rounded-lg disabled:opacity-60"
                    >
                      <Icon icon={uploading ? 'loader-2' : 'photo'} className="text-xl" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmojiOpen((v) => !v)}
                      aria-label="เลือกอิโมจิ"
                      className="hover:bg-default-100 text-default-700 flex size-11 shrink-0 items-center justify-center rounded-lg"
                    >
                      <Icon icon="mood-smile" className="text-xl" />
                    </button>
                    {emojiOpen && (
                      <EmojiPicker
                        onSelect={(emoji) => setReplyText((prev) => prev + emoji)}
                        onClose={() => setEmojiOpen(false)}
                      />
                    )}
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
                      disabled={sending || (!replyText.trim() && !pendingFile)}
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

function CommentBubble({
  c,
  channel,
  onReply,
  isReply = false,
}: {
  c: CommentItem
  channel?: { name: string; avatarUrl: string | null; provider: string }
  onReply: () => void
  isReply?: boolean
}) {
  /**
   * โครงตามภาพ Facebook จริงที่ user ส่งมา 2026-08-03 ("ต้องดูรู้เรื่องกว่านี้ ตอนนี้มันดูยาก แยกยาก"):
   *   [รูป]  ┌ ชื่อ (หนา) · ป้ายผู้ดูแลเพจ ┐
   *          │ ข้อความ                    │  ← บับเบิลหุ้มเฉพาะเนื้อหา ไม่ยืดเต็มแถว
   *          └───────────────────────────┘
   *          เวลา · ตอบ                      ← อยู่นอกบับเบิล ตัวเล็ก สีจาง
   *
   * ของเดิมยืดบับเบิลเต็มความกว้างทุกอัน ทำให้คอมเมนต์สั้น ๆ กลายเป็นแถบยาวเท่ากันหมด แยกไม่ออกว่า
   * ใครพูด/อันไหนจบตรงไหน — Facebook หุ้มเฉพาะข้อความจึงอ่านเป็น "บทสนทนา" ได้ทันที
   *
   * แยกฝั่งด้วย 2 อย่างพร้อมกัน ไม่พึ่งสีอย่างเดียว (user: "สีสันดูยากมาก"):
   *   1. ป้าย "ผู้ดูแลเพจ" ข้างชื่อ (เทียบเท่า Author ของ Facebook)
   *   2. สีพื้นบับเบิล — ลูกค้า = bg-default-100 (เทา), เพจ = bg-primary/10 (ฟ้าจาง)
   * ทั้งคู่เป็น token ของ Paces ตัวอักษรยังเป็น text-default-800 คอนทราสต์เท่าเดิม
   */
  const displayName = c.isFromPage
    ? (c.fromName ?? channel?.name ?? 'เพจ')
    : (c.fromName ?? 'ผู้ใช้ Facebook')
  const avatarSize = isReply ? 'size-7' : 'size-8'

  return (
    <div className="flex items-start gap-2">
      {c.isFromPage && channel?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={channel.avatarUrl} alt="" className={`${avatarSize} shrink-0 rounded-full object-cover`} />
      ) : (
        <span
          className={`flex ${avatarSize} shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            c.isFromPage ? 'bg-primary text-white' : 'bg-default-200 text-default-700'
          }`}
        >
          {c.isFromPage ? (
            <Icon icon="building-store" className="text-sm" />
          ) : c.fromName ? (
            c.fromName.slice(0, 1)
          ) : (
            <Icon icon="user" className="text-sm" />
          )}
        </span>
      )}

      <div className="min-w-0 flex-1">
        {/* บับเบิลหุ้มเนื้อหา: inline-block + max-w กันคอมเมนต์ยาวลากเต็มจอบนจอกว้าง */}
        <div
          className={`inline-block max-w-2xl rounded-2xl px-3 py-2 ${
            c.isFromPage ? 'bg-primary/10' : 'bg-default-100'
          }`}
        >
          <p className="mb-0 flex flex-wrap items-center gap-1.5">
            <span className="text-default-800 text-sm font-semibold">{displayName}</span>
            {c.isFromPage && (
              <span className="text-primary inline-flex items-center gap-0.5 text-2xs font-medium">
                <Icon icon="pencil" className="text-2xs" />
                ผู้ดูแลเพจ
              </span>
            )}
          </p>
          <p className="text-default-800 mb-0 whitespace-pre-wrap text-sm">
            {c.isDeleted ? 'ความคิดเห็นถูกลบ' : (c.message ?? '(ไม่มีข้อความ)')}
          </p>
          {c.attachmentUrl && !c.isDeleted && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.attachmentUrl} alt="" className="mt-2 max-h-40 rounded-lg" />
          )}
        </div>

        {/* เวลา + ปุ่มตอบ อยู่นอกบับเบิล ตัวเล็กสีจาง — จังหวะเดียวกับ Facebook */}
        <div className="text-default-700 mt-0.5 flex items-center gap-3 ps-3 text-xs">
          <span title={formatDateTimeTH(c.createdTime)}>{formatTimeHM(c.createdTime)}</span>
          {c.editedAt && <span>แก้ไขแล้ว</span>}
          {!c.isDeleted && (
            <button type="button" onClick={onReply} className="font-medium hover:underline">
              ตอบ
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
