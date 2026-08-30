'use client'

/**
 * ChatThread — client thread body ของ /messages/[shopId] (feature 00011 Deep Chat, S-10)
 * REWORK (faithful bubble/composer — เดิม custom sx ล้วน ไม่เหมือน Vuexy chat demo จริง)
 *
 * Base (message bubble — copy className+JSX verbatim): theme/vuexy/typescript-version/full-version/src/views/apps/chat/ChatLog.tsx
 *   — group ข้อความต่อเนื่องของ sender เดียวกันเป็นก้อน (avatar 32px โผล่ครั้งเดียวต่อก้อน),
 *   bubble Typography `whitespace-pre-wrap pli-4 plb-2 shadow-xs` + `bg-backgroundPaper rounded-e rounded-b`(shop)
 *   / `bg-primary text-[var(--mui-palette-primary-contrastText)] rounded-s rounded-b`(buyer), time caption ท้ายก้อน
 *   Adapt: groupBySender ใช้ senderRole (เรามีแค่ BUYER/SHOP ไม่มี multi-staff senderId แยก), ตัด msgStatus
 *   (isSeen/isDelivered/isSent) ทั้งหมด — ไม่มี per-message read-receipt (SDS §5 FROZEN CONTRACT); เวลาใช้ formatTime
 *   จริงเสมอ (ไม่มี "now" fallback แบบ demo data); เพิ่ม IMAGE bubble (ไม่มีใน theme) ด้วย token เดียวกัน
 *   (shadow-xs/rounded-e-s+rounded-b/bg-backgroundPaper-primary) เพื่อคง visual language
 * Base (composer — copy className verbatim): theme/.../apps/chat/SendMsgForm.tsx
 *   — TextField multiline className='p-6' + sx fieldset:border-0 + boxShadow xs, endAdornment icon row
 *   Adapt: ตัด emoji-mart Picker + microphone icon ทั้งหมด (ไม่มี backend); attach เปลี่ยนจาก plain
 *   `<input hidden>` เป็น auto-upload flow (pattern ProductImagesCardV2.tsx: FormData → POST /api/upload
 *   → {fileId}) + preview Chip; send = CustomIconButton contained icon-only (ตัด text-Button variant เพราะ
 *   ทั้ง 2 host context — full page + widget panel — เป็น compact width เหมือน isBelowSmScreen เสมอ)
 * Realtime subscribe pattern: src/app/(marketing)/a/[id]/AuctionDetailClient.tsx:144-179
 *   (signal-only broadcast, ไม่เชื่อ payload — refetch authoritative เสมอ)
 *
 * S-20 (extension #1 Chat Product Context Card, feat 00011): เพิ่ม type='PRODUCT' bubble (Base: IMAGE bubble
 * container ด้านบน — bg neutral คงที่ไม่ผูก sender ตาม UX spec) + อ่าน query ?productId ครั้งเดียวจาก
 * /u/[username] ProductTile ปุ่ม "สอบถามสินค้านี้" (S-19) → sendMessage(type=PRODUCT) → clear query
 *
 * S-31 (extension #3 Scam-link Detection, FR-SCAM-04/06): ข้อความ type='TEXT' ที่ `flaggedScam=true` (persist
 * จาก S-30 backend, ตรวจเฉพาะ TEXT — BR-SCAM-04) → ห่อ Typography ด้วย container เดียวกับ IMAGE/PRODUCT bubble
 * (bg/rounded/shadow ย้ายไป wrapper, ไม่กระทบ layout ข้อความปกติ) แล้วต่อ MUI `Alert severity='warning'` เล็ก
 * ท้ายบับเบิลเดียวกัน — WARN เฉย ๆ ไม่ block ส่ง (FR-SCAM-05), copy เป็นกลางไม่กล่าวหา (FR-SCAM-06)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'

import classnames from 'classnames'
import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

import CustomAvatar from '@core/components/mui/Avatar'
import CustomIconButton from '@core/components/mui/IconButton'
import { getInitials } from '@/utils/getInitials'
import { formatDateTH, formatTimeHM } from '@/lib/format-date'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { uploadFileId } from '@/lib/upload-client'
// คลังคำตามประเภทกิจการ — SSOT เดียวทั้งฝั่งร้านและฝั่งลูกค้า (HR16) ห้ามพิมพ์คำซ้ำที่นี่
import { resolveOrderVocab } from '@/lib/seller-menu'
import { fileUrlOf } from '@/lib/file-url'

type SenderRole = 'BUYER' | 'SHOP'
// ORDER = การ์ดออเดอร์/ใบเสนอราคาที่ร้านส่งให้ (user 2026-07-24) — buyer เห็นการ์ดเดียวกับฝั่ง seller
type ChatMessageType = 'TEXT' | 'IMAGE' | 'PRODUCT' | 'ORDER'

// S-20: enrich เฉพาะ type='PRODUCT' — คืนจาก GET เท่านั้น (S-18); POST ไม่ enrich (ดู sendProductMessage)
type ProductCardData = {
  id: string
  name: string
  price: number
  imageFileId: string | null
  isActive: boolean
}

// enrich เฉพาะ type='ORDER' — คืนจาก GET (route.ts orderMap); การ์ดคำสั่งซื้อที่ร้านส่ง
type OrderCardData = {
  token: string
  orderNo?: string | null // เลขคำสั่งซื้อ DP… (user 2026-07-25)
  status: string
  totalAmount: string
  items: { name: string; qty: number; price: string; imageFileId: string | null }[]
  /** Shop.vertical ของร้านที่ส่งการ์ดใบนี้มา — ผันคำที่ **ลูกค้า** เห็น (ORDER_VOCAB)
   *  ไม่ส่งมา/ไม่รู้จัก → ชุดคำ ONLINE_SALES เหมือนเดิม */
  vertical?: string | null
}

