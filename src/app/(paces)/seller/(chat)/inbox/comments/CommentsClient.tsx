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
import { formatTimeHM, formatDateTimeTH, formatChatListTime, formatDateTH } from '@/lib/format-date'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'
import { SellerThreadSkeleton } from '@/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton'
import EmojiPicker from '../[conversationId]/components/EmojiPicker'
import { subscribeShopComments } from '@/lib/comment-realtime'
import { ChannelBadgeOverlay, getChannelDisplay } from '../components/ChannelBadge'
import CommentsFilterPanel from './CommentsFilterPanel'

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
  lastCommentText: string | null
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
    createdTime: string | null
  }
  channel: { name: string; avatarUrl: string | null; provider: string }
  comments: CommentItem[]
}

/** โพสต์วิดีโอหรือเปล่า — Graph ส่ง media_type เป็น 'video' ส่วน status_type เก่าใช้ 'added_video' */
function isVideoPost(mediaType: string | null | undefined): boolean {
  return !!mediaType && (mediaType === 'video' || mediaType.includes('video'))
}

/**
 * หน้าต่าง "ทักแชทส่วนตัวจากคอมเมนต์" ของ Meta = 7 วันนับจากเวลาที่ลูกค้าคอมเมนต์
 * (คนละตัวกับหน้าต่าง 24 ชม. ของการตอบข้อความในกล่องแชท ซึ่งนับจากข้อความล่าสุดของลูกค้า)
 *
 * ทำไมต้องโชว์ (user สั่ง 2026-08-04): พ้น 7 วันแล้วทักไม่ได้อีกเลย ผู้ขายต้องเห็นตัวเลขตอนกำลัง
 * ตัดสินใจว่าจะตอบสาธารณะหรือทักหลังไมค์ ไม่ใช่ไปรู้ตอนกดแล้วโดน Meta ปฏิเสธ
 */
const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * user สั่งรูปแบบไว้ตรง ๆ 2026-08-04: `ตอบ  ทักแชท [คงเหลือ 6 วัน 14 ชั่วโมง 34 นาที]` ป้ายสีแดง
 * — เอาหน่วยเต็มทั้ง 3 ระดับ ไม่ย่อเหลือ "6 วัน" เฉย ๆ เพราะคนต้องใช้ตัดสินใจว่า "วันนี้ยังทันไหม"
 * ตัดหน่วยบนที่เป็นศูนย์ทิ้ง (เหลือไม่ถึงวันไม่ต้องขึ้น "0 วัน") แต่ไม่ตัดหน่วยล่าง
 */
