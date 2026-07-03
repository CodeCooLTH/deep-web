'use client'

/**
 * useSellerChatThread — extract logic จาก ChatThread.tsx เดิม (feat 00011 Deep Chat, ChatWidget task)
 *
 * ทำไม extract: full-page `/inbox/[conversationId]` (ChatThread.tsx) และ panel thread ของ
 * ChatWidget (ChatWidgetThreadPanel.tsx) ต้องใช้ fetch/realtime/send/upload/mark-read logic
 * ชุดเดียวกันเป๊ะ — แยกเป็น hook กันโค้ดซ้ำ 2 จุด (UX-Design-Spec-Bubble.md "Seller thread reuse")
 *
 * Base: inbox/[conversationId]/components/ChatThread.tsx (ก่อน extract) — state/effect ทั้งหมด
 * ยกมาตรง ๆ ไม่เปลี่ยน behavior; render/JSX ยังอยู่ที่ caller แต่ละที่ (full page การ์ด/header
 * ต่างจาก widget panel ที่ h-full ไม่มี .card ซ้ำ)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDate } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { CHAT_IMAGE_ALLOWED_TYPES } from '@/lib/chat-constants'

// duplicate literal ของ lib/storage MAX_SIZE — ไม่ import '@/lib/storage' ฝั่ง client เพราะ barrel
// นั้นดึง driver local/s3 (fs/server-only) เข้า client bundle ด้วย (เหตุผลเดียวกับไฟล์เดิมก่อน extract)
const CHAT_IMAGE_MAX_SIZE = 5 * 1024 * 1024

export type ChatMessageView = {
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

export type PendingImage = { fileId: string; previewUrl: string }

/** จัดกลุ่มข้อความตามวัน — formatDate (sanctioned lib, ห้าม Intl ตรง ตาม date-format.md) */
export function groupByDate(messages: ChatMessageView[]) {
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

export function useSellerChatThread(conversationId: string) {
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

  // ── แนบรูป (auto-upload ทันที — pattern ProductImagesCardV2.tsx) ────
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

  return {
    messages,
    oldestCursor,
    loadingInitial,
    loadingOlder,
    sending,
    uploading,
    errorState,
    text,
    setText,
    pendingImage,
    scrollRef,
    topSentinelRef,
    handleFileChange,
    handleRemoveImage,
    handleSend,
  }
}