type ChatMessageView = {
  id: string
  conversationId: string
  senderUserId: string
  senderRole: SenderRole
  type: ChatMessageType
  body: string | null
  imageUrl: string | null
  // เฉพาะ type='PRODUCT': productRefId = FK เดิม, productCard = enriched (undefined = ระหว่างส่ง optimistic
  // ยังไม่ enrich, null = ลบจริงแล้ว FR-CTX-08)
  productRefId?: string | null
  productCard?: ProductCardData | null
  // เฉพาะ type='ORDER' — enrich จาก GET (การ์ดใบเสนอราคา/ออเดอร์)
  orderRefToken?: string | null
  orderCard?: OrderCardData | null
  // S-31 (extension #3 Scam-link Detection): persist ที่ backend เฉพาะ type='TEXT' (S-30) — ข้อความอื่น
  // ส่ง false เสมอ (optimistic เช่นกัน เพราะ POST ไม่ enrich ค่านี้กลับจนกว่าจะ refetch/replace)
  flaggedScam: boolean
  createdAt: string
}

type ConversationSummary = {
  id: string
  buyerUserId: string
  shopId: string
}

type MessagesResponse = { items: ChatMessageView[]; nextCursor: string | null }

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'
const IMAGE_MIME_ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])
const IMAGE_MAX_SIZE = 5 * 1024 * 1024

type PendingImage = { file: File; previewUrl: string }

function mapSendError(status: number, apiError?: string): string {
  if (status === 429) return 'ส่งข้อความเร็วเกินไป กรุณารอสักครู่'
  return apiError ?? 'ส่งข้อความไม่สำเร็จ กรุณาลองใหม่'
}

/** จัดกลุ่มข้อความตามวันที่ (formatDate พ.ศ. — ห้าม theme formatDateToMonthShort) สำหรับ divider คั่นวัน */
function groupByDate(messages: ChatMessageView[]): { dateLabel: string; messages: ChatMessageView[] }[] {
  const groups: { dateLabel: string; messages: ChatMessageView[] }[] = []
  for (const m of messages) {
    const dateLabel = formatDateTH(m.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.dateLabel === dateLabel) last.messages.push(m)
    else groups.push({ dateLabel, messages: [m] })
  }
  return groups
}

/** จัดกลุ่มข้อความติดกันของ sender เดียวกันเป็นก้อน (avatar โผล่ครั้งเดียวต่อก้อน) — ตาม ChatLog.tsx formatedChatData
 *  adapt: group ด้วย senderRole (BUYER/SHOP) แทน senderId เพราะฝั่งเราไม่มี multi-staff sender แยกราย id */
function groupBySender(messages: ChatMessageView[]): { senderRole: SenderRole; messages: ChatMessageView[] }[] {
  const groups: { senderRole: SenderRole; messages: ChatMessageView[] }[] = []
  for (const m of messages) {
    const last = groups[groups.length - 1]
    if (last && last.senderRole === m.senderRole) last.messages.push(m)
    else groups.push({ senderRole: m.senderRole, messages: [m] })
  }
  return groups
}

type Props = { shopId: string; shopName: string; shopLogo: string | null; shopUsername: string }

