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
import { playChatBeep } from '@/lib/chat-sound'

// duplicate literal ของ lib/storage MAX_SIZE — ไม่ import '@/lib/storage' ฝั่ง client เพราะ barrel
// นั้นดึง driver local/s3 (fs/server-only) เข้า client bundle ด้วย (เหตุผลเดียวกับไฟล์เดิมก่อน extract)
const CHAT_IMAGE_MAX_SIZE = 5 * 1024 * 1024

// extension #1 Chat Product Context Card (S-18/S-21) — enrich payload ต่อข้อความ type='PRODUCT'
// จาก GET .../messages (route.ts ทำ batch fetch productMap แล้วแนบเข้าแต่ละ item); null = ลบสินค้าจริง
export type ChatProductCard = {
  id: string
  name: string
  price: number
  imageFileId: string | null
  isActive: boolean
}

// การ์ดออเดอร์/ใบเสนอราคาในแชท (user 2026-07-24) — enrich ต่อข้อความ type='ORDER' จาก GET .../messages
// (route.ts batch fetch orderMap แล้วแนบเข้าแต่ละ item); null = order ถูกลบจริง
export type ChatOrderCard = {
  token: string
  orderNo?: string | null // เลขคำสั่งซื้อ DP… (user 2026-07-25)
  status: string
  totalAmount: string // "1234.00" — Decimal serialize เป็น string
  // รายการสินค้าในออเดอร์ (user 2026-07-25) — name/qty/ราคาต่อชิ้น + รูป (null = custom line ไม่มีสินค้า)
  items: { name: string; qty: number; price: string; imageFileId: string | null }[]
}

// optimistic send (composer UX): payload ที่ใช้ resend เมื่อกด "ลองใหม่"
// imageUrl optional (ไม่ใส่เลยสำหรับ TEXT) — SendChatMessageSchema.imageUrl ไม่รับ null รับแค่ string/undefined
// replyToMessageId (user 2026-07-25): ตอบทับข้อความ id นี้ — route resolve → reply_to:{mid} ให้ Meta
export type OutgoingRetry = { type: 'TEXT' | 'IMAGE'; body: string | null; imageUrl?: string; replyToMessageId?: string }

