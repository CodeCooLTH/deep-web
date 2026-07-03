'use client'

/**
 * ChatThread — client thread component ของ /inbox/[conversationId] (feat 00011 Deep Chat, S-12)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ChatPage.tsx:33-110
 * (card > card-header > scroll body > composer) — ตัด sidebar offcanvas/ChatToolbar/online-status
 * (UX-Design-Spec.md §S-12) + แก้ scroll body จาก SimpleBar → plain `<div overflow-y-auto>` + ref
 * (ต้อง programmatic scroll สำหรับ preserve-scroll ตอน load-older + scroll-to-bottom ตอนส่ง)
 * bubble สี: ซ้าย=BUYER `bg-light`, ขวา=SHOP `bg-primary/15` (Base ใช้ bg-warning/15/bg-info/15 —
 * แก้ตาม spec ให้ตรง semantic ผู้ส่งจริง)
 *
 * Avatar: reuse pattern BidderAvatar จาก AuctionBidFeed.tsx (ดู InboxList.tsx comment เดียวกัน)
 * Upload: pattern ProductImagesCardV2.tsx:54-90 (auto-upload ทันทีที่เลือกไฟล์ → preview chip)
 * Realtime: pattern AuctionDetailClient.tsx:144-179 (Supabase broadcast, signal-only ไม่เชื่อ payload)
 * Date divider group: pattern NotificationFeed.tsx (formatDate เทียบ today/yesterday, ห้าม Intl ตรง)
 *
 * arbitrary value `h-[calc(100vh-190px)]`: copy ตรงจาก Base ChatPage.tsx L22 — เป็น convention ของ
 * Paces "full-viewport app" (chat/kanban/email/file-manager ใน theme ใช้ pattern เดียวกันหมด)
 * ไม่ใช่ค่าที่เดาเอง — Paces ไม่มี token สำหรับ viewport-locked height
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { generateInitials } from '@/utils/helpers'
import { formatDate, formatTime } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { CHAT_IMAGE_ALLOWED_TYPES } from '@/lib/chat-constants'
import SellerEmptyState from '../../../_shared/SellerEmptyState'
import SellerErrorState from '../../../_shared/SellerErrorState'
import { SellerThreadSkeleton } from '../../../_shared/SellerCardSkeleton'

// duplicate literal ของ lib/storage MAX_SIZE — ไม่ import '@/lib/storage' ฝั่ง client เพราะ barrel
// นั้นดึง driver local/s3 (fs/server-only) เข้า client bundle ด้วย (ProductImagesCardV2.tsx ก็ไม่ import เช่นกัน)
const CHAT_IMAGE_MAX_SIZE = 5 * 1024 * 1024

type ChatMessageView = {
  id: string
  conversationId: string
  senderUserId: string
  senderRole: 'BUYER' | 'SHOP'
  type: 'TEXT' | 'IMAGE'
  body: string | null
  imageUrl: string | null
  createdAt: string
}

type MessagesApiResponse = { items: ChatMessageView[]; nextCursor: string | null }

type PendingImage = { fileId: string; previewUrl: string }

type Props = {
  conversationId: string
  buyerName: string
  buyerAvatar: string | null
}

/** avatar เล็ก — รูปจริง (http URL หรือ storage fileId) + fallback initials */
function ChatAvatar({ avatar, name, size = 'size-9' }: { avatar: string | null; name: string; size?: string }) {
  const [failed, setFailed] = useState(false)
  const src = avatar ? (avatar.startsWith('http') ? avatar : `/api/files/${avatar}`) : null
  if (!src || failed) {
    return (
      <span className={`bg-primary/10 text-primary flex ${size} shrink-0 items-center justify-center rounded-full text-sm font-semibold`}>
        {generateInitials(name) || '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${size} shrink-0 rounded-full bg-default-100 object-cover`}
    />
  )
}

/** จัดกลุ่มข้อความตามวัน — formatDate (sanctioned lib, ห้าม Intl ตรงในไฟล์นี้ ตาม date-format.md) */
function groupByDate(messages: ChatMessageView[]) {
  const todayStr = formatDate(new Date())
  const yesterdayStr = formatDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
  const groups: { key: string; label: string; items: ChatMessageView[] }[] = []
  for (const m of messages) {
    const key = formatDate(m.createdAt)
    const label = key === todayStr ? 'วันนี้' : key === yesterdayStr ? 'เมื่อวานนี้' : key
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(m)
    else groups.push({ key, label, items: [m] })
  }
  return groups
}

export default function ChatThread({ conversationId, buyerName, buyerAvatar }: Props) {
  const [messages, setMessages] = useState<ChatMessageView[]>([])
  const [oldestCursor, setOldestCursor] = useState<string | null>(null)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [errorState, setErrorState] = useState(false)
  const [text, setText] = useState('')
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const markReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  const markReadDebounced = useCallback(() => {
    if (markReadTimer.current) clearTimeout(markReadTimer.current)
    markReadTimer.current = setTimeout(() => {
      fetch(`/api/chat/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {})
    }, 500)
  }, [conversationId])

  // ── initial load + mark-read on mount ──────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function loadInitial() {
      setLoadingInitial(true)
      try {
        const res = await fetch(`/api/chat/conversations/${conversationId}/messages?take=30`)
        if (res.status === 403 || res.status === 404) {
          if (!cancelled) setErrorState(true)
          return
        }
        if (!res.ok) throw new Error('load failed')
        const data: MessagesApiResponse = await res.json()
        if (cancelled) return
        setMessages([...data.items].reverse())
        setOldestCursor(data.nextCursor)
        scrollToBottom()
        // mark-read ทันทีตอนเปิด thread (ไม่ debounce รอบแรก)
        fetch(`/api/chat/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {})
      } catch {
        if (!cancelled) setErrorState(true)
      } finally {
        if (!cancelled) setLoadingInitial(false)
      }
    }
    loadInitial()
    return () => {
      cancelled = true
    }
  }, [conversationId, scrollToBottom])

  // ── refetch "newer" — signal-only realtime (ไม่เชื่อ payload, GET หน้าแรกเสมอแล้ว merge) ──
  const refetchNewer = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages?take=30`)
      if (!res.ok) return
      const data: MessagesApiResponse = await res.json()
      setMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]))
        for (const m of data.items) map.set(m.id, m)
        return Array.from(map.values()).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )
      })
    } catch {
      // เงียบ — รอ broadcast ถัดไป/focus fallback
    }
  }, [conversationId])

  // ── realtime subscribe: chat:{conversationId} ──────────────────────────
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on('broadcast', { event: 'update' }, () => {
        refetchNewer()
        markReadDebounced()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, refetchNewer, markReadDebounced])

  // ── fallback: refetch เมื่อ tab กลับมา focus (กัน realtime หลุดเงียบ) ──
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') refetchNewer()
    }
    document.addEventListener('visibilitychange', handler)
    window.addEventListener('focus', handler)
    return () => {
      document.removeEventListener('visibilitychange', handler)
      window.removeEventListener('focus', handler)
    }
  }, [refetchNewer])

  // ── load-older: sentinel บนสุด + preserve scroll position ──────────────
  const loadOlder = useCallback(async () => {
    if (!oldestCursor || loadingOlder) return
    setLoadingOlder(true)
    const root = scrollRef.current
    const prevHeight = root?.scrollHeight ?? 0
    try {
      const params = new URLSearchParams({ cursor: oldestCursor, take: '30' })
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages?${params.toString()}`)
      if (!res.ok) throw new Error('load-older failed')
      const data: MessagesApiResponse = await res.json()
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id))
        const older = [...data.items].reverse().filter((m) => !existing.has(m.id))
        return [...older, ...prev]
      })
      setOldestCursor(data.nextCursor)
      requestAnimationFrame(() => {
        if (root) root.scrollTop = root.scrollHeight - prevHeight
      })
    } catch {
      pacesToast.error('โหลดข้อความเก่าไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setLoadingOlder(false)
    }
  }, [conversationId, oldestCursor, loadingOlder])

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = topSentinelRef.current
    if (!root || !sentinel || !oldestCursor) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadOlder()
      },
      { root, threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadOlder ผูก closure ของ oldestCursor/loadingOlder ปัจจุบันอยู่แล้ว
  }, [oldestCursor, messages.length])

  // ── attach รูป (auto-upload ทันที — pattern ProductImagesCardV2.tsx) ────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset — เลือกไฟล์เดิมซ้ำได้
    if (!file) return

    if (!(CHAT_IMAGE_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
      pacesToast.error('รองรับเฉพาะไฟล์รูปภาพ (jpg, png, webp)')
      return
    }
    if (file.size > CHAT_IMAGE_MAX_SIZE) {
      pacesToast.error('รองรับเฉพาะไฟล์รูปภาพ (jpg, png, webp) ขนาดไม่เกิน 5MB')
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('upload failed')
      const data: { fileId: string } = await res.json()
      setPendingImage({ fileId: data.fileId, previewUrl })
    } catch {
      pacesToast.error('อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง')
      URL.revokeObjectURL(previewUrl)
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveImage = () => {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl)
    setPendingImage(null)
  }

  // ── ส่งข้อความ ───────────────────────────────────────────────────────
  const handleSend = async () => {
    if (sending) return
    const trimmed = text.trim()
    if (!pendingImage && trimmed.length === 0) return

    setSending(true)
    try {
      const payload = pendingImage
        ? { type: 'IMAGE' as const, imageUrl: pendingImage.fileId, body: trimmed || null }
        : { type: 'TEXT' as const, body: trimmed }

      const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.status === 429) {
        pacesToast.error('ส่งข้อความถี่เกินไป กรุณารอสักครู่')
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        pacesToast.error(data?.error ?? 'ส่งข้อความไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }

      const message: ChatMessageView = await res.json()
      setMessages((prev) => [...prev, message])
      setText('')
      if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl)
      setPendingImage(null)
      scrollToBottom()
    } catch {
      pacesToast.error('ส่งข้อความไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSending(false)
    }
  }

  // ── render ───────────────────────────────────────────────────────────
  if (errorState) {
    // reuse SellerErrorState แทนเขียนการ์ด error ใหม่ (Link ใช้ next/link ได้ปกติในนี้ — ไฟล์นี้เป็น
    // client component 'use client' อยู่แล้ว ไม่ใช่ RSC จึงไม่ชน Hard Rule 2)
    return (
      <SellerErrorState
        title="ไม่พบบทสนทนานี้"
        message="บทสนทนานี้อาจถูกลบ หรือคุณไม่มีสิทธิ์เข้าถึง"
        retryHref="/inbox"
      />
    )
  }

  if (loadingInitial) {
    return <SellerThreadSkeleton />
  }

  const groups = groupByDate(messages)

  return (
    <div className="card h-[calc(100vh-190px)] min-w-0 flex-1 flex flex-col">
      {/* card-header — avatar+ชื่อผู้ซื้อ (deviate จาก Base: เพิ่ม avatar, ตัด online-status) */}
      <div className="card-header">
        <div className="flex items-center gap-3">
          <ChatAvatar avatar={buyerAvatar} name={buyerName} />
          <h5 className="text-base mb-0">{buyerName}</h5>
        </div>
      </div>

      {/* scroll body — plain div + ref (ไม่ SimpleBar ตาม spec, ต้อง programmatic scroll) */}
      <div ref={scrollRef} className="card-body min-h-0 grow overflow-y-auto py-4">
        {oldestCursor && (
          <div ref={topSentinelRef} className="flex justify-center py-2">
            {loadingOlder && (
              <div
                className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent"
                role="status"
                aria-label="กำลังโหลด"
              />
            )}
          </div>
        )}

        {messages.length === 0 ? (
          <SellerEmptyState
            compact
            icon="message-circle-2"
            title="เริ่มต้นการสนทนา"
            description="พิมพ์ข้อความทักทายลูกค้าได้เลย"
          />
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              {/* date divider — badge chip กึ่งกลาง */}
              <div className="my-4 flex justify-center">
                <span className="badge bg-default-100 text-default-500 text-2xs">{g.label}</span>
              </div>

              {g.items.map((m) => {
                const mine = m.senderRole === 'SHOP'
                return (
                  <div key={m.id} className={`my-3 flex items-end gap-2.5 ${mine ? 'justify-end' : 'justify-start'}`}>
                    {!mine && <ChatAvatar avatar={buyerAvatar} name={buyerName} size="size-7" />}
                    <div className={`max-w-[75%] ${mine ? 'text-end' : ''}`}>
                      <div className={`rounded px-4 py-2.5 ${mine ? 'bg-primary/15' : 'bg-light'}`}>
                        {m.type === 'IMAGE' && m.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/files/${m.imageUrl}`}
                            alt="รูปภาพที่ส่ง"
                            className="max-w-60 rounded"
                          />
                        )}
                        {m.body && (
                          <p className={`text-default-800 text-sm ${m.type === 'IMAGE' ? 'mt-2' : ''} mb-0`}>
                            {m.body}
                          </p>
                        )}
                      </div>
                      <div className="text-default-400 mt-1 flex items-center gap-1 text-xs">
                        {mine && <span className="grow" />}
                        <Icon icon="clock" />
                        {formatTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {/* composer — pattern ChatPage.tsx:99-109 + auto-upload preview chip */}
      <div className="border-t border-default-300 border-dashed px-4 py-3 sm:px-6 sm:py-3.75">
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2">
            <div className="border-default-200 relative size-14 overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingImage.previewUrl} alt="ตัวอย่างรูปที่จะส่ง" className="size-full object-cover" />
            </div>
            <button
              type="button"
              onClick={handleRemoveImage}
              className="btn btn-sm btn-icon border-default-300"
              aria-label="ลบรูป"
            >
              <Icon icon="x" className="text-base" />
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <label className="btn btn-icon border-default-300 shrink-0 cursor-pointer" aria-label="แนบรูปภาพ">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading || sending}
            />
            <Icon icon={uploading ? 'loader-2' : 'paperclip'} className={`text-lg ${uploading ? 'animate-spin' : ''}`} />
          </label>

          <div className="input-icon-group grow">
            <Icon icon="message" className="input-icon" />
            <input
              type="text"
              className="form-input bg-light/20"
              placeholder={pendingImage ? 'เพิ่มคำบรรยาย (ไม่บังคับ)' : 'พิมพ์ข้อความ...'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={sending}
            />
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={sending || uploading || (!text.trim() && !pendingImage)}
            className="btn bg-primary text-white hover:bg-primary-hover shrink-0 disabled:opacity-60"
          >
            ส่ง <Icon icon="send-2" className="ms-1 text-xl" />
          </button>
        </div>
      </div>
    </div>
  )
}
