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
import { useSession } from 'next-auth/react'
import { formatDate } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { playChatBeep } from '@/lib/chat-sound'
import {
  ATTACHMENT_MAX_SIZE,
  BLOCKED_EXT,
  attachmentKind,
  extFromName,
  type AttachmentKind,
} from '@/lib/chat-attachment'

// chat-attachment.ts เป็น pure module จึง import ฝั่ง client ได้ (ต่างจาก '@/lib/storage' ที่ barrel
// ดึง driver local/s3 (fs/server-only) เข้า client bundle) — เพดาน/deny-list จึงไม่ต้อง duplicate อีก

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
export type OutgoingRetry = {
  // VIDEO/AUDIO/FILE (2026-08-02 multi-attachment) — ร้านแนบไฟล์ทุกชนิดได้ ไม่ใช่แค่รูป
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE'
  body: string | null
  imageUrl?: string
  attachmentName?: string | null
  attachmentSize?: number | null
  replyToMessageId?: string
}

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
  // CALL = เหตุการณ์การโทร (Meta icon-template) — render เป็นการ์ดกลางจอ ไม่ใช่บับเบิล
  type: 'TEXT' | 'IMAGE' | 'PRODUCT' | 'VIDEO' | 'AUDIO' | 'FILE' | 'ORDER' | 'CALL'
  /**
   * mid ของ Meta — รูปหลายใบในข้อความเดียวได้ `mid`, `mid#1`, `mid#2`… (convention ของ ingest)
   * ใช้เป็นเส้นแบ่ง "ก้อนอัลบั้ม" ในเธรด (user report 2026-08-04: 2 รูป + 6 รูป กลายเป็นกอง 8)
   * GET คืนคอลัมน์นี้มาอยู่แล้ว (findMany ไม่มี select) — ประกาศ type เพิ่มเท่านั้น
   * optional เพราะแถว optimistic ฝั่ง client ยังไม่มี mid จนกว่าจะบันทึกจริง
   */
  externalMessageId?: string | null
  body: string | null
  imageUrl: string | null
  // ไฟล์แนบ (2026-08-02) — ชื่อเดิม/ขนาดที่ผู้ส่งเลือก; null = ข้อความเก่าหรือไฟล์ที่ mirror มาจาก
  // Messenger/IG (Meta ไม่ส่งชื่อมา) → UI fallback ด้วย attachmentDisplayName()
  attachmentName?: string | null
  attachmentSize?: number | null
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
    aiContext?: Record<string, unknown> | null
    keywordName: string | null
    matchedPhrase: string | null
    matchType: string | null
    channelName: string | null
    adLabel: string | null
    productName: string | null
  } | null
  /**
   * คนในทีมร้านที่กดส่งข้อความนี้ (user 2026-08-02) — enrich จาก API ทั้ง GET และ POST
   *
   * `null` = ไม่มีคนส่ง: ข้อความมาทาง webhook (echo ของสิ่งที่ส่งจาก Messenger/Business Suite
   * โดยตรง) หรือบอทตอบ → UI แสดงรูปเพจตามเดิม
   * มีค่าแต่ `avatar = null` = คนนั้นยังไม่ได้ตั้งรูปโปรไฟล์ → UI แสดงไอคอนคน placeholder
   */
  sender?: { name: string; avatar: string | null } | null
  // feature 00018 Phase 3 — reply/unsend
  isDeleted?: boolean // ผู้ส่ง unsend → แสดง "ข้อความถูกลบ"
  /** ลูกค้าแก้ข้อความนี้ทีหลัง (message_edits, 2026-08-03) — เนื้อความที่เห็นคือเวอร์ชันล่าสุดแล้ว */
  edited?: boolean
  replyTo?: { body: string | null; senderRole: 'BUYER' | 'SHOP' } | null // quote ข้อความที่ตอบทับ (enrich ที่ API)
  // optimistic send (client-only, ไม่มาจาก server): 'sending'=spinner, 'sent'=check, 'failed'=refresh แดง
  _status?: 'sending' | 'sent' | 'failed'
  // payload สำหรับ resend เมื่อ _status='failed' (เก็บเฉพาะข้อความ optimistic ที่ยังไม่สำเร็จ)
  _retry?: OutgoingRetry
  /** เหตุผลที่ส่งไม่สำเร็จของข้อความ optimistic (2026-08-03) — เดิมเหตุผลไปอยู่ใน toast อย่างเดียว
   *  ซึ่งหายไปเองใน 2-3 วินาที เหลือบับเบิลแดงที่มีแต่ปุ่ม "ลองใหม่" ไม่บอกว่าทำไมพัง. หลังเลิกล็อก
   *  ช่องพิมพ์ตามหน้าต่าง 24 ชม. บับเบิลล้มเหลวจะเกิดถี่ขึ้นมาก เหตุผลจึงต้องอยู่ติดข้อความถาวร
   *  เหมือนเส้นทาง deliveryStatus='FAILED' (แถวที่บันทึกลง DB แล้ว) ไม่ใช่คนละมาตรฐาน */
  _failReason?: string
  /** หมายเหตุระดับ "ชุดที่ส่งด้วยกัน" (2026-08-05 ux spec partial-send) — แนบท้ายเหตุผลบนปุ่ม (i)
   *  เมื่อใบนี้ล้มเหลวแต่ใบอื่นในชุดเดียวกันถึงลูกค้าไปแล้ว: กัน "ผู้ขายเข้าใจว่าพังทั้งชุดแล้วไป
   *  เลือกรูปส่งใหม่ทั้ง 8 ใบเองที่ composer" ซึ่งจะทำให้ลูกค้าได้รูปที่ถึงแล้วซ้ำ. แยกจาก
   *  _failReason เพราะเหตุผลจริงมาจาก server (describeSendFailure) แต่หมายเหตุนี้ client เท่านั้น
   *  ที่รู้ (server ไม่รู้ว่าบับเบิลไหนอยู่ชุดเดียวกัน) */
  _batchNote?: string
  /** สถานะคลุมเครือ (2026-08-05): เชื่อมต่อหลุดหลังกดส่ง — ไม่รู้ว่า server ส่งออกไปแล้วแค่ไหน
   *  ผลต่อ UI: ข้อความยืนยันตอน "ยกเลิก" ต้องไม่พูดว่า "ลูกค้าไม่เคยได้รับ" (อาจเป็นเท็จ)
   *  และ refetch จะ reconcile บับเบิลนี้กับแถวจริงด้วย fileId (ดู reconcileIdsRef) */
  _ambiguous?: boolean
}