export type ChatMessageView = {
  /** ลำดับที่แถวถูกบันทึกจริง — ตัวตัดสินเมื่อ createdAt เท่ากัน (ดู schema.prisma ChatMessage.seq)
   *  optional เพราะข้อความ optimistic ที่สร้างฝั่ง client ยังไม่มีจนกว่าจะบันทึกจริง */
  seq?: number
  id: string
  conversationId: string
  senderUserId: string
  senderRole: 'BUYER' | 'SHOP'
  // VIDEO/AUDIO/FILE = ไฟล์แนบช่องทางนอก (feature 00018) — fileId เก็บใน imageUrl เหมือน IMAGE
  // ORDER = การ์ดออเดอร์/ใบเสนอราคา (user 2026-07-24) — enrich orderCard จาก GET
  type: 'TEXT' | 'IMAGE' | 'PRODUCT' | 'VIDEO' | 'AUDIO' | 'FILE' | 'ORDER'
  body: string | null
  imageUrl: string | null
  createdAt: string
  productCard?: ChatProductCard | null
  orderCard?: ChatOrderCard | null
  // extension #3 Scam-link Detection (FR-SCAM-03/04) — API GET/POST enrich ต่อข้อความ TEXT เท่านั้น
  // (S-30 chat.service.ts ChatMessageView) ใช้แสดง warning banner ในบับเบิล ไม่ block ส่ง
  flaggedScam?: boolean
  // feature 00018 Phase 2 — emoji ที่ลูกค้า/ร้าน react บนข้อความนี้ (message_reactions) — null=ไม่มี
  reactionEmoji?: string | null
  // feature 00023 — null/ไม่มี = คนส่ง | 'AUTO' = ระบบตอบ | 'AUTO_TEST' = ระบบตอบตอนโหมดทดสอบ
  // ใช้ติดป้ายบนบับเบิลให้ร้านแยกออกว่าข้อความไหนบอทตอบ (AC-012-02, AC-021-05)
  autoReplyKind?: string | null
  // feature 00023 — เหตุผลเบื้องหลังคำตอบครั้งนั้น (snapshot จาก AutoReplyLog ตอนตัดสินใจ)
  // แสดงตอนชี้/แตะที่ป้าย "ระบบตอบ"; ทุกฟิลด์ null ได้ = ตอนนั้นไม่ได้ใช้เงื่อนไขนั้น
  autoReply?: {
    // "CHATBOT" = AI แต่งจากคลังความรู้ (ป้าย DeepAI) · อื่น ๆ/null = คำตอบสำเร็จรูป (DeepBot)
    matchedVia: string | null
    keywordName: string | null
    matchedPhrase: string | null
    matchType: string | null
    channelName: string | null
    adLabel: string | null
    productName: string | null
  } | null
  // feature 00018 Phase 3 — reply/unsend
  isDeleted?: boolean // ผู้ส่ง unsend → แสดง "ข้อความถูกลบ"
  replyTo?: { body: string | null; senderRole: 'BUYER' | 'SHOP' } | null // quote ข้อความที่ตอบทับ (enrich ที่ API)
  // optimistic send (client-only, ไม่มาจาก server): 'sending'=spinner, 'sent'=check, 'failed'=refresh แดง
  _status?: 'sending' | 'sent' | 'failed'
  // payload สำหรับ resend เมื่อ _status='failed' (เก็บเฉพาะข้อความ optimistic ที่ยังไม่สำเร็จ)
  _retry?: OutgoingRetry
}

type MessagesApiResponse = {
  items: ChatMessageView[]
  nextCursor: string | null
  /** watermark "ลูกค้าอ่านถึงเวลานี้" (feature 00018 read receipt) — มากับทุก GET เพื่อให้ป้าย
   *  "ส่งแล้ว → อ่านแล้ว" อัปเดตได้เองโดยไม่ต้องรีโหลดหน้า (read event ไม่ทริกเกอร์ realtime) */
  externalReadAt?: string | null
}

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