export default function ChatThread({ shopId, shopName, shopLogo, shopUsername }: Props) {
  const { data: session } = useSession()

  // S-20: อ่าน ?productId ครั้งเดียว (FR-CTX-03) — productSentRef กัน double-send จาก React Strict Mode
  // double-invoke effect (เช็ค+set แบบ synchronous กัน race, backend idempotent-guard BR-CTX-02 ป้องกันซ้ำอยู่แล้ว)
  const router = useRouter()
  const searchParams = useSearchParams()
  const productIdParam = searchParams.get('productId')
  const productSentRef = useRef(false)
  const sessionUser = session?.user as
    | { id?: string; displayName?: string; avatar?: string | null }
    | undefined
  const myUserId = sessionUser?.id ?? null
  const myDisplayName = sessionUser?.displayName ?? 'ฉัน'
  const myAvatarSrc = sessionUser?.avatar
    ? fileUrlOf(sessionUser.avatar)
    : undefined
  const shopAvatarSrc = shopLogo ? (fileUrlOf(shopLogo)) : undefined

  const [conversation, setConversation] = useState<ConversationSummary | null>(null)
  const [convError, setConvError] = useState<'not-found' | 'generic' | null>(null)
  const [loadingConv, setLoadingConv] = useState(true)

  const [messages, setMessages] = useState<ChatMessageView[]>([])
  const [olderCursor, setOlderCursor] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [olderLoadError, setOlderLoadError] = useState(false)

  const [msgText, setMsgText] = useState('')
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  const [optimisticPreviews, setOptimisticPreviews] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)

  const scrollBoxRef = useRef<HTMLDivElement | null>(null)
  const topSentinelRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollToBottom = useCallback(() => {
    const el = scrollBoxRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const markRead = useCallback((convId: string) => {
    fetch(`/api/chat/conversations/${convId}/read`, { method: 'POST' }).catch(() => {
      // เงียบ — mark-read ไม่ critical พอที่จะ toast รบกวน user
    })
  }, [])

  const markReadDebounced = useCallback(
    (convId: string) => {
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current)
      markReadTimerRef.current = setTimeout(() => markRead(convId), 400)
    },
    [markRead],
  )

  const fetchLatest = useCallback(async (convId: string): Promise<MessagesResponse> => {
    const res = await fetch(`/api/chat/conversations/${convId}/messages`)
    if (!res.ok) throw new Error(String(res.status))
    return (await res.json()) as MessagesResponse
  }, [])

  // 1) get-or-create conversation → 2) โหลดข้อความชุดแรก (reverse ก่อน render) → 3) mark-read
  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoadingConv(true)
      setConvError(null)
      try {
        const convRes = await fetch('/api/chat/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shopId }),
        })
        if (!convRes.ok) {
          if (cancelled) return
          setConvError(convRes.status === 404 ? 'not-found' : 'generic')
          return
        }
        const conv = (await convRes.json()) as ConversationSummary
        if (cancelled) return
        setConversation(conv)

        const data = await fetchLatest(conv.id)
        if (cancelled) return
        setMessages(data.items.slice().reverse())
        setOlderCursor(data.nextCursor)
        markRead(conv.id)
        requestAnimationFrame(scrollToBottom)

        // S-20: มี ?productId (มาจากปุ่ม "สอบถามสินค้านี้" S-19) → ส่งการ์ดสินค้าเป็นข้อความแรกอัตโนมัติ
        // ครั้งเดียว (FR-CTX-03/04) แล้ว clear query (ไม่ resend ตอน refresh)
        if (productIdParam && !productSentRef.current) {
          productSentRef.current = true
          await sendProductMessage(conv.id, productIdParam)
          if (!cancelled) router.replace(`/messages/${shopId}`)
        }
      } catch {
        if (!cancelled) setConvError('generic')
      } finally {
        if (!cancelled) setLoadingConv(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init ครั้งเดียวต่อ shopId เท่านั้น
  }, [shopId])

  // realtime subscribe — signal-only, refetch authoritative (pattern AuctionDetailClient.tsx:144-179)
  useEffect(() => {
    if (!conversation) return
    const supabase = getSupabaseBrowserClient()
    let refetchTimer: ReturnType<typeof setTimeout> | null = null

    const refetchNewer = () => {
      if (refetchTimer) clearTimeout(refetchTimer)
      refetchTimer = setTimeout(() => {
        fetchLatest(conversation.id)
          .then((data) => {
            const latestAsc = data.items.slice().reverse()
            setMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.id))
              const fresh = latestAsc.filter((m) => !existingIds.has(m.id))
              if (fresh.length === 0) return prev
              return [...prev, ...fresh].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            })
            markReadDebounced(conversation.id)
            requestAnimationFrame(scrollToBottom)
          })
          .catch(() => {
            // เงียบ — sync รอบถัดไปจาก broadcast/fallback
          })
      }, 400)
    }

    const channel = supabase
      .channel(`chat:${conversation.id}`)
      .on('broadcast', { event: 'update' }, refetchNewer)
      .subscribe()

    // fallback: focus/visibilitychange — เผื่อ broadcast หลุด
    const onFocus = () => refetchNewer()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)

    return () => {
      if (refetchTimer) clearTimeout(refetchTimer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe ตาม conversation.id เท่านั้น
  }, [conversation?.id])

  const loadOlder = useCallback(async () => {
    if (!conversation || !olderCursor || loadingOlder) return
    setLoadingOlder(true)
    setOlderLoadError(false)
    const container = scrollBoxRef.current
    const prevScrollHeight = container?.scrollHeight ?? 0
    try {
      const res = await fetch(
        `/api/chat/conversations/${conversation.id}/messages?cursor=${encodeURIComponent(olderCursor)}`,
      )
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as MessagesResponse
      const olderAsc = data.items.slice().reverse()
      setMessages((prev) => [...olderAsc, ...prev])
      setOlderCursor(data.nextCursor)
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight - prevScrollHeight
      })
    } catch {
      setOlderLoadError(true)
    } finally {
      setLoadingOlder(false)
    }
  }, [conversation, olderCursor, loadingOlder])

  // infinite-scroll-up — sentinel บนสุดของลิสต์ (preserve scroll หลังโหลดเสร็จ)
  useEffect(() => {
    if (!olderCursor) return
    const el = topSentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !olderLoadError) loadOlder()
      },
      { root: scrollBoxRef.current, threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ผูก sentinel/olderCursor/olderLoadError เท่านั้น
  }, [olderCursor, olderLoadError, loadOlder])

  function handleAttachClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // เคลียร์เพื่อเลือกไฟล์เดิมซ้ำได้
    if (!file) return
    if (!IMAGE_MIME_ALLOWED.has(file.type) || file.size > IMAGE_MAX_SIZE) {
      toast.error('รองรับเฉพาะ JPG/PNG/WEBP ≤5MB')
      return
    }
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) })
  }

  function clearPendingImage() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl)
    setPendingImage(null)
  }

  async function sendTextMessage(convId: string, text: string) {
    const tempId = `temp-${Date.now()}`
    const optimisticMsg: ChatMessageView = {
      id: tempId,
      conversationId: convId,
      senderUserId: myUserId ?? '',
      senderRole: 'BUYER',
      type: 'TEXT',
      body: text,
      imageUrl: null,
      flaggedScam: false,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMsg])
    requestAnimationFrame(scrollToBottom)
    setSending(true)
    try {
      const res = await fetch(`/api/chat/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'TEXT', body: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        toast.error(mapSendError(res.status, data.error))
        return
      }
      setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as ChatMessageView) : m)))
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      toast.error('ส่งข้อความไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSending(false)
    }
  }

  async function sendImageMessage(convId: string, image: PendingImage, caption: string | null) {
    const tempId = `temp-${Date.now()}`
    const optimisticMsg: ChatMessageView = {
      id: tempId,
      conversationId: convId,
      senderUserId: myUserId ?? '',
      senderRole: 'BUYER',
      type: 'IMAGE',
      body: caption,
      imageUrl: null,
      flaggedScam: false,
      createdAt: new Date().toISOString(),
    }
    setOptimisticPreviews((prev) => ({ ...prev, [tempId]: image.previewUrl }))
    setMessages((prev) => [...prev, optimisticMsg])
    requestAnimationFrame(scrollToBottom)
    setSending(true)
    try {
      // direct upload (2026-08-10) — เดิมส่งผ่าน body ของ function ที่ Vercel จำกัด 4.5MB
      // รูปจากมือถือ 4.5–5MB จึงล้มทั้งที่ผ่านด่าน client 5MB มาแล้ว (ดู upload-policy.ts)
      const fileId = await uploadFileId(image.file, 'IMAGE')

      const res = await fetch(`/api/chat/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'IMAGE', imageUrl: fileId, body: caption }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(mapSendError(res.status, data.error))
      setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as ChatMessageView) : m)))
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      toast.error(e instanceof Error && e.message ? e.message : 'ส่งรูปไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setOptimisticPreviews((prev) => {
        const next = { ...prev }
        delete next[tempId]
        return next
      })
      URL.revokeObjectURL(image.previewUrl)
      setSending(false)
    }
  }

  /**
   * S-20 — ส่งการ์ดสินค้าอัตโนมัติครั้งเดียวหลังเปิด conversation ผ่าน ?productId (FR-CTX-03)
   * ทำไม refetch แทน map-by-tempId เหมือน sendTextMessage/sendImageMessage: POST /messages ไม่ enrich
   * productCard (เฉพาะ GET ทำ, S-18) — optimistic ใช้ productCard: undefined (state "กำลังส่ง") แล้ว
   * refetch ข้อความล่าสุด (pattern เดียวกับ realtime refetchNewer) มาแทนที่เพื่อได้ productCard จริง
   */
  async function sendProductMessage(convId: string, productRefId: string) {
    const tempId = `temp-${Date.now()}`
    const optimisticMsg: ChatMessageView = {
      id: tempId,
      conversationId: convId,
      senderUserId: myUserId ?? '',
      senderRole: 'BUYER',
      type: 'PRODUCT',
      body: null,
      imageUrl: null,
      productRefId,
      productCard: undefined,
      flaggedScam: false,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMsg])
    requestAnimationFrame(scrollToBottom)
    setSending(true)
    try {
      const res = await fetch(`/api/chat/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'PRODUCT', productRefId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        toast.error(mapSendError(res.status, data.error))
        return
      }
      const latest = await fetchLatest(convId)
      const latestAsc = latest.items.slice().reverse()
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== tempId)
        const existingIds = new Set(withoutOptimistic.map((m) => m.id))
        const fresh = latestAsc.filter((m) => !existingIds.has(m.id))
        return [...withoutOptimistic, ...fresh].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      })
      requestAnimationFrame(scrollToBottom)
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      toast.error('ส่งข้อความไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSending(false)
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!conversation || sending) return
    const text = msgText.trim()
    const caption = text || null

    if (pendingImage) {
      const image = pendingImage
      setPendingImage(null)
      setMsgText('')
      await sendImageMessage(conversation.id, image, caption)
      return
    }
    if (!text) return
    setMsgText('')
    await sendTextMessage(conversation.id, text)
  }

  // --- Render states ---

  if (convError) {
    return (
      <Box className='flex flex-col flex-1 items-center justify-center gap-4 p-6 bg-backgroundChat'>
        <CustomAvatar variant='circular' size={72} color='error' skin='light'>
          <Icon icon='tabler-message-off' fontSize={36} />
        </CustomAvatar>
        <Typography className='font-medium'>
          {convError === 'not-found' ? 'ไม่พบร้านค้านี้' : 'ไม่มีสิทธิ์เข้าถึงบทสนทนานี้'}
        </Typography>
      </Box>
    )
  }

  if (loadingConv) {
    return (
      <Box className='flex flex-1 items-center justify-center bg-backgroundChat'>
        <CircularProgress size={28} />
      </Box>
    )
  }

  const dateGroups = groupByDate(messages)

  return (
    <Box className='flex flex-col flex-1' sx={{ minHeight: 0 }}>
      {/* message list — Base: ChatLog.tsx (ScrollWrapper adapt เป็น plain div ref เพราะต้อง programmatic
          scroll: preserve-scroll ตอนโหลดเก่า/auto-scroll ตอนส่งใหม่) */}
      <Box ref={scrollBoxRef} className='flex-1 overflow-y-auto overflow-x-hidden bg-backgroundChat p-0'>
        {olderCursor && (
          <div ref={topSentinelRef} className='flex justify-center plb-2.5'>
            {olderLoadError ? (
              <button
                type='button'
                onClick={loadOlder}
                className='inline-flex items-center gap-1.5 border-0 bg-transparent cursor-pointer text-error text-xs font-bold'
              >
                <Icon icon='tabler-refresh' fontSize={14} />
                โหลดข้อความเก่าไม่สำเร็จ ลองใหม่
              </button>
            ) : (
              <CircularProgress size={16} />
            )}
          </div>
        )}

        {messages.length === 0 ? (
          <div className='flex flex-col items-center justify-center gap-[18px] p-6'>
            <CustomAvatar variant='circular' size={72} color='primary' skin='light'>
              <Icon icon='tabler-message-2' fontSize={36} />
            </CustomAvatar>
            <Typography color='text.secondary' className='text-[13px]'>
              เริ่มต้นทักทาย {shopName} ได้เลย
            </Typography>
          </div>
        ) : (
          dateGroups.map((dateGroup) => (
            <div key={dateGroup.dateLabel}>
              <div className='flex justify-center plb-2.5'>
                <span className='pli-3 py-0.5 rounded-full bg-actionSelected text-textSecondary text-xs'>
                  {dateGroup.dateLabel}
                </span>
              </div>

              {groupBySender(dateGroup.messages).map((msgGroup, groupIndex) => {
                const isBuyer = msgGroup.senderRole === 'BUYER'
                const lastMsg = msgGroup.messages[msgGroup.messages.length - 1]

                return (
                  <div
                    key={`${dateGroup.dateLabel}-${groupIndex}`}
                    className={classnames('flex gap-4 p-6', { 'flex-row-reverse': isBuyer })}
                  >
                    {isBuyer ? (
                      <CustomAvatar alt={myDisplayName} src={myAvatarSrc} skin='light' size={32}>
                        {getInitials(myDisplayName)}
                      </CustomAvatar>
                    ) : (
                      <CustomAvatar alt={shopName} src={shopAvatarSrc} skin='light' size={32}>
                        {getInitials(shopName)}
                      </CustomAvatar>
                    )}

                    <div
                      className={classnames('flex flex-col gap-2 max-is-[75%]', {
                        'items-end': isBuyer,
                      })}
                    >
                      {msgGroup.messages.map((msg) => {
                        const imgSrc = msg.imageUrl ? `/api/files/${msg.imageUrl}` : optimisticPreviews[msg.id]

                        if (msg.type === 'IMAGE') {
                          return (
                            <div
                              key={msg.id}
                              className={classnames('shadow-xs overflow-hidden', {
                                'bg-backgroundPaper rounded-e rounded-b': !isBuyer,
                                'bg-primary rounded-s rounded-b': isBuyer,
                              })}
                            >
                              {imgSrc && (
                                // eslint-disable-next-line @next/next/no-img-element -- ChatMessage.imageUrl = raw fileId, render ผ่าน /api/files/{id} เสมอ (SDS §5 FROZEN CONTRACT)
                                <img
                                  src={imgSrc}
                                  alt='รูปภาพที่ส่ง'
                                  className='block max-is-[220px] max-bs-[220px] rounded'
                                />
                              )}
                              {msg.body && (
                                <Typography
                                  className={classnames('whitespace-pre-wrap pli-4 plb-2', {
                                    'text-[var(--mui-palette-primary-contrastText)]': isBuyer,
                                  })}
                                  style={{ wordBreak: 'break-word' }}
                                >
                                  {msg.body}
                                </Typography>
                              )}
                            </div>
                          )
                        }

                        // S-20 (extension #1 Chat Product Context Card) — bg neutral เสมอ ไม่ผูก sender
                        // (BR-CTX-05 PRODUCT = buyer-only) คง shape/justify ตาม isBuyer เดิม
                        if (msg.type === 'PRODUCT') {
                          const card = msg.productCard
                          const priceLabel = card
                            ? `฿${card.price.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                            : ''

                          return (
                            <div
                              key={msg.id}
                              className={classnames('shadow-xs overflow-hidden bg-backgroundPaper', {
                                'rounded-e rounded-b': !isBuyer,
                                'rounded-s rounded-b': isBuyer,
                              })}
                              style={{ maxWidth: 260 }}
                            >
                              {card === undefined ? (
                                // ── optimistic: ส่งแล้วรอ refetch enrich (POST ไม่ enrich productCard) ──
                                <div className='flex items-center gap-2 pli-4 plb-3'>
                                  <CircularProgress size={16} />
                                  <Typography className='text-[13px]' color='text.secondary'>
                                    กำลังส่งการ์ดสินค้า...
                                  </Typography>
                                </div>
                              ) : card === null ? (
                                // ── FR-CTX-08: ลบจริง — ไม่มีลิงก์/รูป ──
                                <div className='flex items-center gap-2 pli-4 plb-3'>
                                  <Icon icon='tabler-package-off' fontSize={20} className='text-textDisabled' />
                                  <Typography className='text-[13px]' color='text.disabled'>
                                    ไม่พบสินค้านี้แล้ว
                                  </Typography>
                                </div>
                              ) : (
                                <Link
                                  href={`/u/${shopUsername}`}
                                  className='flex items-center gap-3 pli-3 plb-2.5'
                                  style={{ textDecoration: 'none' }}
                                >
                                  <div
                                    className='shrink-0 overflow-hidden'
                                    style={{ width: 56, height: 56, borderRadius: 6, background: '#E2E8F0' }}
                                  >
                                    {card.imageFileId ? (
                                      // eslint-disable-next-line @next/next/no-img-element -- Product.images[0] = raw fileId, render ผ่าน /api/files/{id} เสมอ
                                      <img
                                        src={`/api/files/${card.imageFileId}`}
                                        alt={card.name}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      />
                                    ) : (
                                      <div
                                        className='flex items-center justify-center'
                                        style={{ width: '100%', height: '100%' }}
                                      >
                                        <Icon icon='tabler-photo' fontSize={22} className='text-textDisabled' />
                                      </div>
                                    )}
                                  </div>
                                  <div className='flex flex-col gap-0.5 min-is-0' style={{ maxWidth: 160 }}>
                                    <Typography className='truncate text-[13px] font-medium' color='text.primary'>
                                      {card.name}
                                    </Typography>
                                    <Typography className='text-[13px] font-bold' color='primary'>
                                      {priceLabel}
                                    </Typography>
                                    {!card.isActive && (
                                      <Typography
                                        component='span'
                                        className='inline-flex items-center gap-1 text-xs'
                                        color='text.disabled'
                                      >
                                        <Icon icon='tabler-ban' fontSize={13} />
                                        หยุดขายแล้ว
                                      </Typography>
                                    )}
                                    <Typography
                                      component='span'
                                      className='inline-flex items-center gap-1 text-xs font-medium'
                                      color='primary'
                                    >
                                      ดูสินค้า
                                      <Icon icon='tabler-external-link' fontSize={13} />
                                    </Typography>
                                  </div>
                                </Link>
                              )}
                            </div>
                          )
                        }

                        // ORDER (user 2026-07-24/25) — การ์ดคำสั่งซื้อที่ร้านส่งให้ (Vuexy, primary ไม่ใช่
                        // เขียวตาม ref); หัว "คำสั่งซื้อ · #เลข" + รายการสินค้าข้างใน + ยอดสุทธิ; ปุ่ม → /o/{token}
                        if (msg.type === 'ORDER') {
                          const card = msg.orderCard
                          // คำที่ลูกค้าเห็นต้องเป็นคำเดียวกับที่ร้านเห็น (user report 2026-08-12) —
                          // เดิมจอนี้ hardcode "คำสั่งซื้อ" ทั้งหัวการ์ดและปุ่มท้ายการ์ด ร้านบริการ/
                          // บ้านพักจึงส่งคำที่ตัวเองไม่ได้ใช้ออกไปหาลูกค้า
                          const orderVocab = resolveOrderVocab(card?.vertical ?? '')
                          if (!card) {
                            return (
                              <div
                                key={msg.id}
                                className='shadow-xs overflow-hidden bg-backgroundPaper flex items-center gap-2 pli-4 plb-3'
                                style={{ maxWidth: 260, borderRadius: 8 }}
                              >
                                <Icon icon='tabler-receipt-off' fontSize={20} className='text-textDisabled' />
                                <Typography className='text-[13px]' color='text.disabled'>
                                  ไม่พบ{orderVocab.noun}นี้แล้ว
                                </Typography>
                              </div>
                            )
                          }
                          const orderTitle = card.items[0]?.name ?? orderVocab.noun
                          const orderPriceLabel = `฿${Number(card.totalAmount).toLocaleString('th-TH')}`
                          return (
                            <div
                              key={msg.id}
                              className='shadow-xs overflow-hidden'
                              style={{ maxWidth: 260, borderRadius: 8, border: '1px solid var(--mui-palette-divider)' }}
                            >
                              <div
                                className='flex items-center gap-2 pli-4 plb-3'
                                style={{
                                  background: 'var(--mui-palette-primary-main)',
                                  color: 'var(--mui-palette-primary-contrastText)',
                                }}
                              >
                                <Icon icon='tabler-receipt-2' fontSize={26} />
                                <div className='min-is-0'>
                                  <Typography className='truncate text-[13px] font-medium' style={{ color: 'inherit' }}>
                                    {orderTitle}
                                  </Typography>
                                  <Typography className='truncate text-xs' style={{ color: 'inherit', opacity: 0.9 }}>
                                    {orderVocab.noun} · {card.orderNo || card.token.slice(0, 8).toUpperCase()}
                                  </Typography>
                                </div>
                              </div>
                              <div className='bg-backgroundPaper pli-4 plb-3'>
                                <div className='flex flex-col gap-2'>
                                  {card.items.map((it, i) => (
                                    <div key={i} className='flex items-center gap-2'>
                                      {/* รูปสินค้า (user 2026-07-25) */}
                                      <div
                                        className='shrink-0 overflow-hidden flex items-center justify-center'
                                        style={{ width: 36, height: 36, borderRadius: 6, background: '#E2E8F0' }}
                                      >
                                        {it.imageFileId ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={`/api/files/${it.imageFileId}`}
                                            alt={it.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                          />
                                        ) : (
                                          <Icon icon='tabler-photo' fontSize={16} className='text-textDisabled' />
                                        )}
                                      </div>
                                      <Typography className='truncate text-[13px] min-is-0 flex-1' color='text.secondary'>
                                        {it.name}
                                      </Typography>
                                      <Typography className='text-xs shrink-0' color='text.disabled'>
                                        x{it.qty}
                                      </Typography>
                                      <Typography className='text-[13px] font-medium shrink-0'>
                                        ฿{Number(it.price).toLocaleString('th-TH')}
                                      </Typography>
                                    </div>
                                  ))}
                                </div>
                                <div
                                  style={{ borderTop: '1px dashed var(--mui-palette-divider)', margin: '10px 0' }}
                                />
                                <div className='flex items-center justify-between'>
                                  <Typography className='text-[13px]' color='text.secondary'>
                                    รายการ
                                  </Typography>
                                  <Typography className='text-[13px] font-medium'>{card.items.length} รายการ</Typography>
                                </div>
                                <div className='flex items-center justify-between' style={{ marginTop: 6 }}>
                                  <Typography className='text-[13px]' color='text.secondary'>
                                    ยอดสุทธิ
                                  </Typography>
                                  <Typography className='text-[13px] font-bold' color='primary'>
                                    {orderPriceLabel}
                                  </Typography>
                                </div>
                              </div>
                              <Link
                                href={`/o/${card.token}`}
                                target='_blank'
                                className='bg-backgroundPaper flex items-center justify-center gap-1 plb-2.5'
                                style={{ textDecoration: 'none', borderTop: '1px solid var(--mui-palette-divider)' }}
                              >
                                <Icon icon='tabler-external-link' fontSize={16} className='text-primary' />
                                <Typography className='text-[13px] font-medium' color='primary'>
                                  {orderVocab.viewLabel}
                                </Typography>
                              </Link>
                            </div>
                          )
                        }

                        // S-31 (extension #3 Scam-link Detection): flaggedScam=true (เฉพาะ TEXT — BR-SCAM-04)
                        // → ห่อ Typography ด้วย container เดียวกับ IMAGE/PRODUCT bubble แล้วต่อ warning banner
                        // ท้ายบับเบิลเดียวกัน (bg/rounded/shadow ย้ายมาที่ wrapper, Typography คงหน้าตาเดิม)
                        return (
                          <div
                            key={msg.id}
                            className={classnames('overflow-hidden shadow-xs', {
                              'bg-backgroundPaper rounded-e rounded-b': !isBuyer,
                              'bg-primary rounded-s rounded-b': isBuyer,
                            })}
                          >
                            <Typography
                              className={classnames('whitespace-pre-wrap pli-4 plb-2', {
                                'text-[var(--mui-palette-primary-contrastText)]': isBuyer,
                              })}
                              style={{ wordBreak: 'break-word' }}
                            >
                              {msg.body}
                            </Typography>
                            {msg.flaggedScam && (
                              <Alert
                                severity='warning'
                                variant='standard'
                                icon={<Icon icon='tabler-alert-triangle' fontSize={15} />}
                                sx={{
                                  py: 0.5,
                                  px: 1.5,
                                  gap: 1,
                                  borderRadius: 0,
                                  '& .MuiAlert-icon': { minInlineSize: 18, blockSize: 18, p: 0 },
                                  '& .MuiAlert-message': { p: 0 },
                                }}
                              >
                                <Typography variant='caption' component='span'>
                                  ข้อความนี้มีลิงก์ที่ควรระวัง — อย่าโอนเงินหรือให้รหัส OTP กับคนที่ไม่รู้จัก
                                </Typography>
                              </Alert>
                            )}
                          </div>
                        )
                      })}
                      <Typography variant='caption' color='text.disabled'>
                        {formatTimeHM(lastMsg.createdAt)}
                      </Typography>
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </Box>

      {/* composer — Base: SendMsgForm.tsx (ตัด emoji-mart Picker + microphone ตาม UX spec) */}
      <Box component='form' autoComplete='off' onSubmit={handleSend}>
        {pendingImage && (
          <Box className='pli-6 pbs-3'>
            <Chip
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview เท่านั้น ไม่ใช่ /api/files
              avatar={<img src={pendingImage.previewUrl} alt='ตัวอย่างรูปภาพ' style={{ borderRadius: '50%' }} />}
              label={pendingImage.file.name}
              onDelete={clearPendingImage}
            />
          </Box>
        )}
        <TextField
          fullWidth
          multiline
          maxRows={4}
          placeholder={pendingImage ? 'เพิ่มคำบรรยาย (ไม่บังคับ)' : 'พิมพ์ข้อความ...'}
          value={msgText}
          className='p-6'
          onChange={(e) => setMsgText(e.target.value)}
          sx={{
            '& fieldset': { border: '0' },
            '& .MuiOutlinedInput-root': {
              background: 'var(--mui-palette-background-paper)',
              boxShadow: 'var(--mui-customShadows-xs) !important',
            },
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              handleSend(e)
            }
          }}
          size='small'
          disabled={sending}
          slotProps={{
            input: {
              endAdornment: (
                <div className='flex items-center gap-1'>
                  <input ref={fileInputRef} type='file' accept={IMAGE_ACCEPT} hidden onChange={handleFileChange} />
                  <IconButton onClick={handleAttachClick} disabled={sending} aria-label='แนบรูปภาพ'>
                    <Icon icon='tabler-paperclip' className='text-textPrimary' />
                  </IconButton>
                  <CustomIconButton
                    variant='contained'
                    color='primary'
                    type='submit'
                    disabled={sending || (!msgText.trim() && !pendingImage)}
                    aria-label='ส่งข้อความ'
                  >
                    <Icon icon='tabler-send' />
                  </CustomIconButton>
                </div>
              ),
            },
          }}
        />
      </Box>
    </Box>
  )
}