type MessagesApiResponse = {
  items: ChatMessageView[]
  nextCursor: string | null
  /** watermark "ลูกค้าอ่านถึงเวลานี้" (feature 00018 read receipt) — มากับทุก GET เพื่อให้ป้าย
   *  "ส่งแล้ว → อ่านแล้ว" อัปเดตได้เองโดยไม่ต้องรีโหลดหน้า (read event ไม่ทริกเกอร์ realtime) */
  externalReadAt?: string | null
  /** watermark "ข้อความของร้านถึงเครื่องลูกค้าถึงเวลานี้" (Messenger message_deliveries, 2026-08-05)
   *  มาคู่กับ externalReadAt ด้วยเหตุผลเดียวกัน — delivery event ไม่ insert ChatMessage จึงไม่มี
   *  realtime broadcast ให้เกาะ ต้องติดมากับ GET ให้ป้ายขยับเองในรอบ poll ถัดไป
   *  null เสมอสำหรับเธรด Instagram (โปรโตคอลไม่มี delivery receipt) — ไม่ใช่ข้อมูลขาด */
  externalDeliveredAt?: string | null
}

/**
 * ไฟล์ที่แนบไว้รอส่ง (2026-08-02 multi-attachment)
 *
 * ฟิลด์ที่เพิ่มเป็น optional ทั้งหมดโดยตั้งใจ — caller เดิม (ChatWidgetThreadPanel, การเลือกสินค้า,
 * ข้อความสำเร็จรูป) สร้าง object นี้จาก fileId ตรง ๆ ไม่มี metadata ให้ใส่ ค่าที่ขาดจึง derive
 * จากนามสกุลของ fileId แทน
 */
export type PendingAttachment = {
  fileId: string
  /** objectURL สำหรับรูป/วิดีโอ; ไฟล์ชนิดอื่นเป็น '' (ไม่มีอะไรให้พรีวิว) */
  previewUrl: string
  name?: string
  size?: number
  mime?: string
  kind?: AttachmentKind
}
/** ชื่อเดิม — ChatWidgetThreadPanel และ caller อื่นยังอ้างชื่อนี้อยู่ */
export type PendingImage = PendingAttachment

/** kind ของไฟล์ที่แนบไว้ — ไม่มี metadata (caller เดิม) ก็เดาจากนามสกุลของ fileId ได้ */
export function pendingKind(a: PendingAttachment): AttachmentKind {
  return a.kind ?? attachmentKind(a.mime ?? '', extFromName(a.fileId))
}

/** ป้ายแทนเนื้อหาใน quote เมื่อข้อความที่ตอบทับไม่มี body (สื่อ/การ์ด) — TEXT ไม่มีในนี้โดยตั้งใจ
 *  เพราะ TEXT มี body เสมอจึงไม่เคยตกมาถึง fallback */