// beepEnabled (user report 2026-07-25 "เสียงเตือนเบิ้ล 2 ครั้ง ทั้งที่ noti เดียว"): หน้า inbox มีทั้ง
// ChatThread (hook นี้) และ InboxList subscribe realtime คนละ channel — ข้อความเดียวยิง beep 2 ที่, time
// throttle 1.2s ไม่พอเมื่อ fetch latency ต่างกัน. deterministic fix: ให้ InboxList เป็นเจ้าของ beep
// หน้า inbox (mount อยู่เสมอ) แล้ว ChatThread ปิด beep (beepEnabled=false); SellerChatWidget บนหน้า
// dashboard ไม่มี list → คงเปิด beep (default true)
export function useSellerChatThread(conversationId: string, shopId?: string | null, beepEnabled = true) {
  const [messages, setMessages] = useState<ChatMessageView[]>([])
  const [oldestCursor, setOldestCursor] = useState<string | null>(null)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [externalReadAt, setExternalReadAt] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [uploading, setUploading] = useState(false)
  // optimistic send: composer ไม่ block ระหว่างส่งอีกต่อไป (แต่ละบับเบิลมี _status ของตัวเอง) —
  // คง prop `sending` ไว้ให้ ChatWidgetThreadPanel เดิม (bubble widget) ที่ยังอ้างถึง = false เสมอ
  const sending = false
  const [errorState, setErrorState] = useState(false)
  const [text, setText] = useState('')
  // reply/quote (user 2026-07-25): ข้อความที่กำลังจะ "ตอบทับ" — แสดง preview เหนือ composer, เคลียร์เมื่อส่ง/ยกเลิก
  const [replyingTo, setReplyingTo] = useState<ChatMessageView | null>(null)
  // multi-image (user สั่ง 2026-07-23 "ข้อความสำเร็จรูปใส่รูปได้มากกว่า 1"): เก็บเป็นคิวของรูปที่
  // "รอส่ง" — ช่องทางนอก (Messenger/IG) ส่งได้ทีละรูปต่อข้อความ ระบบจึงทยอยส่งเป็นหลายข้อความให้เอง
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  // alias ตัวเดียว — ChatWidgetThreadPanel (bubble widget) ยังใช้ contract เดิม ไม่ต้องแก้ตาม
  const pendingImage = pendingImages[0] ?? null

  const scrollRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const markReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didInitialScrollRef = useRef(false)
  // user อยู่ล่างสุด (ภายใน 120px) หรือเปล่า — ตัดสินว่าจะ auto-scroll ตอนข้อความใหม่เข้ามาไหม
  // (persistent ต่างจาก pinned ใน effect initial ที่อยู่แค่ 4 วิ) default true = เปิดเธรดมาอยู่ล่างสุด
  const atBottomRef = useRef(true)

  const scrollToBottom = useCallback(() => {
    // double rAF — เฟรมแรก React commit DOM, เฟรมสอง layout เสร็จ แล้วค่อยเลื่อน (single rAF เดิม
    // เลื่อนก่อน paint บ่อย → ไม่ถึงล่างสุด, user report 2026-07-23)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
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
    didInitialScrollRef.current = false // เปลี่ยนเธรด → ให้เลื่อนลงล่างสุดใหม่อีกรอบ
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
        if (data.externalReadAt !== undefined) setExternalReadAt(data.externalReadAt)
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

  // เลื่อนลงล่างสุดตอนเปิดเธรด (user request 2026-07-23 "เหมือน Facebook เข้าแล้วอยู่ล่างสุด")
  //
  // bug fix 2026-07-23 (user report: "ใน web เข้าแชทแล้วไม่เลื่อนไปข้อความล่าสุด"): เดิมยิง
  // scrollToBottom ตามเวลาตายตัว (150/400/800ms) ซึ่งเดาว่า "เนื้อหาสูงคงที่แล้ว" — บนเดสก์ท็อป
  // รูปในเธรดใหญ่กว่ามือถือมากและ `loading="lazy"` ทำให้ก่อนโหลดเสร็จรูปสูง ~0px พอโหลดจริงหลัง
  // 800ms (เน็ตช้า/รูปเยอะ/หลายรูปพร้อมกัน) ความสูงกระโดดขึ้นแต่ไม่มีใครเลื่อนตามแล้ว → ค้างกลางเธรด
  //
  // แก้เป็น "ปักหมุดล่างสุด" ด้วย ResizeObserver: ทุกครั้งที่ความสูงเนื้อหาเปลี่ยน (รูปโหลดเสร็จ,
  // วิดีโอได้ metadata, ฟอนต์ไทย reflow) เลื่อนลงล่างสุดซ้ำ — จนกว่าจะครบ 4 วินาที หรือผู้ใช้เลื่อน
  // ขึ้นเองก่อน (เคารพเจตนาผู้ใช้ทันที ไม่กระชากกลับ)
  useEffect(() => {
    if (loadingInitial || messages.length === 0 || didInitialScrollRef.current) return
    didInitialScrollRef.current = true

    const root = scrollRef.current
    scrollToBottom()
    if (!root) return

    let pinned = true
    const unpin = () => {
      pinned = false
    }
    // ผู้ใช้เลื่อนขึ้นเอง (ห่างจากล่างสุดเกิน 80px) = เลิกปักหมุด
    const onScroll = () => {
      if (root.scrollHeight - root.scrollTop - root.clientHeight > 80) unpin()
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    root.addEventListener('wheel', unpin, { passive: true })
    root.addEventListener('touchmove', unpin, { passive: true })

    const observer = new ResizeObserver(() => {
      if (pinned) root.scrollTop = root.scrollHeight
    })
    // สังเกตทั้ง container และเนื้อหาข้างใน — รูปที่โหลดเสร็จดันความสูงของ "เนื้อหา" ไม่ใช่ container
    observer.observe(root)
    for (const child of Array.from(root.children)) observer.observe(child)

    const stop = setTimeout(unpin, 4000)
    return () => {
      clearTimeout(stop)
      observer.disconnect()
      root.removeEventListener('scroll', onScroll)
      root.removeEventListener('wheel', unpin)
      root.removeEventListener('touchmove', unpin)
    }
  }, [loadingInitial, messages.length, scrollToBottom])

  // ── ติดตามว่า user อยู่ล่างสุดหรือเปล่า (persistent — คงอยู่ตลอดที่เปิดเธรด) ──
  // ต่างจาก listener ใน effect initial ที่อยู่แค่ 4 วิ; ตัวนี้อัปเดต atBottomRef ทุกครั้งที่ user เลื่อน
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const update = () => {
      atBottomRef.current = root.scrollHeight - root.scrollTop - root.clientHeight < 120
    }
    update()
    root.addEventListener('scroll', update, { passive: true })
    return () => root.removeEventListener('scroll', update)
  }, [loadingInitial])

  // ── auto-scroll เมื่อมีข้อความใหม่ (realtime/poll/ส่งเอง) ถ้า user อยู่ล่างสุดอยู่แล้ว ──
  // bug fix (user report 2026-07-25 "เปิดแชทค้างไว้ตอนคุยกันอยู่ ข้อความใหม่มาแล้วไม่เลื่อนตาม ต้อง
  // scroll เอง"): refetchNewer append ข้อความแต่ไม่เคยเลื่อน + effect initial ทำงานครั้งเดียว
  // (didInitialScrollRef). key ที่ id ข้อความล่าสุด → เลื่อนเมื่อมีตัวใหม่ต่อท้าย (ไม่ยิงตอน load-older
  // เพราะ prepend หัว id ล่าสุดไม่เปลี่ยน). ถ้า user เลื่อนขึ้นอ่านของเก่า (atBottomRef=false) ไม่กระชากลง
  const lastMsgId = messages.length > 0 ? messages[messages.length - 1]!.id : null
  useEffect(() => {
    if (!didInitialScrollRef.current) return // ครั้งแรก/สลับเธรด → effect initial จัดการ scroll เอง
    if (atBottomRef.current) scrollToBottom()
  }, [lastMsgId, scrollToBottom])

  // ── refetch "newer" — signal-only realtime (ไม่เชื่อ payload, GET หน้าแรกเสมอแล้ว merge) ──
  const refetchNewer = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages?take=30`)
      if (!res.ok) return
      const data: MessagesApiResponse = await res.json()
      if (data.externalReadAt !== undefined) setExternalReadAt(data.externalReadAt)
      setMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]))
        // เสียงเตือน (user สั่ง 2026-07-23) — ดังเฉพาะข้อความ "ใหม่จริง" ของฝั่งลูกค้า: ต้องไม่เคย
        // มีใน state มาก่อน (กัน refetch ซ้ำแล้วดังซ้ำ) และไม่ใช่ข้อความที่ร้านส่งเอง/echo จากแอป
        const hasNewFromBuyer = data.items.some((m) => m.senderRole === 'BUYER' && !map.has(m.id))
        for (const m of data.items) map.set(m.id, m)
        // beepEnabled=false บนหน้า inbox — ปล่อยให้ InboxList เป็นเจ้าของ beep (กันเสียงเบิ้ล 2 ครั้ง)
        if (hasNewFromBuyer && beepEnabled) playChatBeep({ shopId, conversationId })
        // seq เป็นตัวตัดสินเมื่อ createdAt เท่ากัน (Meta ส่งเวลาข้อความระบบมาแค่ระดับวินาที)
        // ให้ตรงกับลำดับที่ server จัดมา — ข้อความ optimistic ยังไม่มี seq จึงถือว่าอยู่ท้ายสุด
        return Array.from(map.values()).sort((a, b) => {
          const dt = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          if (dt !== 0) return dt
          return (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER)
        })
      })
    } catch {
      // เงียบ — รอ broadcast ถัดไป/focus fallback
    }
  }, [conversationId, shopId, beepEnabled])

  // ── realtime subscribe: chat:{conversationId} ──────────────────────────
  // (user report 2026-07-26: บางเครื่อง "ไม่ realtime") — backend/trigger/broadcast พิสูจน์แล้วว่าทำงาน
  // (anon client รับ broadcast ได้จริงบน conversation จริง) ปัญหาจึงอยู่ที่ subscribe ฝั่ง browser
  // ที่อาจ error/timeout เงียบ ๆ แล้วไม่ heal เอง → เพิ่ม status callback: log + re-subscribe เมื่อ error
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const join = () => {
      if (closed) return
      channel = supabase
        .channel(`chat:${conversationId}`)
        .on('broadcast', { event: 'update' }, () => {
          refetchNewer()
          markReadDebounced()
        })
        .subscribe((status) => {
          // CHANNEL_ERROR/TIMED_OUT = join ล้มเหลว/หลุด — บางกรณี supabase-js ไม่ rejoin เอง →
          // ถอดแล้ว re-join หลัง 3s (guard closed กัน loop ตอน unmount)
          if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !closed) {
            console.warn('[chat-realtime] subscribe', status, '→ re-join', conversationId)
            if (channel) supabase.removeChannel(channel)
            retry = setTimeout(join, 3000)
          }
        })
    }
    join()

    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      if (channel) supabase.removeChannel(channel)
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

  // poll เบา ๆ ระหว่างเปิดเธรดอยู่ — 2 หน้าที่: (1) read receipt ของ Meta มาทาง webhook โดย **ไม่
  // insert ChatMessage** จึงไม่มี realtime broadcast ให้เกาะ; (2) safety-net ของข้อความใหม่เผื่อ
  // realtime socket ฝั่ง browser หลุด/ไม่ทำงาน (user report 2026-07-26 "ไม่ realtime") — ลด 20s→6s
  // ให้ข้อความโผล่ภายใน ≤6s แม้ realtime ไม่ส่ง. หยุดเมื่อแท็บถูกซ่อน — ไม่กิน request ตอนไม่มีคนดู
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refetchNewer()
    }
    const t = setInterval(tick, 6_000)
    return () => clearInterval(t)
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
  // upload รูป 1 ไฟล์ → คิว pendingImages (แชร์ทั้งปุ่มแนบไฟล์และวางรูป paste)
  const uploadFile = async (file: File) => {
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
      setPendingImages((prev) => [...prev, { fileId: data.fileId, previewUrl }])
    } catch {
      pacesToast.error('อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง')
      URL.revokeObjectURL(previewUrl)
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset — เลือกไฟล์เดิมซ้ำได้
    if (!file) return
    await uploadFile(file)
  }

  // วางรูปจากคลิปบอร์ด (user request 2026-07-25: paste จาก screenshot/Line/Ctrl+C ลงช่องพิมพ์ได้เลย)
  // แนบทุกรูปในคลิปบอร์ด (บางเคสมีหลายรูป); ถ้ามีรูป → preventDefault กันวางเป็น path/ข้อความในช่อง
  const handlePaste = async (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f !== null)
    if (files.length === 0) return // ไม่มีรูป → ปล่อยวางข้อความปกติ
    e.preventDefault()
    for (const f of files) await uploadFile(f)
  }

  /** ไม่ระบุ fileId = ล้างทั้งคิว (ปุ่มเดิมของ ChatWidgetThreadPanel ที่มีรูปได้ทีละใบ) */
  const handleRemoveImage = (fileId?: string) => {
    setPendingImages((prev) => {
      const removed = fileId ? prev.filter((p) => p.fileId === fileId) : prev
      for (const img of removed) URL.revokeObjectURL(img.previewUrl)
      return fileId ? prev.filter((p) => p.fileId !== fileId) : []
    })
  }

  // ── ส่งข้อความ (optimistic) ───────────────────────────────────────────
  // กด send → แสดงบับเบิลทันที (_status='sending' spinner) + เคลียร์ช่องพิมพ์ → POST เบื้องหลัง
  // สำเร็จ → แทนด้วยแถวจริง (_status='sent' check) / ล้มเหลว → _status='failed' (refresh แดง กดลองใหม่)
  const localIdRef = useRef(0)

  const postMessage = useCallback(
    async (localId: string, payload: OutgoingRetry) => {
      try {
        const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          if (res.status === 429) pacesToast.error('ส่งข้อความถี่เกินไป กรุณารอสักครู่')
          setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, _status: 'failed' as const } : m)))
          return
        }
        const real: ChatMessageView = await res.json()
        // แทน optimistic ด้วยแถวจริง + กันซ้ำถ้า realtime ดึงแถวจริง (id เดียวกัน) มาก่อนแล้ว
        setMessages((prev) => {
          const deduped = prev.filter((m) => m.id !== real.id)
          return deduped.map((m) => (m.id === localId ? { ...real, _status: 'sent' as const } : m))
        })
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, _status: 'failed' as const } : m)))
      }
    },
    [conversationId],
  )

  const handleSend = () => {
    const trimmed = text.trim()
    if (pendingImages.length === 0 && trimmed.length === 0) return

    // รูปหลายรูป = หลายข้อความ (Messenger/IG ไม่รองรับหลายรูปในข้อความเดียว)
    //
    // ลำดับ: **รูปทั้งหมดก่อน แล้วค่อยข้อความปิดท้าย** (user สั่ง 2026-07-23)
    // เดิม caption ติดไปกับรูปใบแรก (body: i===0) ซึ่งฝั่ง Messenger จะกลายเป็น
    // [รูป1] [ข้อความ] [รูป2] [รูป3] เพราะ sendOutboundMessage ส่ง caption เป็นข้อความตามหลังรูป
    // ทันที (attachment ของ Meta ไม่มี text ในตัว — channel-chat.service.ts) ข้อความจึงไปคั่นกลาง
    // ทำให้ Messenger จัดรูปเป็นอัลบั้มเกาะกลุ่มไม่ได้. ย้าย caption ออกมาเป็นข้อความ TEXT ใบสุดท้าย
    // แทน → [รูป1][รูป2][รูป3][ข้อความ] รูปเกาะกลุ่มกันตามที่ต้องการ
    //
    // ผลข้างเคียงที่ตั้งใจ: เธรดในแอป (DEEP) เดิมรูป+caption อยู่บับเบิลเดียวกัน ตอนนี้แยกเป็น
    // บับเบิลรูปกับบับเบิลข้อความ — ยอมแลกเพื่อให้ลำดับ/หน้าตาตรงกันทุกช่องทาง
    const payloads: OutgoingRetry[] =
      pendingImages.length > 0
        ? [
            ...pendingImages.map((img) => ({
              type: 'IMAGE' as const,
              imageUrl: img.fileId,
              body: null,
            })),
            ...(trimmed ? [{ type: 'TEXT' as const, body: trimmed }] : []),
          ]
        : [{ type: 'TEXT' as const, body: trimmed }]

    // reply/quote: ผูก replyToMessageId กับข้อความ "ใบแรก" ที่ส่ง (ตอบทับครั้งเดียวต่อการส่ง)
    const replyTargetId = replyingTo?.id
    const replyQuote = replyingTo
      ? {
          body:
            replyingTo.body ??
            (replyingTo.type === 'IMAGE'
              ? '[รูปภาพ]'
              : replyingTo.type === 'ORDER'
                ? '[คำสั่งซื้อ]'
                : replyingTo.type === 'PRODUCT'
                  ? '[สินค้า]'
                  : '[สื่อ/ไฟล์แนบ]'),
          senderRole: replyingTo.senderRole,
        }
      : null
    if (replyTargetId && payloads[0]) payloads[0] = { ...payloads[0], replyToMessageId: replyTargetId }
    setReplyingTo(null)

    const queued = payloads.map((payload, i) => {
      const localId = `local-${localIdRef.current++}-${Date.now()}`
      const optimistic: ChatMessageView = {
        id: localId,
        conversationId,
        senderUserId: '',
        senderRole: 'SHOP',
        type: payload.type,
        body: payload.body,
        imageUrl: payload.imageUrl ?? null,
        createdAt: new Date().toISOString(),
        // quote แสดงทันทีบนบับเบิลใบแรก (i===0) ก่อน GET enrich รอบถัดไป
        replyTo: i === 0 ? replyQuote : null,
        _status: 'sending',
        _retry: payload,
      }
      return { localId, payload, optimistic }
    })

    setMessages((prev) => [...prev, ...queued.map((q) => q.optimistic)])
    setText('')
    // บับเบิล optimistic render รูปจาก /api/files/{fileId} (อัปโหลดแล้วตอนแนบ) — revoke preview ได้เลย
    for (const img of pendingImages) URL.revokeObjectURL(img.previewUrl)
    setPendingImages([])
    scrollToBottom()
    // ส่งเรียงทีละใบ (ไม่ Promise.all) — ให้ลำดับข้อความฝั่งลูกค้าตรงกับลำดับรูปที่แนบ และไม่ยิง
    // Graph API พร้อมกันจนโดน rate limit
    void (async () => {
      for (const q of queued) await postMessage(q.localId, q.payload)
    })()
  }

  /** compat setter — caller เดิมส่งรูปเดี่ยว/null; ภายในเก็บเป็นคิว (แทนที่ทั้งคิว ไม่ต่อท้าย
   *  เพื่อคงพฤติกรรมเดิมของปุ่มแนบรูปทีละใบ) */
  const setPendingImage = (img: PendingImage | null) => {
    setPendingImages((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.previewUrl)
      return img ? [img] : []
    })
  }

  const retryMessage = useCallback(
    (localId: string, payload: OutgoingRetry) => {
      setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, _status: 'sending' as const } : m)))
      postMessage(localId, payload)
    },
    [postMessage],
  )

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
    // feature 00018 composer #2 — ให้ composer แนบรูปจาก "ข้อความสำเร็จรูป"/สินค้า (storage fileId
    // ที่มีอยู่แล้ว ไม่ต้อง upload ใหม่) ได้โดยตรง — set เป็นคิวรูปแล้วใช้ flow handleSend เดิม
    setPendingImage,
    pendingImages,
    setPendingImages,
    scrollRef,
    topSentinelRef,
    handleFileChange,
    handlePaste, // วางรูปจากคลิปบอร์ดลงช่องพิมพ์ (user 2026-07-25)
    handleRemoveImage,
    handleSend,
    // reply/quote (user 2026-07-25) — ข้อความที่กำลังตอบทับ + setter (composer preview + ปุ่ม reply บนบับเบิล)
    replyingTo,
    setReplyingTo,
    // optimistic send — resend เมื่อบับเบิล _status='failed'
    retryMessage,
    /** read receipt (feature 00018) — สดจาก GET ล่าสุด; caller ควรใช้ค่านี้แทน server prop ตอนเปิดหน้า
     *  เพราะ read event มาทีหลังทาง webhook โดยไม่ทริกเกอร์ realtime (ดู comment ที่ route GET) */
    externalReadAt,
  }
}