function privateReplyWindow(createdTime: string): { text: string; expired: boolean } {
  const left = new Date(createdTime).getTime() + PRIVATE_REPLY_WINDOW_MS - Date.now()
  if (!Number.isFinite(left)) return { text: '', expired: false }
  if (left <= 0) return { text: 'หมดเวลาทักแชท', expired: true }
  const days = Math.floor(left / 86_400_000)
  const hours = Math.floor((left % 86_400_000) / 3_600_000)
  const minutes = Math.floor((left % 3_600_000) / 60_000)
  const parts = [
    days > 0 ? `${days} วัน` : '',
    days > 0 || hours > 0 ? `${hours} ชั่วโมง` : '',
    `${minutes} นาที`,
  ].filter(Boolean)
  return { text: `คงเหลือ ${parts.join(' ')}`, expired: false }
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
  // null = ทุกเพจ; ตัวกรองอยู่ที่ server เหมือนแท็บข้อความ ไม่ใช่กรองเฉพาะที่โหลดมาแล้ว
  const [channelId, setChannelId] = useState<string | null>(null)
  /**
   * แท็บช่องทาง — ชุดเดียวกับแท็บข้อความ (user สั่ง 2026-08-04: "filter การ์ดด้านบน ควรมีทั้งหมด,
   * facebook, ig, deep(in-app) ไม่ใช่เป็นชื่อเพจ") เพจย้ายเข้าไปอยู่ในปุ่ม "ตัวกรอง" แล้ว
   * ค่าและลำดับตรงกับ CHANNEL_TABS ของ InboxList.tsx เป๊ะ ๆ — สองแท็บนี้ต้องกดแล้วรู้สึกเหมือนกัน
   *
   * DEEP/INSTAGRAM ยังไม่มีคอมเมนต์ไหลเข้า (00029 รับเฉพาะ feed ของเพจ Facebook) — pill ยังโชว์
   * เพื่อให้หน้าตาสองแท็บตรงกัน และกดแล้วได้ empty state ที่บอกตรง ๆ ว่าไม่มีในช่องทางนี้
   */
  const [channelTab, setChannelTab] = useState<'ALL' | 'DEEP' | 'MESSENGER' | 'INSTAGRAM'>('ALL')
  const [filterOpen, setFilterOpen] = useState(false)
  // เริ่มที่ null เสมอ — มือถือต้องเห็น "รายการ" ก่อน ไม่ใช่ถูกโยนเข้าโพสต์ใดโพสต์หนึ่ง
  // (critique P0) เดสก์ท็อปมี 2 คอลัมน์อยู่แล้ว จึง auto-select ให้เฉพาะ ≥1024px
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thread, setThread] = useState<ThreadData | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  // แนบรูปในคำตอบ (user สั่ง 2026-08-03) — เอกสาร Meta: comment รับ `attachment_url` ได้
  // ใช้ท่าเดียวกับแชท: อัปขึ้น storage ของเราก่อน แล้ว server ค่อยทำ presigned URL ให้ Meta ดึง
  const [pendingFile, setPendingFile] = useState<{ fileId: string; previewUrl: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  // โหลดเพิ่ม: รายการตันที่ 25 โพสต์เงียบ ๆ มาก่อน (critique P1) — ตอนนี้มีปุ่มและรู้ว่ายังมีอีก
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialPosts.length >= 25)
  // ในเธรด: ดูเฉพาะคอมเมนต์ที่ยังไม่มีคำตอบของเพจ
  const [unansweredOnly, setUnansweredOnly] = useState(false)
  // แท็บสถานะของรายการโพสต์ (ให้เหมือนแท็บข้อความ: ทั้งหมด / ยังไม่ตอบ / ตอบครบแล้ว)
  const [postTab, setPostTab] = useState<'ALL' | 'UNANSWERED' | 'DONE'>('ALL')
  const [emojiOpen, setEmojiOpen] = useState(false)
  // เล่นวิดีโอในหน้าเรา (user สั่ง 2026-08-03 "ไม่อยากให้กดออกไปใน facebook") — โหลด iframe ของ
  // Facebook video plugin เมื่อ "กดเล่น" เท่านั้น ไม่โหลดล่วงหน้าทุกโพสต์ (iframe ของ Meta หนัก
  // และตามผู้ใช้ด้วย cookie — โหลดเมื่อผู้ใช้สั่งเท่านั้นคือพฤติกรรมที่ถูกต้อง)
  const [playing, setPlaying] = useState(false)
  /**
   * ปลั๊กอินวิดีโอของ Facebook เรนเดอร์ player ตาม **ค่า width ที่ส่งไปใน URL** ไม่ใช่ตามขนาด
   * iframe — ส่ง width คงที่แล้ววาง iframe กว้างกว่า/แคบกว่า จะได้ภาพล้นกรอบ (user report
   * 2026-08-03 "ตอนเล่น video มันแสดงล้นเกิน iframe")
   * จึงต้องวัดความกว้างจริงของกล่องแล้วส่งตัวเลขนั้นเข้า URL + ล็อกสัดส่วนกล่องด้วยอัตราส่วนของ
   * รูปปก (โพสต์วิดีโอแนวตั้ง 9:16 กับแนวนอน 16:9 ต้องได้กรอบคนละทรง)
   */
  const playerBoxRef = useRef<HTMLDivElement>(null)
  const [playerWidth, setPlayerWidth] = useState(0)
  const [posterRatio, setPosterRatio] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replyBoxRef = useRef<HTMLTextAreaElement>(null)
  /**
   * "การเลือกโพสต์รอบนี้มาจากการที่ผู้ใช้กดแถวเอง" (user สั่ง 2026-08-04)
   *
   * ต้องเป็น ref ไม่ใช่ state และต้องแยกจาก selectedId เพราะ selectedId ถูกตั้งจาก 3 ทาง:
   * ผู้ใช้กดแถว / auto-select โพสต์แรกบนเดสก์ท็อป / โหลดเธรดซ้ำรอบ poll — มีแต่ทางแรกที่ควร
   * ไปยึดโฟกัสช่องพิมพ์ อีกสองทางถ้าโฟกัสด้วยจะเด้งคีย์บอร์ดขึ้นมาเองตอนเพิ่งเปิดหน้า
   */
  const focusReplyOnLoad = useRef(false)

  const refreshPosts = useCallback(async (ch: string | null) => {
    try {
      const params = new URLSearchParams()
      if (ch) params.set('channelId', ch)
      const qs = params.toString()
      const res = await fetch(`/api/chat/comments/posts${qs ? `?${qs}` : ''}`)
      if (!res.ok) return
      const data = (await res.json()) as { items: CommentPostItem[] }
      setPosts(data.items)
      setHasMore(data.items.length >= 25)
    } catch {
      // โหลดไม่สำเร็จ = คงรายการเดิมไว้ ไม่ต้องรบกวนผู้ใช้
    }
  }, [])

  // เปลี่ยนเพจที่กรอง → ดึงรายการใหม่จาก server (กรองที่ฐาน ไม่ใช่กรองเฉพาะที่โหลดมาแล้ว)
  //
  // ช่องค้นหาถูกถอดออก 2026-08-04 ตามที่ user สั่ง ("ไม่ต้อง search") — แท็บข้อความมีช่องค้นหา
  // เพราะเธรดสะสมเป็นพันและชื่อลูกค้าคือกุญแจ ส่วนที่นี่หน่วยของรายการคือ "โพสต์" ซึ่งมีไม่มากและ
  // เรียงตามคอมเมนต์ล่าสุดอยู่แล้ว. debounce 350ms ที่มีไว้รอพิมพ์จึงไม่ต้องมีด้วย
  useEffect(() => {
    void refreshPosts(channelId)
  }, [channelId, refreshPosts])

  async function loadMorePosts() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ skip: String(posts.length) })
      if (channelId) params.set('channelId', channelId)
      const res = await fetch(`/api/chat/comments/posts?${params.toString()}`)
      if (!res.ok) return
      const data = (await res.json()) as { items: CommentPostItem[] }
      // กันซ้ำด้วย id — poll/realtime อาจแทรกโพสต์ใหม่เข้ามาระหว่างที่กำลังโหลดหน้าถัดไป
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...data.items.filter((p) => !seen.has(p.id))]
      })
      setHasMore(data.items.length >= 25)
    } finally {
      setLoadingMore(false)
    }
  }

  const loadThread = useCallback(async (postId: string, opts?: { silent?: boolean }) => {
    // silent = รอบ poll: ห้ามโชว์ spinner, ห้ามล้างคอมเมนต์ที่กำลังจะตอบ, ห้าม toast รบกวน
    if (!opts?.silent) {
      setLoadingThread(true)
      setReplyTo(null)
      // ล้างของโพสต์ก่อนหน้าทิ้ง (user สั่ง 2026-08-03 "ตอนกดเปลี่ยน comment ให้ขึ้น skeleton")
      // ไม่ล้าง = ค้างคอมเมนต์ของโพสต์เดิมค้างจอจนโหลดเสร็จ ซึ่งอ่านเหมือนโพสต์ใหม่มีคอมเมนต์นั้นจริง
      setThread(null)
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

  // วัดความกว้างกล่องวิดีโอทุกครั้งที่ layout เปลี่ยน แล้วส่งเข้า URL ของปลั๊กอิน
  useEffect(() => {
    const el = playerBoxRef.current
    if (!el || !playing) return
    const measure = () => setPlayerWidth(Math.round(el.getBoundingClientRect().width))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [playing])

  useEffect(() => {
    setPlaying(false) // เปลี่ยนโพสต์ = เลิกเล่นของเดิม
    setPosterRatio(null)
    if (selectedId) void loadThread(selectedId)
  }, [selectedId, loadThread])

  /**
   * กดแถวในรายการ → พอเธรดโหลดเสร็จ ให้จ่อตอบคอมเมนต์นั้นเลย (user สั่ง 2026-08-04)
   *
   * เดิมกดแถวแล้วได้แค่ "เห็น" คอมเมนต์ ต้องไปกดปุ่ม ตอบ อีกทีถึงจะพิมพ์ได้ ทั้งที่เหตุผลเดียว
   * ที่คนกดแถวคือจะตอบ — Business Suite เปิดมาพร้อมช่อง "Reply as <เพจ>" จ่อไว้ให้แล้ว
   *
   * เลือกเป้าหมายเป็น "คอมเมนต์ของลูกค้าที่ใหม่สุดและยังไม่มีคำตอบของเพจ" ไม่ใช่คอมเมนต์ล่าสุด
   * เฉย ๆ — ล่าสุดอาจเป็นคำตอบของเพจเอง ซึ่งจ่อตอบตัวเองไม่มีความหมาย. ถ้าตอบครบหมดแล้วค่อย
   * ตกไปใช้คอมเมนต์ลูกค้าที่ใหม่สุดแทน (ยังตอบเสริมได้) ไม่มีเลยก็ไม่ต้องจ่ออะไร
   */
  useEffect(() => {
    if (!focusReplyOnLoad.current || !thread) return
    focusReplyOnLoad.current = false
    const list = thread.comments
    const byNewest = list
      .filter((c) => !c.isFromPage && !c.isDeleted)
      .sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime())
    const target =
      byNewest.find(
        (c) => !list.some((r) => r.isFromPage && r.parentExternalId === c.externalCommentId),
      ) ?? byNewest[0]
    if (!target) return
    setReplyTo(target)
    document
      .querySelector(`[data-comment-id="${target.id}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [thread])

  /**
   * โฟกัสช่องพิมพ์ทุกครั้งที่ "กำลังจะตอบใคร" เปลี่ยน
   *
   * ต้องแยกเป็น effect ของ replyTo ไม่ใช่เรียก focus() ต่อท้าย setReplyTo ด้านบน — ตอนนั้น
   * ช่องพิมพ์ inline ยังไม่ถูก mount (setState ยังไม่ทันเรนเดอร์) ref จึงยังชี้ช่องล่างที่กำลังจะ
   * ถูกถอดออก โฟกัสจะหายไปพร้อมกับมัน. ผลพลอยได้: กดปุ่ม "ตอบ" เองก็ได้เคอร์เซอร์ทันทีเหมือนกัน
   */
  useEffect(() => {
    if (replyTo) replyBoxRef.current?.focus()
  }, [replyTo])

  // เดสก์ท็อปเลือกโพสต์แรกให้ (คอลัมน์ขวาว่างเปล่าดูเหมือนหน้าพัง) — มือถือปล่อยให้เห็นรายการ
  useEffect(() => {
    if (selectedId || posts.length === 0) return
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      setSelectedId(posts[0].id)
    }
  }, [posts, selectedId])

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
    void refreshPosts(channelId)
    if (selectedId) void loadThread(selectedId, { silent: true })
  }, [channelId, selectedId, refreshPosts, loadThread])

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

  /**
   * เดินนาฬิกาให้ป้าย "คงเหลือ X วัน Y ชั่วโมง Z นาที" ทุก 1 นาที
   *
   * พึ่ง re-render จาก refreshAll ไม่ได้ ถึงจะบังเอิญ 60 วิเท่ากัน — refreshAll จะไม่ setState
   * เลยถ้า fetch ล้ม/ออฟไลน์ แล้วตัวเลขจะค้างอยู่อย่างนั้นโดยดูน่าเชื่อถือ ซึ่งอันตรายกว่าไม่โชว์
   * (นี่คือตัวเลขที่ผู้ขายใช้ตัดสินใจว่ายังทักลูกค้าทันไหม)
   */
  const [, setMinuteTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setMinuteTick((n) => n + 1)
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

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
      // ใหม่สุดอยู่บน (user สั่ง 2026-08-04 "ให้ขึ้น Newest เสมอ เหมือน Business Suite") — service
      // ส่งมาเก่า→ใหม่ ซึ่งแปลว่าคอมเมนต์ที่เพิ่งเข้ามา (ตัวที่ต้องรีบตอบ) ไปจมอยู่ล่างสุดของโพสต์
      // ที่มีคอมเมนต์เป็นร้อย. เรียงเฉพาะ "คอมเมนต์ระดับบน" เท่านั้น — คำตอบใต้แต่ละอันยังเก่า→ใหม่
      // ตามเดิม เพราะข้างในนั้นคือบทสนทนา อ่านกลับหัวไม่รู้เรื่อง (Business Suite ก็ทำแบบนี้)
      .sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime())
      .map((c) => {
        const replies = children.get(c.externalCommentId) ?? []
        const answeredSelf = c.isFromPage || replies.some((r) => r.isFromPage)
        // ลูกค้าที่มาตอบใต้คอมเมนต์อื่นก็ยังเป็น "คำถามที่รอคำตอบ" — ฝั่งรายการนับรวมมาตลอด
        // ถ้าตรงนี้นับเฉพาะคอมเมนต์ระดับบน ตัวเลข 2 ที่จะไม่ตรงกัน (user report 2026-08-03:
        // "ซ้ายบอก 8 แต่ใน panel บอก 7") — ใช้นิยามเดียวกันทั้งคู่: คอมเมนต์ของลูกค้าที่ยังไม่มี
        // คำตอบของเพจอยู่ข้างใต้ ไม่ว่าอยู่ชั้นไหน
        const unansweredReplies = replies.filter(
          (r) => !r.isFromPage && !r.isDeleted && !list.some((x) => x.isFromPage && x.parentExternalId === r.externalCommentId),
        ).length
        const unansweredHere = (!c.isFromPage && !c.isDeleted && !answeredSelf ? 1 : 0) + unansweredReplies
        return { comment: c, replies, answered: unansweredHere === 0, unansweredHere }
      })
  }, [thread])

  const visibleTree = useMemo(
    () => (unansweredOnly ? tree.filter((t) => !t.answered) : tree),
    [tree, unansweredOnly],
  )

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
    if ((!replyText.trim() && !pendingFile) || sending || !selectedId) return
    setSending(true)
    try {
      // ไม่ได้เลือกคอมเมนต์ = คอมเมนต์ "โพสต์" (แถบล่างแบบ Comment as <เพจ> ของ Business Suite)
      // เลือกไว้ = ตอบคอมเมนต์นั้น — คนละ endpoint คนละความหมาย
      const url = replyTo
        ? `/api/chat/comments/${replyTo.id}/reply`
        : `/api/chat/comments/posts/${selectedId}/comment`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: replyText.trim(), fileId: pendingFile?.fileId ?? null }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        pacesToast.error(body?.error ?? (replyTo ? 'ตอบความคิดเห็นไม่สำเร็จ' : 'คอมเมนต์ไม่สำเร็จ'))
        return
      }
      setReplyText('')
      setPendingFile(null)
      pacesToast.success(replyTo ? 'ตอบความคิดเห็นแล้ว' : 'คอมเมนต์แล้ว')
      setReplyTo(null)
      if (selectedId) await loadThread(selectedId)
    } catch {
      pacesToast.error('ตอบความคิดเห็นไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
    } finally {
      setSending(false)
    }
  }

  // แท็บช่องทางกรองฝั่ง client ตั้งใจ: provider ติดมากับโพสต์ทุกแถวแล้ว (p.channel.provider)
  // ไม่ต้องยิง server ใหม่ — ต่างจากตัวกรอง "เพจ" ที่กรองที่ฐานเพราะต้องแบ่งหน้าให้ถูก
  const postsByChannel = useMemo(
    () => (channelTab === 'ALL' ? posts : posts.filter((p) => p.channel.provider === channelTab)),
    [posts, channelTab],
  )
  /**
   * จำนวนโพสต์ที่ยังมีคอมเมนต์ค้าง — ตัวเลขบนแท็บต้องมาจากชุดเดียวกับรายการที่เรนเดอร์อยู่
   * (เดิมนับจาก `posts` ทั้งร้าน: กรองเป็น Instagram แล้วแท็บยังขึ้นเลขของ Facebook)
   */
  const unansweredPostCount = useMemo(
    () => postsByChannel.filter((p) => p.unansweredCount > 0).length,
    [postsByChannel],
  )
  const visiblePosts = useMemo(() => {
    if (postTab === 'UNANSWERED') return postsByChannel.filter((p) => p.unansweredCount > 0)
    if (postTab === 'DONE') return postsByChannel.filter((p) => p.unansweredCount === 0)
    return postsByChannel
  }, [postsByChannel, postTab])

  const selectedPost = posts.find((p) => p.id === selectedId) ?? null

  /**
   * ช่องพิมพ์ตัวเดียว เรนเดอร์ได้ 2 ที่ (user สั่ง 2026-08-04 พร้อมภาพ Business Suite)
   *
   *   inline=true  → แทรกใต้คอมเมนต์ที่กำลังตอบ (`Reply as <เพจ>` จ่อรอให้พิมพ์ทันที)
   *   inline=false → แถบล่างสุดของแผง สำหรับ "คอมเมนต์ที่โพสต์" ตอนยังไม่ได้เลือกจะตอบใคร
   *
   * ทำไมไม่เขียนสองชุด: ช่องนี้มีทั้งอัปโหลดรูป/อิโมจิ/สถานะ sending/คำเตือน PII — ก๊อปไปวางอีกที่
   * แปลว่าแก้บั๊กต้องแก้ 2 รอบตลอดไป และของสองอันจะเพี้ยนจากกันเมื่อไหร่ก็ได้ (บทเรียนเดียวกับที่
   * ทำให้ "ยังไม่ตอบ" เคยโชว์ 7 กับ 8 พร้อมกันบนจอเดียว — ตัวเลข/ของชิ้นเดียวกันต้องมาจากที่เดียว)
   */
  const renderComposer = (inline: boolean) => (
    <div className={inline ? '' : 'w-full p-3'}>
      {replyTo && !inline && (
        <div className="text-default-700 mb-2 flex items-center gap-2 text-xs">
          <Icon icon="corner-down-right" />
          <span className="min-w-0 flex-1 truncate">
            ตอบ {replyTo.fromName ?? 'ความคิดเห็น'}: {replyTo.message ?? '(ไม่มีข้อความ)'}
          </span>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            aria-label="ยกเลิกการตอบ"
            className="hover:bg-default-100 flex size-11 shrink-0 items-center justify-center rounded-lg"
          >
            <Icon icon="x" />
          </button>
        </div>
      )}
      {/* BR-23: เตือนถาวร ไม่ใช่ toast ที่หายไป — คอมเมนต์เป็นข้อความสาธารณะ
          critique P0: ของเดิม text-warning บนขาว = 1.66:1 อ่านไม่ออกจริงบนมือถือกลางแดด ทั้งที่นี่
          คือกลไกเดียวที่กัน PII หลุดสู่สาธารณะ — ใช้ token *-ink บนพื้น /15 (6.57:1) ตามกติกา
          contrast-fix-keeps-hue: เปลี่ยนความเข้ม ไม่เปลี่ยนเฉด
          ยังต้องมีในโหมด inline ด้วย: โหมดนี้กลายเป็นทางหลักที่คนพิมพ์คำตอบแล้ว ถอดออกเท่ากับ
          ถอด guard ออกจากเส้นทางที่ใช้จริงที่สุด */}
      <p className="bg-warning/15 text-warning-ink mb-2 flex items-start gap-1.5 rounded-lg px-3 py-2 text-sm">
        <Icon icon="alert-triangle" className="mt-0.5 shrink-0" />
        ทุกคนที่เห็นโพสต์นี้จะเห็นข้อความที่คุณเขียน — อย่าพิมพ์ที่อยู่หรือเบอร์ของลูกค้า
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
        {/* รูปเพจหน้าช่องพิมพ์เฉพาะโหมด inline — ตอบตรงนั้นต้องเห็นว่ากำลังพูดในนามใคร
            (ภาพ ref: avatar เพจ + "Reply as <เพจ>") ส่วนแถบล่างมีข้อความบอกในตัวอยู่แล้ว */}
        {inline && thread?.channel.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thread.channel.avatarUrl}
            alt=""
            className="size-8 shrink-0 rounded-full object-cover"
          />
        )}
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
          <Icon icon={uploading ? 'loader-2' : 'photo'} className={`text-xl ${uploading ? 'animate-spin' : ''}`} />
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
          ref={replyBoxRef}
          rows={inline ? 1 : 2}
          aria-label={replyTo ? 'พิมพ์คำตอบสาธารณะ' : 'เขียนความคิดเห็นในนามเพจ'}
          className="form-textarea grow"
          placeholder={
            replyTo
              ? `ตอบในนาม ${thread?.channel.name ?? 'เพจ'}...`
              : `แสดงความคิดเห็นในนาม ${thread?.channel.name ?? 'เพจ'}...`
          }
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          disabled={sending}
        />
        <button
          type="button"
          onClick={submitReply}
          disabled={sending || (!replyText.trim() && !pendingFile)}
          className="btn bg-primary hover:bg-primary-hover min-h-11 shrink-0 text-white disabled:opacity-60"
        >
          {replyTo ? 'ตอบ' : 'คอมเมนต์'} <Icon icon="send-2" className="ms-1 text-xl" />
        </button>
      </div>
      {inline && (
        // ทางออกกลับไปโหมด "คอมเมนต์ที่โพสต์" — ไม่มีปุ่มนี้แล้วจะติดอยู่ในโหมดตอบจนกว่าจะส่ง
        <button
          type="button"
          onClick={() => setReplyTo(null)}
          className="text-default-700 mt-1 text-xs font-medium hover:underline"
        >
          ยกเลิกการตอบ
        </button>
      )}
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── รายการโพสต์ ─────────────────────────────────────────── */}
      <div
        className={`border-default-200 flex min-w-0 flex-col border-e lg:flex lg:w-96 lg:shrink-0 ${
          selectedId ? 'hidden' : 'flex flex-1'
        }`}
      >
        {/* ตัวกรองเพจ — pill group ชุดเดียวกับ "ตัวกรองช่องทาง" ของแท็บข้อความ
            (Base: InboxList.tsx:778 — bg-light + rounded-lg p-1, ตัวที่เลือก bg-card shadow-sm)
            user สั่ง 2026-08-03: "ตรงตัวกรองและสถานะทำไมไม่ทำเหมือนตรงข้อความ" */}
        {/* แถวหัว = segmented ช่องทาง + ปุ่มตัวกรอง เรียงแบบเดียวกับแท็บข้อความทุกจุด
            (Base: InboxList.tsx:777-828 — relative flex flex-wrap gap-1.5 ครอบ, segmented
            bg-light rounded-lg p-1, ตัวที่เลือก bg-card shadow-sm, ปุ่มตัวกรองเป็น btn เส้นขอบ)
            user สั่ง 2026-08-04: pill ต้องเป็น "ช่องทาง" ไม่ใช่ชื่อเพจ — เพจย้ายเข้าปุ่ม "ตัวกรอง"
            `relative` ที่แถวนี้คือจุดอ้างอิงของ popover ตัวกรอง (inset-x-0 = กว้างเท่าแถว ไม่ล้นจอ) */}
        {/* กล่องหัวเดียวสำหรับทั้ง segmented ช่องทาง + ปุ่มตัวกรอง + แถวแท็บ
            (Base: InboxList.tsx:754 `card-header sticky top-0 z-10 flex flex-col items-stretch
            gap-3 border-dashed bg-card`)
            รอบแรกผมแยกเป็น 2 กล่องคนละ padding (p-2 / px-3) → แท็บเยื้องกับ pill และระยะห่าง
            ระหว่างแถวไม่เท่าฝั่งข้อความ (user report 2026-08-04 "tab ก็ยังไม่เห็นเหมือน")
            ความ "เหมือน" ของสองหน้านี้อยู่ที่กล่องหัว ไม่ใช่แค่ตัวปุ่มแต่ละอัน */}
        <div className="card-header sticky top-0 z-10 flex flex-col items-stretch gap-3 border-dashed bg-card">
          <div className="relative flex flex-wrap items-center gap-1.5">
            <div className="bg-light flex w-full items-center gap-0.5 rounded-lg p-1" role="tablist" aria-label="ตัวกรองช่องทาง">
              {(['ALL', 'DEEP', 'MESSENGER', 'INSTAGRAM'] as const).map((tab) => {
                const active = channelTab === tab
                const display = tab === 'ALL' ? null : getChannelDisplay(tab)
                const label = tab === 'ALL' ? 'ทั้งหมด' : display!.label
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    title={label}
                    aria-label={tab === 'ALL' ? 'ทั้งหมด' : `กรองเฉพาะช่องทาง ${label}`}
                    onClick={() => setChannelTab(tab)}
                    className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-nowrap ${
                      active ? 'bg-card text-dark font-semibold shadow-sm' : 'text-default-600'
                    }`}
                  >
                    {display && (
                      <Icon
                        icon={display.icon}
                        width={16}
                        height={16}
                        className={display.iconClassName}
                        style={display.iconStyle}
                      />
                    )}
                    {tab === 'ALL' && label}
                  </button>
                )
              })}
            </div>
            {/* ปุ่มตัวกรอง — โผล่เสมอเหมือนแท็บข้อความ
                รอบแรกผมใส่เงื่อนไข `channels.length > 1` เพราะ user เขียนว่า "ในกรณีมีหลายเพจ"
                แล้ว user รายงานทันทีว่า "ไม่เห็นมี button ตัวกรองเลย" (ร้านเชื่อมเพจเดียว) —
                เจตนาคือ "ต้องมีปุ่มตัวกรองเหมือนฝั่งข้อความ" ไม่ใช่ "ซ่อนเมื่อเพจเดียว":
                ปุ่มที่หาย ๆ โผล่ ๆ ตามจำนวนเพจทำให้หน้าสองแท็บไม่เหมือนกันอยู่ดี */}
            <CommentsFilterPanel
              pageOptions={channels}
              value={channelId}
              onApply={setChannelId}
              open={filterOpen}
              onOpenChange={setFilterOpen}
            />
            {/* ชิปบอกว่ากำลังกรองเพจไหนอยู่ + กดกากบาทล้างได้ (Base: active-filter chips ของ
                InboxList.tsx:867-882) — ปุ่มตัวกรองไม่ได้โชว์ชื่อเพจบนหน้าปุ่ม ชิปจึงจำเป็น */}
            {channelId && (
              <span className="badge bg-primary/15 text-primary text-2xs inline-flex items-center gap-1">
                {channels.find((c) => c.id === channelId)?.name ?? 'เพจที่เลือก'}
                <button
                  type="button"
                  onClick={() => setChannelId(null)}
                  aria-label="ล้างตัวกรองเพจ"
                  className="inline-flex items-center"
                >
                  <Icon icon="x" width={12} height={12} />
                </button>
              </span>
            )}
          </div>

        {/* แท็บสถานะ — โครงเดียวกับแถว "ทั้งหมด · ปิดงาน · สแปม" ของแท็บข้อความ
            (Base: InboxList.tsx:890-927 — flex flex-wrap gap-1.5 ครอบ, แถบ min-w-0 flex-1 gap-3
            border-b, ปุ่ม -mb-px border-b-2 px-0 py-1.5)
            **ความหมาย**ของแท็บยังเป็นของหน้านี้เอง (ทั้งหมด/ยังไม่ตอบ/ตอบครบแล้ว) — user สั่งชัด
            2026-08-04 ว่า "ไม่ได้ให้ลอก tab มา ผมให้ copy style" คือยกหน้าตา ไม่ใช่ยกความหมายของ
            ปิดงาน/สแปม ซึ่งฝั่งคอมเมนต์ไม่มีคอลัมน์รองรับอยู่แล้ว */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="border-default-200 flex min-w-0 flex-1 items-center gap-3 border-b" role="tablist" aria-label="สถานะการตอบ">
          {([
            { key: 'ALL', label: 'ทั้งหมด', icon: null },
            { key: 'UNANSWERED', label: 'ยังไม่ตอบ', icon: 'alert-circle' },
            { key: 'DONE', label: 'ตอบครบแล้ว', icon: 'circle-check' },
          ] as const).map((t) => {
            const on = postTab === t.key
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPostTab(t.key)}
                className={`-mb-px flex shrink-0 items-center gap-1 border-b-2 px-0 py-1.5 text-sm text-nowrap ${
                  on ? 'border-primary text-primary font-semibold' : 'text-default-600 border-transparent font-medium'
                }`}
              >
                {t.icon && <Icon icon={t.icon} width={14} height={14} className="shrink-0" />}
                {t.label}
                {/* ตัวนับมาจาก postsByChannel ชุดเดียวกับรายการด้านล่าง (symbol เดียว) และตัดที่ 99+
                    เหมือน badge ยังไม่อ่านของแท็บข้อความ */}
                {t.key === 'UNANSWERED' && unansweredPostCount > 0 && (
                  <span className="bg-danger text-2xs flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-semibold text-white">
                    {unansweredPostCount > 99 ? '99+' : unansweredPostCount}
                  </span>
                )}
              </button>
            )
          })}
          </div>
        </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {visiblePosts.length === 0 ? (
            <div className="p-4">
              {/* แยกกรณี "กรองแล้วไม่เจอ" ออกจาก "ยังไม่มีเลย" — ของเดิมบอกว่าไม่มีความคิดเห็น
                  ทั้งที่กรองอยู่ ทำให้เข้าใจผิดว่าระบบพัง (critique P1)
                  ต้องครอบแท็บช่องทางด้วย: กด IG/Deep ที่ยังไม่มีคอมเมนต์ไหลเข้าเลย ต้องได้คำอธิบาย
                  ว่าไม่มี "ตามตัวกรอง" ไม่ใช่ "ยังไม่มีความคิดเห็น" ลอย ๆ ซึ่งอ่านเหมือนระบบพัง */}
              {channelId || channelTab !== 'ALL' ? (
                <SellerEmptyState
                  compact
                  icon="search-off"
                  title="ไม่พบความคิดเห็นตามตัวกรอง"
                  description="ลองเปลี่ยนช่องทาง/เพจ หรือล้างตัวกรองเพื่อดูทั้งหมด"
                />
              ) : (
                <SellerEmptyState
                  compact
                  icon="message-circle"
                  title="ยังไม่มีความคิดเห็น"
                  description="เมื่อมีคนคอมเมนต์ใต้โพสต์ของเพจ จะแสดงที่นี่"
                />
              )}
              {(channelId || channelTab !== 'ALL') && (
                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setChannelTab('ALL')
                      setChannelId(null)
                    }}
                    className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11"
                  >
                    ล้างตัวกรอง
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="divide-default-200 divide-y">
              {visiblePosts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    // ธงนี้ทำให้ effect หลังเธรดโหลดเสร็จรู้ว่าควรจ่อตอบให้ (ดู focusReplyOnLoad)
                    focusReplyOnLoad.current = true
                    setSelectedId(p.id)
                  }}
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
                  {/* ขนาดตัวอักษรของแถวยกมาจากแถวแชทตรง ๆ (Base: InboxList.tsx:1199-1256) —
                      บรรทัดหัว text-xs semibold / preview text-2xs / เวลา text-2xs
                      ก่อนหน้านี้ทั้งสามอย่างใหญ่ขึ้นหนึ่งสเต็ป ทำให้แถวสูงกว่าและ "ดูเป็นอีกหน้า"
                      แม้โครงจะเหมือนกัน (user report 2026-08-04 "chatlist + comment lists
                      แสดงผลไม่เหมือนกัน") */}
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <span className="text-default-900 line-clamp-2 text-xs font-semibold">
                      {p.message?.trim() || 'โพสต์ไม่มีข้อความ'}
                    </span>
                    {/* บรรทัดที่ 2 = "ลูกค้าถามอะไร" ไม่ใช่ตัวเลขที่ตัดสินใจอะไรไม่ได้ (critique P1)
                        แบบเดียวกับ preview ข้อความล่าสุดในแท็บข้อความ */}
                    <span className="text-default-700 mt-0.5 block truncate text-2xs">
                      {p.lastCommentText
                        ? `${p.lastCommenterName ?? 'ผู้ใช้ Facebook'}: ${p.lastCommentText}`
                        : `${p.commentCount} ความคิดเห็น`}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.25">
                    {/* เวลาแบบสัมพัทธ์ (เมื่อกี้ / 3 ชม. / 2 วัน) — HH:MM เดิมทำให้เมื่อวานกับ
                        เมื่อครู่หน้าตาเหมือนกัน (critique P1) ตัวเดียวกับที่แท็บข้อความใช้ */}
                    <span className="text-default-700 text-2xs">
                      {p.lastCommentAt ? formatChatListTime(p.lastCommentAt) : ''}
                    </span>
                    {/* วงกลมตัวเลขล้วน ไม่ใช่ป้าย "ยังไม่ตอบ N" (user สั่ง 2026-08-04 "ให้เหลือแค่ 3
                        แบบเดียวกับ chat list") — ตำแหน่งใต้เวลาและหน้าตาตรงกับ badge ที่ยังไม่อ่าน
                        ในแท็บข้อความเป๊ะ ๆ (InboxList.tsx) คนอ่านสองแท็บนี้สลับกันทั้งวัน ป้ายคนละ
                        แบบทำให้ต้องแปลความใหม่ทุกครั้งที่สลับ */}
                    {p.unansweredCount > 0 && (
                      <span
                        className="bg-danger flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-2xs font-semibold text-white"
                        aria-label={`ยังไม่ตอบ ${p.unansweredCount}`}
                      >
                        {p.unansweredCount > 99 ? '99+' : p.unansweredCount}
                      </span>
                    )}
                  </span>
                </button>
              ))}
              {hasMore && (
                <div className="p-3">
                  <button
                    type="button"
                    onClick={() => void loadMorePosts()}
                    disabled={loadingMore}
                    className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 w-full disabled:opacity-60"
                  >
                    {loadingMore ? 'กำลังโหลด...' : 'โหลดโพสต์เก่ากว่านี้'}
                  </button>
                </div>
              )}
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
            {/* 2 คอลัมน์ 50/50 (user สั่ง 2026-08-03: "ทำเป็น 2 ฝั่ง ซ้ายขวา 50% ซ้ายแสดงวิดีโอ
                posts ฝั่งขวาเป็น comment scroll ได้") — รอบก่อนวางเรียงบนล่างในคอลัมน์กลาง
                ทำให้โพสต์+วิดีโอกินจอจนคอมเมนต์ตกไปใต้ fold มองไม่เห็นเลย
                มือถือ (<lg) ยังเรียงบนล่างเหมือนเดิม เพราะแบ่งครึ่งบนจอ 390px ได้ 2 คอลัมน์ที่แคบ
                จนอ่านไม่ออกทั้งคู่ — วิดีโอจึงถูกจำกัดความสูงบนมือถือแทน (max-h-72) */}
            {/* แถบหัวเต็มความกว้าง (user สั่ง 2026-08-03 พร้อมภาพ Business Suite):
                [รูปย่อ] ชื่อโพสต์ตัวหนาบรรทัดเดียว / ยอด · จำนวนคอมเมนต์ · วันที่โพสต์   [ปุ่ม]
                ปุ่มฝั่งขวาใส่เฉพาะที่เราทำได้จริง — Boost/รายงาน/ติดดาว ของ Business Suite เป็น
                เครื่องมือฝั่ง Meta ที่เราไม่มี API ทำ ใส่ไปก็เป็นปุ่มหลอก */}
            <div className="border-default-200 flex shrink-0 items-center gap-3 border-b px-3 py-2">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="กลับไปรายการโพสต์"
                className="hover:bg-default-100 text-default-700 flex size-11 shrink-0 items-center justify-center rounded-lg lg:hidden"
              >
                <Icon icon="arrow-left" className="text-lg" />
              </button>
              {selectedPost.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedPost.thumbnailUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-default-800 mb-0 truncate text-sm font-semibold">
                  {selectedPost.message?.trim() || 'โพสต์ไม่มีข้อความ'}
                </p>
                <p className="text-default-700 mb-0 truncate text-xs">
                  {selectedPost.reactionCount ?? '–'} รีแอ็กชัน ·{' '}
                  {thread?.post.fbCommentCount ?? selectedPost.commentCount} ความคิดเห็น
                  {selectedPost.shareCount != null && ` · แชร์ ${selectedPost.shareCount}`}
                  {thread?.post.createdTime && ` · ${formatDateTH(thread.post.createdTime)}`}
                </p>
              </div>
              {selectedPost.unansweredCount > 0 && (
                <span className="bg-danger/15 text-danger-ink text-2xs shrink-0 rounded-full px-2 py-0.5 font-semibold">
                  ยังไม่ตอบ {selectedPost.unansweredCount}
                </span>
              )}
              {selectedPost.permalink && (
                <a
                  href={selectedPost.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 shrink-0"
                >
                  <Icon icon="brand-facebook" className="me-1 text-base" />
                  เปิดบน Facebook
                </a>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {/* คอลัมน์ซ้าย = โพสต์เต็มความสูง (user สั่ง 2026-08-03 "อยากให้เต็มจอเลย")
                ข้อความอยู่บน สื่อกินพื้นที่ที่เหลือทั้งหมด แถวยอดชิดล่างสุดของคอลัมน์ */}
            <div className="border-default-200 flex min-h-0 shrink-0 flex-col border-b lg:h-full lg:w-1/2 lg:shrink lg:border-e lg:border-b-0">
              <div className="w-full shrink-0 overflow-y-auto p-3 lg:max-h-40">
                <p className="text-default-800 mb-0 whitespace-pre-wrap text-sm">
                  {selectedPost.message?.trim() || 'โพสต์ไม่มีข้อความ'}
                </p>
              </div>

              {/* วิดีโอเล่นในหน้าเราผ่าน Facebook video plugin (iframe สาธารณะ ไม่ต้องใช้ token
                  และไม่ต้องมีสิทธิ์อ่านไฟล์วิดีโอ ซึ่งเป็นเหตุผลที่ก่อนหน้านี้ทำได้แค่ลิงก์ออก) */}
              {playing && isVideoPost(selectedPost.mediaType) && selectedPost.permalink ? (
                <div className="bg-default-100 flex min-h-0 w-full flex-1 items-center justify-center">
                  {/* กล่องล็อกสัดส่วนตามรูปปก แล้วย่อให้พอดีกับพื้นที่ที่เหลือ (max-h-full/max-w-full)
                      — iframe จึงไม่มีวันสูง/กว้างเกินคอลัมน์ ส่วน width ที่ส่งให้ปลั๊กอินมาจากการวัด
                      กล่องจริง จึงไม่มีภาพล้นกรอบอีก */}
                  <div
                    ref={playerBoxRef}
                    style={{ aspectRatio: String(posterRatio ?? 16 / 9) }}
                    className="max-h-full w-full max-w-full"
                  >
                    {playerWidth > 0 && (
                      <iframe
                        src={`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(
                          selectedPost.permalink,
                        )}&show_text=false&autoplay=true&width=${playerWidth}`}
                        title="วิดีโอของโพสต์"
                        className="size-full border-0"
                        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    )}
                  </div>
                </div>
              ) : selectedPost.thumbnailUrl ? (
                <a
                  href={selectedPost.permalink ?? '#'}
                  target={isVideoPost(selectedPost.mediaType) && selectedPost.permalink ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    // เป็นวิดีโอและมีลิงก์ = เล่นในหน้าเรา ไม่พาออกไป
                    if (isVideoPost(selectedPost.mediaType) && selectedPost.permalink) {
                      e.preventDefault()
                      setPlaying(true)
                    }
                  }}
                  className="bg-default-100 relative block min-h-0 w-full flex-1"
                  aria-label={isVideoPost(selectedPost.mediaType) ? 'เล่นวิดีโอ' : 'เปิดโพสต์บน Facebook'}
                >
                  {/* เดสก์ท็อป: สูงเท่าที่เหลือในคอลัมน์ (h-full) — ของเดิม max-h คงที่ทำให้เหลือ
                      ที่ว่างใต้รูปเปล่า ๆ; มือถือคุมที่ 288px ไม่ให้กินจอจนคอมเมนต์หาย */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedPost.thumbnailUrl}
                    alt=""
                    onLoad={(e) => {
                      const img = e.currentTarget
                      if (img.naturalWidth && img.naturalHeight) {
                        setPosterRatio(img.naturalWidth / img.naturalHeight)
                      }
                    }}
                    className="max-h-72 w-full object-contain lg:h-full lg:max-h-none"
                  />
                  {isVideoPost(selectedPost.mediaType) && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex size-14 items-center justify-center rounded-full bg-black/55 text-white">
                        <Icon icon="player-play-filled" className="text-2xl" />
                      </span>
                    </span>
                  )}
                </a>
              ) : null}

              {/* แถวยอด ไลก์ · คอมเมนต์ · แชร์ ชิดล่างคอลัมน์ (user สั่ง 2026-08-03
                  "ตรง panel like, comment share ก็ให้มันชิดล่างไปเลย") — mt-auto ดันลงล่างสุด
                  เสมอไม่ว่ารูป/วิดีโอจะสูงแค่ไหน */}
              <div className="text-default-700 border-default-200 mt-auto flex shrink-0 flex-wrap items-center gap-4 border-t px-3 py-2 text-sm">
                <span className="flex items-center gap-1.5">
                  <Icon icon="thumb-up" className="text-base" />
                  {selectedPost.reactionCount ?? '–'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Icon icon="message-circle-2" className="text-base" />
                  {thread?.post.fbCommentCount ?? selectedPost.commentCount}
                </span>
                <span className="flex items-center gap-1.5">
                  <Icon icon="share-3" className="text-base" />
                  {selectedPost.shareCount ?? '–'}
                </span>
                {selectedPost.unansweredCount > 0 && (
                  <span className="text-danger-ink font-medium">ยังไม่ตอบ {selectedPost.unansweredCount}</span>
                )}
              </div>
            </div>

            {/* ฝั่งขวา: คอมเมนต์เลื่อนเองได้ + ช่องพิมพ์ปักอยู่ล่างคอลัมน์นี้ ไม่เลื่อนหนีไปกับโพสต์ */}
            <div className="flex min-h-0 flex-1 flex-col lg:h-full lg:w-1/2">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="w-full p-3">
                {/* ดูเฉพาะที่ยังไม่ตอบ — โพสต์ไวรัลมีคอมเมนต์เป็นร้อย ไล่หาเองไม่ไหว (critique P1) */}
                {tree.length > 0 && (
                  <div className="mb-3 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setUnansweredOnly(false)}
                      className={`min-h-9 rounded-lg px-3 text-sm ${
                        unansweredOnly ? 'text-default-700 hover:bg-default-100' : 'bg-primary text-white'
                      }`}
                    >
                      ทั้งหมด {tree.length}
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnansweredOnly(true)}
                      className={`min-h-9 rounded-lg px-3 text-sm ${
                        unansweredOnly ? 'bg-primary text-white' : 'text-default-700 hover:bg-default-100'
                      }`}
                    >
                      ยังไม่ตอบ {tree.reduce((n, t) => n + t.unansweredHere, 0)}
                    </button>
                  </div>
                )}
              {loadingThread && !thread ? (
                <SellerThreadSkeleton />
              ) : visibleTree.length === 0 ? (
                <SellerEmptyState compact icon="message-circle" title="ยังไม่มีความคิดเห็นในโพสต์นี้" />
              ) : (
                visibleTree.map(({ comment, replies, answered }) => (
                  <div key={comment.id} className="mb-5">
                    <CommentBubble
                      c={comment}
                      channel={thread?.channel}
                      answered={answered}
                      active={replyTo?.id === comment.id}
                      onReply={() => setReplyTo(comment)}
                    />
                    {replies.length > 0 && (
                      // ย่อหน้าเฉย ๆ แบบ Facebook — เส้นตั้งของเดิมทำให้อ่านเป็น "บล็อกโค้ด" มากกว่าบทสนทนา
                      <div className="ms-10 mt-2 space-y-3">
                        {replies.map((r) => (
                          <CommentBubble
                            key={r.id}
                            c={r}
                            channel={thread?.channel}
                            isReply
                            active={replyTo?.id === r.id}
                            onReply={() => setReplyTo(r)}
                          />
                        ))}
                      </div>
                    )}
                    {/* ช่องพิมพ์แทรกใต้คอมเมนต์ที่กำลังตอบ (user สั่ง 2026-08-04 พร้อมภาพ Business
                        Suite: `Reply as <เพจ>` จ่อรออยู่ใต้คอมเมนต์เลย) — ms-10 ให้ตรงคอลัมน์
                        เดียวกับตัวบับเบิล ไม่ใช่ชิดขอบซ้ายจนดูเป็นของโพสต์ทั้งอัน */}
                    {replyTo &&
                      (replyTo.id === comment.id || replies.some((r) => r.id === replyTo.id)) && (
                        <div className="ms-10 mt-2">{renderComposer(true)}</div>
                      )}
                  </div>
                ))
              )}
              </div>
            </div>

            {/* ── ช่องคอมเมนต์ที่โพสต์ (แถบล่าง) ─────────────────────────
                โผล่เฉพาะตอน "ยังไม่ได้เลือกจะตอบใคร" — พอเลือกแล้ว ช่องพิมพ์ย้ายไปแทรกใต้คอมเมนต์
                นั้นแทน (ดู renderComposer) ไม่ให้มีช่องพิมพ์ 2 ช่องบนจอเดียวกันซึ่งอ่านไม่ออกว่า
                พิมพ์ช่องไหนแล้วไปโผล่ที่ไหน */}
            {!replyTo && (
            <div className="border-default-200 border-t">
              {renderComposer(false)}
            </div>
            )}
            </div>
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
  answered = false,
  active = false,
}: {
  c: CommentItem
  channel?: { name: string; avatarUrl: string | null; provider: string }
  onReply: () => void
  isReply?: boolean
  /** มีคำตอบของเพจอยู่ข้างใต้แล้ว — ไม่งั้นผู้ขายต้องจำเองว่าตอบอันไหนไปแล้ว (critique P1) */
  answered?: boolean
  /** คอมเมนต์ที่ช่องพิมพ์กำลังจ่อตอบอยู่ (user สั่ง 2026-08-04 "ใส่สีฟ้าอ่อน ๆ พื้นหลังให้ด้วย") */
  active?: boolean
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

  const chatWindow = c.isFromPage || c.isDeleted ? null : privateReplyWindow(c.createdTime)

  return (
    <div className="flex items-start gap-2" data-comment-id={c.id}>
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
        {/* active = ตัวที่ช่องพิมพ์จ่อตอบอยู่ → พื้นฟ้าจางกว่าปกติหนึ่งขั้น (user สั่ง 2026-08-04)
            ใช้ความเข้มของ primary เดิม ไม่ใช่สลับไปเฉดอื่น (docs/conventions/contrast-fix-keeps-hue)
            บับเบิลของเพจอยู่ที่ /10 อยู่แล้ว แต่ไม่ชนกันเพราะมันมีทั้งป้าย "ผู้ดูแลเพจ" และรูปเพจกำกับ */}
        <div
          className={`inline-block max-w-2xl rounded-2xl px-3 py-2 ${
            active ? 'bg-primary/15' : c.isFromPage ? 'bg-primary/10' : 'bg-default-100'
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
            <img src={c.attachmentUrl} alt={`รูปแนบจาก ${displayName}`} className="mt-2 max-h-40 rounded-lg" />
          )}
        </div>

        {/* เวลา + ปุ่มตอบ อยู่นอกบับเบิล ตัวเล็กสีจาง — จังหวะเดียวกับ Facebook */}
        <div className="text-default-700 mt-0.5 flex items-center gap-3 ps-3 text-xs">
          <span title={formatDateTimeTH(c.createdTime)}>{formatTimeHM(c.createdTime)}</span>
          {c.editedAt && <span>แก้ไขแล้ว</span>}
          {answered && !c.isFromPage && (
            <span className="text-success-ink inline-flex items-center gap-0.5">
              <Icon icon="circle-check" className="text-sm" />
              ตอบแล้ว
            </span>
          )}
          {!c.isDeleted && (
            <button type="button" onClick={onReply} className="font-medium hover:underline">
              ตอบ
            </button>
          )}
          {/* นาฬิกาถอยหลังหน้าต่างทักแชทส่วนตัว (user สั่ง 2026-08-04 พร้อมรูปแบบที่ต้องการ:
              `ตอบ  ทักแชท [คงเหลือ 6 วัน 14 ชั่วโมง 34 นาที]` ป้ายสีแดง) — Meta ให้ทักแชทจาก
              คอมเมนต์ได้ภายใน 7 วันนับจากเวลาที่ลูกค้าคอมเมนต์ พ้นแล้วทักไม่ได้อีกเลย ผู้ขายต้อง
              เห็นตัวเลขตอนกำลังตัดสินใจ ไม่ใช่ไปรู้ตอนกดแล้วโดน Meta ปฏิเสธ

              รูปแบบตาม Business Suite ที่ user ชี้: `Like Reply Hide See Chat (6 วัน ...)` —
              **หมดเวลาแล้วหายไปทั้งอัน** ไม่ใช่ขึ้นว่า "หมดเวลา" ค้างไว้ เพราะตัวเลือกที่เลือกไม่ได้
              แล้วไม่ควรกินที่ในแถวเครื่องมือ (เหลือ ตอบ อย่างเดียวคือคำตอบที่ถูกของสถานะนั้น)

              "ทักแชท" ยังไม่ใช่ปุ่มกดได้ — การทักแชทจริงต้องใช้ Private Replies ของ Meta ซึ่งยัง
              ไม่ได้ทำฝั่ง backend จึงจงใจไม่ทำให้ดูกดได้ (ปุ่มที่กดแล้วไม่เกิดอะไรแย่กว่าไม่มีปุ่ม) */}
          {chatWindow && !chatWindow.expired && (
            <span
              className="inline-flex items-center gap-1"
              title={`ทักแชทส่วนตัวได้ภายใน 7 วันนับจากเวลาคอมเมนต์ (${formatDateTimeTH(c.createdTime)})`}
            >
              <span className="font-medium">ทักแชท</span>
              <span className="text-danger-ink font-semibold">({chatWindow.text})</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