const QUOTE_LABEL: Record<string, string> = {
  IMAGE: '[รูปภาพ]',
  VIDEO: '[วิดีโอ]',
  AUDIO: '[ข้อความเสียง]',
  FILE: '[ไฟล์แนบ]',
  ORDER: '[คำสั่งซื้อ]',
  PRODUCT: '[สินค้า]',
}

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
  // ผู้ส่ง = ตัวเราเองเสมอสำหรับบับเบิล optimistic (user 2026-08-02) — ถ้าไม่ใส่ไป บับเบิลที่เพิ่ง
  // กดส่งจะขึ้นรูปเพจอยู่ครู่หนึ่งแล้วเปลี่ยนเป็นรูปเราตอน API ตอบกลับ ซึ่งอ่านเหมือนระบบสลับ
  // ตัวตนผู้ส่งเอง (session มี displayName/avatar อยู่แล้ว ไม่ต้องยิง API เพิ่ม)
  const { data: _session } = useSession()
  const me = _session?.user as { displayName?: string; avatar?: string | null } | undefined
  const optimisticSender = me?.displayName ? { name: me.displayName, avatar: me.avatar ?? null } : null

  const [oldestCursor, setOldestCursor] = useState<string | null>(null)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [externalReadAt, setExternalReadAt] = useState<string | null>(null)
  const [externalDeliveredAt, setExternalDeliveredAt] = useState<string | null>(null)
  /**
   * บับเบิลคลุมเครือที่รอเทียบกับแถวจริง (2026-08-05) — เน็ตหลุดหลังกดส่งกริด ไม่รู้ว่า server
   * ส่งออกไปแล้วแค่ไหน. refetch รอบถัดไปจะจับคู่บับเบิลในชุดนี้กับแถวจริงด้วย fileId (unique ต่อ
   * การอัปโหลด — จับคู่แน่นอนกว่าเดา index) แถวจริงโผล่ = บับเบิลคลุมเครือใบนั้นถูกลบทิ้ง
   * (ภาพที่ผู้ขายเห็น: บับเบิลแดง "ไม่แน่ใจ" เปลี่ยนเป็นข้อความที่ส่งสำเร็จ ตาม ux spec Q3)
   */
  const reconcileIdsRef = useRef<Set<string>>(new Set())
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [uploading, setUploading] = useState(false)
  // ความคืบหน้าเมื่อแนบหลายไฟล์ (2026-08-02) — boolean เดิมบอกได้แค่ "กำลังทำอะไรอยู่"
  // ซึ่งไม่พอเมื่อคิวมี 8 ไฟล์และแต่ละไฟล์ใช้เวลาไม่เท่ากัน. null = ไม่ได้อัปโหลดอยู่
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
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
        if (data.externalDeliveredAt !== undefined) setExternalDeliveredAt(data.externalDeliveredAt)
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
      if (data.externalDeliveredAt !== undefined) setExternalDeliveredAt(data.externalDeliveredAt)
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
        const merged = Array.from(map.values()).sort((a, b) => {
          const dt = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          if (dt !== 0) return dt
          return (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER)
        })
        // reconcile บับเบิลคลุมเครือ (เน็ตหลุดตอนส่งกริด — ดู reconcileIdsRef): แถวจริงของรูปใบ
        // เดียวกันโผล่มา = การส่งนั้นถึง server จริง ลบบับเบิลแดงทิ้ง เหลือแถวจริงใบเดียว
        // จับคู่: รูป/ไฟล์ = fileId (unique ต่อการอัปโหลด — แม่นเสมอ); แคปชัน TEXT = body ตรงกัน
        // ในกรอบเวลาใกล้เคียง (กัน false-positive จากข้อความซ้ำ ๆ อย่าง "ขอบคุณครับ" ในอดีต)
        if (reconcileIdsRef.current.size === 0) return merged
        return merged.filter((m) => {
          if (!reconcileIdsRef.current.has(m.id)) return true
          const notBefore = new Date(m.createdAt).getTime() - 120_000
          const landed = merged.some(
            (r) =>
              !r.id.startsWith('local-') &&
              r.senderRole === 'SHOP' &&
              new Date(r.createdAt).getTime() >= notBefore &&
              (m.imageUrl ? r.imageUrl === m.imageUrl : r.type === 'TEXT' && !!m.body && r.body === m.body),
          )
          if (landed) reconcileIdsRef.current.delete(m.id)
          return !landed
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

  // ── แนบไฟล์ (auto-upload ทันที — pattern ProductImagesCardV2.tsx) ────
  //
  // 2026-08-02: เดิมรับแต่รูป jpg/png/webp ≤5MB — ตอนนี้รับทุกชนิดที่ไม่ติด deny-list ≤25MB
  //
  // แบ่งการตรวจ 2 ชั้นโดยตั้งใจ:
  //   ที่นี่ = กฎที่ตัดสินได้โดยไม่ต้องรู้ช่องทาง (นามสกุลอันตราย/ขนาด) → บอกได้ทันทีไม่ต้องอัปโหลด
  //   ที่ /api/chat/upload = กฎเฉพาะช่องทาง (IG รับแต่ PDF ฯลฯ) ซึ่ง route resolve channel เองได้
  // จึงไม่ต้อง duplicate ความรู้เรื่องช่องทางมาไว้ฝั่ง client แล้วเสี่ยงให้สองที่ไม่ตรงกัน
  const uploadFile = async (file: File) => {
    const ext = extFromName(file.name)
    if (BLOCKED_EXT.includes(ext)) {
      pacesToast.error(`ไฟล์ชนิด .${ext} ส่งไม่ได้ด้วยเหตุผลด้านความปลอดภัย`)
      return
    }
    if (file.size > ATTACHMENT_MAX_SIZE) {
      pacesToast.error(`"${file.name}" ใหญ่เกิน 25MB`)
      return
    }
    const kind = attachmentKind(file.type, ext)
    // objectURL เฉพาะชนิดที่พรีวิวได้จริง — ไฟล์เอกสารสร้างไปก็ไม่มีใครใช้ แถมต้องคอย revoke
    const previewUrl = kind === 'IMAGE' || kind === 'VIDEO' ? URL.createObjectURL(file) : ''
    setUploading(true)
    setUploadProgress((p) => ({ done: p?.done ?? 0, total: (p?.total ?? 0) + 1 }))
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/chat/upload?conversationId=${encodeURIComponent(conversationId)}`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        // route คืนเหตุผลไทยที่พร้อมโชว์ (checkChannelSupport) — ใช้ของจริงดีกว่าข้อความกลาง ๆ
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error || 'อัปโหลดไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง')
      }
      const data: { fileId: string; name: string; size: number; mime: string; kind: AttachmentKind } =
        await res.json()
      setPendingImages((prev) => [
        ...prev,
        { fileId: data.fileId, previewUrl, name: data.name, size: data.size, mime: data.mime, kind: data.kind },
      ])
    } catch (err) {
      pacesToast.error(err instanceof Error ? err.message : 'อัปโหลดไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง')
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    } finally {
      setUploadProgress((p) => {
        const done = (p?.done ?? 0) + 1
        const total = p?.total ?? done
        // ครบชุดแล้ว → ล้างตัวนับ (ชุดถัดไปเริ่มนับใหม่ ไม่สะสมข้ามการแนบ)
        return done >= total ? null : { done, total }
      })
    }
  }

  /** อัปโหลดหลายไฟล์ — เรียงทีละไฟล์ ไม่ Promise.all: ลำดับในคิวต้องตรงกับลำดับที่ผู้ใช้เลือก
   *  เพราะคิวนี้กลายเป็นลำดับข้อความที่ลูกค้าเห็น (pattern เดียวกับ QuickMessageManager) */
  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return
    setUploadProgress({ done: 0, total: 0 })
    try {
      for (const f of files) await uploadFile(f)
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // reset — เลือกไฟล์เดิมซ้ำได้
    await uploadFiles(files)
  }

  // วางไฟล์จากคลิปบอร์ด (user request 2026-07-25: paste จาก screenshot/Line/Ctrl+C ลงช่องพิมพ์ได้เลย)
  // 2026-08-02: เดิมกรองเฉพาะ image/* — ตอนนี้รับทุกชนิด (คัดลอกไฟล์จาก Finder/Explorer มาวางได้)
  const handlePaste = async (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter((it) => it.kind === 'file')
      .map((it) => it.getAsFile())
      .filter((f): f is File => f !== null)
    if (files.length === 0) return // ไม่มีไฟล์ → ปล่อยวางข้อความปกติ
    e.preventDefault()
    await uploadFiles(files)
  }

  /** ลากไฟล์มาวางในเธรด (user สั่ง 2026-08-02) — ใช้เส้นทางอัปโหลดเดียวกับปุ่มแนบ/paste */
  const handleDropFiles = async (files: FileList | null) => {
    await uploadFiles(Array.from(files ?? []))
  }

  /** ไม่ระบุ fileId = ล้างทั้งคิว (ปุ่มเดิมของ ChatWidgetThreadPanel ที่มีรูปได้ทีละใบ) */
  const handleRemoveImage = (fileId?: string) => {
    setPendingImages((prev) => {
      const removed = fileId ? prev.filter((p) => p.fileId === fileId) : prev
      // previewUrl ว่างได้ตั้งแต่ 2026-08-02 (ไฟล์เอกสารไม่มีอะไรให้พรีวิว) — ไม่มี objectURL ให้คืน
      for (const img of removed) if (img.previewUrl) URL.revokeObjectURL(img.previewUrl)
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
          let reason: string
          const body = await res.json().catch(() => null)
          if (res.status === 429) {
            reason = 'ส่งข้อความถี่เกินไป กรุณารอสักครู่'
          } else {
            // บอกสาเหตุทันทีตอนกดส่ง/กดลองใหม่ (user 2026-08-02) — เดิมเงียบ เห็นแค่บับเบิลแดง
            // แล้วต้องรอ GET รอบถัดไปถึงจะรู้ว่าทำไม. route ตอบเป็นไทยแล้ว (chat-send-failure.ts)
            reason = body?.error ?? 'ส่งข้อความไม่สำเร็จ'
          }
          pacesToast.error(reason)
          // ส่งไม่ผ่าน ≠ ไม่ได้บันทึก — ถ้า Meta ปฏิเสธ server จะบันทึกแถว deliveryStatus=FAILED
          // ไว้แล้วและส่งกลับมาใน `savedMessage` ต้องเอามาแทนบับเบิล optimistic เหมือน path ที่สำเร็จ
          // ไม่งั้นบับเบิลชั่วคราวจะค้างคู่กับแถวจริงที่ตามมาทาง realtime/GET = ข้อความเดียวขึ้นสองอัน
          // แล้วหายไปเองตอน refresh (user report 2026-08-03)
          const saved: ChatMessageView | null = body?.savedMessage ?? null
          setMessages((prev) => {
            if (saved?.id) {
              const deduped = prev.filter((m) => m.id !== saved.id)
              return deduped.map((m) => (m.id === localId ? { ...saved, _status: undefined } : m))
            }
            // ไม่มีแถวจริง (ยังไม่ถึง Meta เลย เช่น 429/สิทธิ์/validation) — คงบับเบิลชั่วคราวไว้
            // พร้อมเหตุผล — toast หายเองแต่บับเบิลอยู่ต่อ ร้านต้องย้อนดูได้ว่าทำไมไม่ผ่าน
            return prev.map((m) =>
              m.id === localId ? { ...m, _status: 'failed' as const, _failReason: reason } : m,
            )
          })
          return
        }
        const real: ChatMessageView = await res.json()
        // แทน optimistic ด้วยแถวจริง + กันซ้ำถ้า realtime ดึงแถวจริง (id เดียวกัน) มาก่อนแล้ว
        setMessages((prev) => {
          const deduped = prev.filter((m) => m.id !== real.id)
          return deduped.map((m) => (m.id === localId ? { ...real, _status: 'sent' as const } : m))
        })
      } catch {
        // ไปไม่ถึง server เลย (เน็ตหลุด/หมดเวลา) — แยกถ้อยคำจากกรณีที่ Meta ปฏิเสธ เพราะทางแก้คนละอย่าง
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localId
              ? { ...m, _status: 'failed' as const, _failReason: 'เชื่อมต่อไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่' }
              : m,
          ),
        )
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
    //
    // 2026-08-02: type ของแต่ละใบมาจากชนิดไฟล์จริง ไม่ใช่ 'IMAGE' ตายตัวเหมือนเดิม
    const payloads: OutgoingRetry[] =
      pendingImages.length > 0
        ? [
            ...pendingImages.map((a) => ({
              type: pendingKind(a),
              imageUrl: a.fileId,
              attachmentName: a.name ?? null,
              attachmentSize: a.size ?? null,
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
            (QUOTE_LABEL[replyingTo.type] ?? '[สื่อ/ไฟล์แนบ]'),
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
        sender: optimisticSender,
        senderRole: 'SHOP',
        type: payload.type,
        body: payload.body,
        imageUrl: payload.imageUrl ?? null,
        // ต้องพกไปด้วย ไม่งั้นชิปไฟล์บนบับเบิล optimistic ขึ้นชื่อว่างจนกว่า POST จะกลับ
        attachmentName: payload.attachmentName ?? null,
        attachmentSize: payload.attachmentSize ?? null,
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
    for (const img of pendingImages) if (img.previewUrl) URL.revokeObjectURL(img.previewUrl)
    setPendingImages([])
    scrollToBottom()
    // ส่งเรียงทีละใบ (ไม่ Promise.all) — ให้ลำดับข้อความฝั่งลูกค้าตรงกับลำดับรูปที่แนบ และไม่ยิง
    // Graph API พร้อมกันจนโดน rate limit
    /**
     * รูปหลายใบ → ส่งเป็น "กริดในข้อความเดียว" (Meta image_grid) — user สั่ง 2026-08-04 ให้เหมือน
     * Business Suite (ครอบทั้งการแนบเองและ "ข้อความสำเร็จรูป" ที่พารูปมาหลายใบ เพราะทั้งสองทาง
     * ลงมาที่ pendingImages ชุดเดียวกัน)
     *
     * เงื่อนไข: ตั้งแต่ 2 ใบขึ้นไป และเป็น "รูป" ทั้งหมด (วิดีโอ/ไฟล์ยังต้องส่งทีละชิ้นตาม Send API)
     * fail-safe 2 ชั้น: (1) ที่นี่ — ยิงกริดไม่ผ่าน (เช่นเธรด DEEP ตอบ 400) ตกไปวนส่งทีละใบแบบเดิม
     * (2) ที่ service — Meta ปฏิเสธ template ก็ยังส่งทีละใบให้เอง ร้านต้องส่งออกได้เสมอ
     */
    const gridFiles = pendingImages.filter((a) => pendingKind(a) === 'IMAGE').map((a) => a.fileId)
    const gridMode = pendingImages.length >= 2 && gridFiles.length === pendingImages.length

    void (async () => {
      if (gridMode) {
        let res: Response
        try {
          res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'IMAGE_GRID',
              body: trimmed || null,
              imageFileIds: gridFiles,
              ...(replyTargetId ? { replyToMessageId: replyTargetId } : {}),
            }),
          })
        } catch {
          /**
           * เชื่อมต่อหลุดหลังกดส่ง (2026-08-05 ux spec) — request อาจไปถึง server แล้วหรือไม่ก็ได้
           * **ห้ามวนส่งใหม่ทั้งชุดเด็ดขาด**: ถ้า server ได้รับไปแล้ว การ resend = ลูกค้าได้รูปซ้ำ
           * ทั้งกริด ถอนคืนไม่ได้ (เดิม catch นี้ตกลงไปเส้นทางส่งทีละใบ = resend ทั้งชุดพอดี)
           *
           * ทำแทน: มาร์กทุกบับเบิลเป็นคลุมเครือ (_ambiguous) + refetch มาเทียบ — reconcileIdsRef
           * จะลบบับเบิลที่มีแถวจริง (จับคู่ด้วย fileId ซึ่ง unique ต่อการอัปโหลด) ออกให้เอง
           * ผู้ขายกด "ลองใหม่" รายใบได้จาก _retry ที่บับเบิลถืออยู่แล้ว
           */
          const ambiguousReason =
            'เชื่อมต่อขาดหายระหว่างส่งชุดนี้ — บางรูปอาจถึงลูกค้าแล้ว ระบบกำลังตรวจสอบให้อัตโนมัติ รออีกสักครู่ก่อนกดลองใหม่ รูปที่ถึงแล้วจะเปลี่ยนเป็นสถานะส่งสำเร็จเอง'
          const ids = new Set(queued.map((q) => q.localId))
          for (const q of queued) reconcileIdsRef.current.add(q.localId)
          setMessages((prev) =>
            prev.map((m) =>
              ids.has(m.id)
                ? { ...m, _status: 'failed' as const, _failReason: ambiguousReason, _ambiguous: true }
                : m,
            ),
          )
          void refetchNewer()
          return
        }
        if (res.ok) {
          /**
           * เอาแถวจริงไป "ทับ" บับเบิลชั่วคราวใบต่อใบ แทนการลบทิ้งแล้วรอ refetch (2026-08-05)
           *
           * ของเดิมลบบับเบิลชั่วคราวแล้วให้ refetchNewer ดึงแถวจริงมาแสดงแทน ปัญหาคือ trigger
           * ฝั่งฐานยิง broadcast ทันทีที่ createMany สำเร็จ (ก่อน route จะตอบกลับด้วยซ้ำ เพราะยัง
           * เหลือแคปชัน/ก้อนถัดไปให้ส่ง) — poll 6 วิ/realtime จึงดึงแถวจริงเข้ามาได้ตั้งแต่บับเบิล
           * ชั่วคราวยังหมุนอยู่ ผลคือรูปเดียวกันขึ้นสองใบ ใบล่างหน้าตาเหมือนส่งสำเร็จเรียบร้อยแล้ว
           * ทั้งที่ยังส่งไม่จบ — ตรงกับที่ผู้ขายรายงานว่า "ขึ้นเหมือนส่งแล้วเลย"
           *
           * จับคู่ตามลำดับ (แถวที่ i ↔ บับเบิลที่ i) ได้เพราะ route ประกอบ items เรียงตามลำดับรูป
           * ที่แนบมาอยู่แล้ว. จำนวนไม่เท่ากันได้ 3 ทาง:
           *   - echo ชนกันจน skipDuplicates ข้ามบางแถว → บับเบิลนั้นลบทิ้ง (ตัวจริงมากับ refetch)
           *   - เศษรูปใบเดียวที่แคปชันไม่ได้แถวของตัวเอง → เหมือนกัน ลบทิ้ง
           *   - **ก้อนหลังพังหลังก้อนแรกออกไปแล้ว (partialError)** → ห้ามลบ ต้องมาร์กแดงพร้อม
           *     เหตุผล ให้ผู้ขายกดลองใหม่รายใบ — ลบทิ้งเงียบ ๆ คือการโกหกว่าส่งครบ (ux spec 2026-08-05)
           */
          const body = (await res.json().catch(() => null)) as {
            items?: ChatMessageView[]
            partialError?: string | null
          } | null
          const items = body?.items ?? []
          const partialError = body?.partialError ?? null

          // นับเฉพาะ "รูป" — แถวแคปชัน (TEXT) ไม่ใช่ใบ (ux: toast พูดเป็นจำนวนใบ)
          const deliveryOf = (m: ChatMessageView) => (m as { deliveryStatus?: string | null }).deliveryStatus
          const okImages = items.filter((m) => m.type !== 'TEXT' && deliveryOf(m) !== 'FAILED').length
          const failedServerImages = items.filter((m) => m.type !== 'TEXT' && deliveryOf(m) === 'FAILED').length
          // บับเบิลรูปที่ไม่มีแถวมาแทนและก้อนมันพัง — จะถูกมาร์กแดงข้างล่าง นับรวมเป็น "ไม่สำเร็จ"
          const leftoverFailedImages = partialError
            ? queued.filter((q, i) => !items[i] && q.payload.type === 'IMAGE').length
            : 0
          const failedImages = failedServerImages + leftoverFailedImages

          // หมายเหตุประจำชุด (ux Q2): แปะเฉพาะเมื่อ "มีใบที่ถึงลูกค้าแล้วจริง" — ไม่มีก็ห้ามพูด
          const batchNote =
            okImages > 0
              ? 'รูปอื่นในชุดเดียวกันที่ส่งไปก่อนหน้าถึงลูกค้าเรียบร้อยแล้ว ไม่ต้องกดส่งซ้ำทั้งชุด กดลองใหม่เฉพาะรูปนี้ได้เลย'
              : undefined

          setMessages((prev) => {
            const byLocalId = new Map(queued.map((q, i) => [q.localId, items[i]]))
            const localIds = new Set(queued.map((q) => q.localId))
            const realIds = new Set(items.map((m) => m.id))
            return (
              prev
                // กันซ้ำ: realtime/poll อาจดึงแถวจริงชุดเดียวกันเข้ามาก่อนหน้านี้แล้ว
                .filter((m) => !realIds.has(m.id))
                .map((m) => {
                  if (!localIds.has(m.id)) return m
                  const real = byLocalId.get(m.id)
                  if (real) {
                    // แถว FAILED จาก server = บับเบิลแดงถาวร (deliveryStatus ทำงานเอง) + หมายเหตุชุด
                    return deliveryOf(real) === 'FAILED'
                      ? { ...real, _batchNote: batchNote }
                      : { ...real, _status: 'sent' as const }
                  }
                  // ไม่มีแถวมาแทน: ก้อนพัง → มาร์กแดง (ยังมี _retry ให้กดลองใหม่รายใบ);
                  // ปกติ (แคปชัน echo) → ลบ รอ refetch เก็บ
                  return partialError
                    ? { ...m, _status: 'failed' as const, _failReason: partialError, _batchNote: batchNote }
                    : null
                })
                .filter((m): m is ChatMessageView => m !== null)
            )
          })

          // toast สรุปชุด (ux Q1) — บับเบิลแดงอาจอยู่นอกจอตอนส่งหลายใบ toast คือสัญญาณเดียวที่เห็นแน่
          // ผู้ขายเพิ่งกด action เอง → top-right ไม่ใช่ .chat.* (precedent เดียวกับ postMessage)
          if (failedImages > 0) {
            if (okImages > 0) {
              pacesToast.warning(`ส่งถึงลูกค้าแล้ว ${okImages} ใบ · อีก ${failedImages} ใบส่งไม่สำเร็จ`, { duration: 5000 })
            } else {
              pacesToast.error(`ส่งรูปไม่สำเร็จทั้ง ${failedImages} ใบ`, { duration: 5000 })
            }
          }

          // ยังต้อง refetch อยู่ — เก็บแถวที่ไม่ได้กลับมากับ response (แคปชันของเศษรูปใบเดียว
          // ที่ Meta พาเข้ามาทาง echo) และ enrich field ที่ POST ไม่ได้ประกอบให้ (เช่น replyTo)
          await refetchNewer()
          return
        }
        // non-ok: route รับประกัน (สัญญา 2026-08-05) ว่า error = ยังไม่มีอะไรถูกส่งออกไปเลย
        // → ตกไปส่งทีละใบได้โดยไม่เสี่ยงรูปซ้ำ
      }
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

  /**
   * ส่งซ้ำข้อความที่ "บันทึกลง DB แล้วแต่ยิงออกช่องทางนอกไม่สำเร็จ" (deliveryStatus='FAILED')
   * — คนละเคสกับ retryMessage ข้างบนซึ่งเป็นบับเบิล optimistic ที่ยังไม่เคยถึง server (user 2026-08-02)
   *
   * ทำไมถึงเป็น "ข้อความใหม่" ไม่ใช่แก้แถวเดิมให้กลายเป็นสำเร็จ: ChatMessage ประกาศตัวเองว่า
   * append-only (schema.prisma "ไม่มี updatedAt/edit") — ครั้งที่ส่งใหม่คืออีกเหตุการณ์หนึ่งจริง ๆ
   * (mid คนละตัว เวลาคนละเวลา) จึงต้องเป็นแถวใหม่ ไม่ใช่การเขียนทับแถวเก่า
   *
   * สำคัญ: caller ต้องเอาแถวเดิมออกเองด้วย `cancelMessage(oldId)` (ดู ChatThread `retryFailed`) —
   * ไม่งั้นข้อความเดียวกันค้างเป็นบับเบิลแดงซ้อนกัน N อันตามจำนวนครั้งที่กด ซึ่งไม่ตรงกับคำว่า
   * "ลองใหม่" (user report 2026-08-03). ที่ทำได้เพราะ `cancelMessage` ลบถึง DB จริงผ่าน DELETE
   * endpoint — ภาพก่อน/หลังรีเฟรชจึงยังตรงกัน (ต่างจากการกรองทิ้งแค่ฝั่ง client ที่จะโผล่กลับมา)
   */
  const resendMessage = useCallback(
    (payload: OutgoingRetry) => {
      const localId = `local-${localIdRef.current++}-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        {
          id: localId,
          conversationId,
          senderUserId: '',
          sender: optimisticSender,
          senderRole: 'SHOP',
          type: payload.type,
          body: payload.body,
          imageUrl: payload.imageUrl ?? null,
          createdAt: new Date().toISOString(),
          replyTo: null,
          _status: 'sending',
          _retry: payload,
        } as ChatMessageView,
      ])
      scrollToBottom()
      void postMessage(localId, payload)
    },
    [conversationId, postMessage, scrollToBottom],
  )

  /**
   * ยกเลิกข้อความที่ส่งไม่สำเร็จ — เอาบับเบิลออกจากเธรด (user สั่ง 2026-08-02)
   *
   * 2 เส้นทางตาม "แถวนี้ถูกบันทึกลง DB แล้วหรือยัง":
   *   - บับเบิล optimistic (id ขึ้นต้น local-) ยังไม่เคยถึง server → ลบจาก state พอ ไม่ต้องยิง API
   *   - แถวจริง → DELETE ที่ server ก่อน แล้วค่อยเอาออกจาก state **เมื่อสำเร็จเท่านั้น**
   *     ถ้าเอาออกก่อนแล้ว API ล้ม บับเบิลจะโผล่กลับมาตอนรีเฟรช = ผู้ขายเข้าใจว่ายกเลิกแล้วทั้งที่ยัง
   *
   * คืน true เมื่อบับเบิลหายจริง — ให้ caller ตัดสินใจเรื่อง feedback เอง
   */
  const cancelMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (messageId.startsWith('local-')) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId))
        return true
      }
      try {
        const res = await fetch(`/api/chat/conversations/${conversationId}/messages/${messageId}`, {
          method: 'DELETE',
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          pacesToast.error(body?.error ?? 'ยกเลิกข้อความไม่สำเร็จ')
          return false
        }
        setMessages((prev) => prev.filter((m) => m.id !== messageId))
        return true
      } catch {
        pacesToast.error('ยกเลิกข้อความไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
        return false
      }
    },
    [conversationId],
  )

  /**
   * ส่งสติกเกอร์ Meta (user สั่ง 2026-08-04 "channel ที่เป็น facebook รองรับ sticker ด้วย")
   *
   * ไม่ทำ optimistic bubble ต่างจากข้อความ/รูป: บับเบิลสติกเกอร์ต้องแสดงจาก fileId ที่ server
   * mirror ไว้ (ตัวเรนเดอร์อ่าน imageUrl เป็น fileId เสมอ) — ถ้าแอบใส่ URL ของ Meta ลงไปก่อน
   * บับเบิลจะเป็นรูปแตกอยู่ชั่วขณะแล้วสลับ ซึ่งแย่กว่ารอ ~1 วินาทีแล้วขึ้นของจริงทีเดียว
   * ระหว่างรอใช้ธง sending เดิม (ปุ่มในแผงจะกดซ้ำไม่ได้)
   */
  const sendSticker = useCallback(
    async (sticker: { id: string; imageUrl: string }): Promise<boolean> => {
      /**
       * บับเบิล optimistic เหมือนส่งข้อความ (user สั่ง 2026-08-04: "อยากให้เหมือนส่งข้อความ คือ
       * แสดงรูป sticker ก่อน แล้วข้างล่างมี spinner ว่ากำลังส่งไปที่ API เพราะเมื่อกี้ user จะเข้าใจ
       * ว่าข้อความหายไป")
       *
       * รอบก่อนผมตั้งใจไม่ทำ optimistic เพราะบับเบิลอ่าน imageUrl เป็น fileId ใน storage เราเสมอ
       * → ใส่ URL ของ Meta ลงไปจะได้รูปแตก. แก้ที่ต้นเหตุแล้ว (mediaSrc ใน ChatThread รับทั้ง
       * fileId และ URL เต็ม) จึงโชว์รูปจาก CDN ได้ทันที แล้วพอ POST สำเร็จ refetch จะแทนด้วยแถวจริง
       * ที่ชี้ไฟล์ที่ mirror ไว้ฝั่งเรา (URL ของ Meta หมดอายุได้ — ห้ามเก็บถาวร)
       */
      /**
       * กดสติกเกอร์จากเมนูกดค้าง = ตอบทับข้อความนั้น (user สั่ง 2026-08-04 "ถ้ากด sticker จะถือว่า
       * เป็น reply อัตโนมัติ") — ใช้ replyingTo ตัวเดียวกับการตอบด้วยข้อความ ไม่มี state ใหม่:
       * เมนูกดค้างตั้ง replyingTo ให้อยู่แล้ว สติกเกอร์จึงไปผูกการตอบเองโดยไม่ต้องต่อสายเพิ่ม
       * (Meta ไม่ได้ระบุว่า sticker รองรับ reply_to — service ลองใหม่แบบไม่ผูกให้ถ้าถูกปฏิเสธ)
       */
      const replyTarget = replyingTo
      const localId = `local-s${localIdRef.current++}-${Date.now()}`
      const optimistic: ChatMessageView = {
        id: localId,
        conversationId,
        senderUserId: '',
        senderRole: 'SHOP',
        type: 'IMAGE',
        body: null,
        imageUrl: sticker.imageUrl,
        createdAt: new Date().toISOString(),
        replyTo: replyTarget
          ? {
              body: replyTarget.body ?? '[รูปภาพ]',
              senderRole: replyTarget.senderRole,
            }
          : null,
        _status: 'sending',
      } as ChatMessageView
      setMessages((prev) => [...prev, optimistic])
      try {
        const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'STICKER',
            body: null,
            stickerId: sticker.id,
            stickerImageUrl: sticker.imageUrl,
            ...(replyTarget && !replyTarget.id.startsWith('local-')
              ? { replyToMessageId: replyTarget.id }
              : {}),
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          pacesToast.error(body?.error ?? 'ส่งสติกเกอร์ไม่สำเร็จ')
          // คงบับเบิลไว้เป็นสถานะ failed — หายไปเงียบ ๆ คือสิ่งที่ user บอกว่าทำให้เข้าใจว่าข้อความหาย
          setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, _status: 'failed' } : m)))
          return false
        }
        setReplyingTo(null) // ส่งแล้วเลิกโหมดตอบ เหมือนส่งข้อความตอบสำเร็จ
        await refetchNewer()
        // แถวจริงมาแล้ว (refetch) → เอาบับเบิลชั่วคราวออก
        setMessages((prev) => prev.filter((m) => m.id !== localId))
        return true
      } catch {
        pacesToast.error('ส่งสติกเกอร์ไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
        setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, _status: 'failed' } : m)))
        return false
      }
    },
    [conversationId, refetchNewer, replyingTo],
  )

  /**
   * ร้านกดรีแอ็กชันใส่ข้อความ (user สั่ง 2026-08-03) — optimistic แล้วค่อยยิง API
   *
   * optimistic เพราะการกดรีแอ็กชันต้องรู้สึก "ติดทันที" เหมือนในแอปแชททุกตัว และค่ามัน
   * ย้อนกลับง่าย (คืนค่าเดิมถ้า API ปฏิเสธ) ต่างจากการส่งข้อความที่ต้องมีบับเบิลค้างให้กดซ้ำ
   * กดอันเดิมซ้ำ = ถอนออก (emoji=null) ตามพฤติกรรม Messenger
   */
  const reactToMessage = useCallback(
    async (messageId: string, emoji: string): Promise<void> => {
      // ข้อความ optimistic ยังไม่มีแถวจริงใน DB ให้ผูกรีแอ็กชัน
      if (messageId.startsWith('local-')) return
      let previous: string | null = null
      let next: string | null = null
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m
          previous = m.reactionEmoji ?? null
          next = m.reactionEmoji === emoji ? null : emoji
          return { ...m, reactionEmoji: next }
        }),
      )
      try {
        const res = await fetch(`/api/chat/conversations/${conversationId}/messages/${messageId}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ emoji: next }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          pacesToast.error(body?.error ?? 'กดรีแอ็กชันไม่สำเร็จ')
          setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactionEmoji: previous } : m)))
        }
      } catch {
        pacesToast.error('กดรีแอ็กชันไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactionEmoji: previous } : m)))
      }
    },
    [conversationId],
  )

  return {
    messages,
    oldestCursor,
    loadingInitial,
    loadingOlder,
    sending,
    reactToMessage,
    sendSticker,
    uploading,
    /** {done,total} ระหว่างแนบหลายไฟล์ — null เมื่อไม่ได้อัปโหลด (2026-08-02) */
    uploadProgress,
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
    handlePaste, // วางไฟล์จากคลิปบอร์ดลงช่องพิมพ์ (user 2026-07-25; ขยายเป็นทุกชนิด 2026-08-02)
    handleDropFiles, // ลากไฟล์มาวางในเธรด (user 2026-08-02)
    handleRemoveImage,
    handleSend,
    // reply/quote (user 2026-07-25) — ข้อความที่กำลังตอบทับ + setter (composer preview + ปุ่ม reply บนบับเบิล)
    replyingTo,
    setReplyingTo,
    // optimistic send — resend เมื่อบับเบิล _status='failed'
    retryMessage,
    // ส่งซ้ำแถวที่บันทึกแล้วแต่ deliveryStatus='FAILED' (ปุ่ม "ลองใหม่" ใต้บับเบิลแดง)
    resendMessage,
    // ยกเลิกข้อความที่ส่งไม่สำเร็จ — เอาบับเบิลออกจากเธรด (รองรับทั้ง optimistic และแถวจริง)
    cancelMessage,
    /** read receipt (feature 00018) — สดจาก GET ล่าสุด; caller ควรใช้ค่านี้แทน server prop ตอนเปิดหน้า
     *  เพราะ read event มาทีหลังทาง webhook โดยไม่ทริกเกอร์ realtime (ดู comment ที่ route GET) */
    externalReadAt,
    /** delivery receipt (2026-08-05) — watermark "ถึงเครื่องลูกค้าถึงเวลานี้" จาก message_deliveries
     *  null ตลอดสำหรับ Instagram (โปรโตคอลไม่มี event นี้) caller ต้อง gate ด้วย channel เอง */
    externalDeliveredAt,
  }
}
