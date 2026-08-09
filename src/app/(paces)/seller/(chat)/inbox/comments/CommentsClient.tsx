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
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import {
  formatTimeHM,
  formatDateTimeTH,
  formatChatListTime,
  formatDateTH,
  formatDayMonthTimeTH,
  thaiDayKey,
} from '@/lib/format-date'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'
import CommentsThreadSkeleton from './CommentsThreadSkeleton'
import PrivateReplyModal from './PrivateReplyModal'
import EmojiPicker from '../[conversationId]/components/EmojiPicker'
import { subscribeShopComments } from '@/lib/comment-realtime'
import { visibleTopLevelComments } from '@/lib/comment-tree-visibility'
import ListBusyOverlay, { useListBusy } from '@/app/(paces)/seller/(dashboard)/_shared/ListBusyOverlay'
import { ChannelBadgeOverlay, getChannelDisplay } from '../components/ChannelBadge'
import CommentsFilterPanel, {
  DEFAULT_COMMENT_SHOW_FILTER,
  type CommentShowFilter,
} from './CommentsFilterPanel'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import type { CommentAnswerState, CommentPostCounts, CommentChannelFilter } from '@/services/page-comment.service'

export type ChannelOption = {
  id: string
  name: string
  provider: string
  avatarUrl: string | null
  /** feature 00037 — ร้านเจ้าของเพจ (ใช้จัดกลุ่มตัวกรองตามร้านในโหมดรวม) */
  shopId?: string
  shopName?: string
  /** feature 00038 Task 8 — prefill กล่องยืนยัน "ทักแชท" ด้วยข้อความสวิตช์ B ของเพจนี้ */
  commentPrivateReplyText?: string | null
}

export type CommentPostItem = {
  id: string
  externalPostId: string
  channel: ChannelOption
  /** feature 00037 — ร้านเจ้าของโพสต์ (badge บนการ์ดในโหมดรวมหลายร้าน) */
  shop?: { id: string; name: string }
  message: string | null
  thumbnailUrl: string | null
  permalink: string | null
  lastCommentAt: string | null
  commentCount: number
  unansweredCount: number
  /** feature 00038 — สถานะรวมของโพสต์ (ตัวที่แย่ที่สุดชนะ) ตัดสิน badge แถวนี้ (UX-Design-Spec §3.2) */
  postStatus: CommentAnswerState
  /** เวลาของคอมเมนต์ที่ยังไม่ตอบและ "เก่าที่สุด" — เส้นตายทักแชท 7 วันที่มาถึงก่อน (null = ตอบครบ) */
  oldestUnansweredAt: string | null
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
  /** feature 00038 Task 8 — มาจาก CommentReplyLog ที่ privateReplyStatus='SENT' ของ commentId นี้เอง */
  privateReplySentAt: string | null
  privateReplyConversationId: string | null
  /** feature 00038 Task 9 — ป้าย "ตอบอัตโนมัติ" บนบับเบิลของบอท */
  isAutoReply: boolean
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

/**
 * "คอมเมนต์ที่เกี่ยวข้อง" ของโพสต์ = คอมเมนต์ของลูกค้าที่ใหม่สุดและยังไม่มีคำตอบของเพจอยู่ข้างใต้
 * ตอบครบหมดแล้วตกไปใช้คอมเมนต์ลูกค้าที่ใหม่สุด (ยังตอบเสริมได้) — ไม่มีเลยคืน null
 *
 * ต้องเป็นฟังก์ชันเดียวที่ทั้ง "การจ่อตอบ" และ "การเรียงให้อยู่บนสุด" เรียก (user สั่ง 2026-08-04
 * "comment ที่เกี่ยวข้องควรอยู่บนสุดเสมอ") — ถ้าสองที่ตัดสินคนละนิยาม ระบบจะจ่อตอบอันหนึ่ง
 * แต่ดันอีกอันขึ้นไปอยู่บนสุด
 */
function pickRelevantComment(list: CommentItem[]): CommentItem | null {
  const byNewest = list
    .filter((c) => !c.isFromPage && !c.isDeleted)
    .sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime())
  return (
    byNewest.find((c) => !list.some((r) => r.isFromPage && r.parentExternalId === c.externalCommentId)) ??
    byNewest[0] ??
    null
  )
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
/**
 * เกณฑ์ "ใกล้หมดเวลาแล้วจริง" — ต่ำกว่า 24 ชม. คือช่วงที่ผู้ขายยังทันทำอะไรได้ในวันเดียว
 * เหนือกว่านั้นเป็นแค่ข้อมูล ไม่ใช่เรื่องด่วน
 *
 * 🛑 มีที่เดียวเท่านั้น — เดิมเส้นตายเดียวกันถูกทาสีคนละแบบสองที่: badge บนแถวโพสต์เป็น warning
 * แต่ข้อความในเธรดเป็น danger **ตั้งแต่เหลือ 6 วัน 20 ชั่วโมง** ถ้าแดงตั้งแต่ยังเหลือเกือบสัปดาห์
 * แดงก็เลิกแปลว่า "ทำเดี๋ยวนี้" แล้วเคสด่วนจริง (เหลือ 2 ชม.) ไม่มีที่ให้ยกระดับไปอีก
 * (impeccable critique 2026-08-09 P2 · HR16 — ข้อมูลเดียวต้องมีการนำเสนอชุดเดียว)
 */
const PRIVATE_REPLY_URGENT_MS = 24 * 60 * 60 * 1000

/** โทนสีของเส้นตายทักแชท — ใช้ค่านี้ทุกที่ที่แสดงเวลาคงเหลือ ห้ามเลือกสีเองที่ call site */
type PrivateReplyTone = 'danger' | 'warning'

function privateReplyWindow(createdTime: string): {
  text: string
  /** เวลาที่เหลือแบบไม่มีคำนำหน้า ("6 วัน 14 ชั่วโมง 3 นาที") — สำหรับประโยคที่มีคำนำหน้าของตัวเอง */
  remaining: string
  expired: boolean
  tone: PrivateReplyTone
} {
  const left = new Date(createdTime).getTime() + PRIVATE_REPLY_WINDOW_MS - Date.now()
  if (!Number.isFinite(left)) return { text: '', remaining: '', expired: false, tone: 'warning' }
  if (left <= 0) return { text: 'หมดเวลาทักแชท', remaining: '', expired: true, tone: 'danger' }
  const tone: PrivateReplyTone = left <= PRIVATE_REPLY_URGENT_MS ? 'danger' : 'warning'
  const days = Math.floor(left / 86_400_000)
  const hours = Math.floor((left % 86_400_000) / 3_600_000)
  const minutes = Math.floor((left % 3_600_000) / 60_000)
  const parts = [
    days > 0 ? `${days} วัน` : '',
    days > 0 || hours > 0 ? `${hours} ชั่วโมง` : '',
    `${minutes} นาที`,
  ].filter(Boolean)
  const remaining = parts.join(' ')
  return { text: `คงเหลือ ${remaining}`, remaining, expired: false, tone }
}

/**
 * ป้ายเวลาของแถวคอมเมนต์ — user report prod: `10:05` โผล่คู่กับ "หมดเวลาทักแชท" ทำให้ดูเหมือน
 * ระบบคำนวณผิด (คอมเมนต์เดือนก่อนกับคอมเมนต์วันนี้ขึ้น HH:mm หน้าตาเดียวกันเป๊ะ) ทั้งที่ตรรกะ
 * เส้นตาย 7 วันถูกอยู่แล้ว — วันที่เต็มมีอยู่ใน `title` เดิม แต่แตะไม่ได้บนมือถือ (คลาสเดียวกับ
 * skip reason ที่เพิ่งแก้ในหน้าตั้งค่า)
 *
 * ประกอบจาก export ที่มีอยู่แล้วใน src/lib/format-date.ts เท่านั้น (ห้าม Intl/toLocaleDateString
 * เอง — docs/conventions/date-format.md): thaiDayKey เทียบ "วันเดียวกันไหม/ปีเดียวกันไหม"
 * (คีย์ ค.ศ. ใช้เทียบเท่านั้น ไม่โชว์ผู้ใช้ตรง ๆ) แล้วเลือกฟังก์ชันแสดงผลตามนั้น:
 *   วันนี้ → formatTimeHM "10:05" (เหมือนเดิม)
 *   ปีนี้แต่ไม่ใช่วันนี้ → formatDayMonthTimeTH "20 ก.ค. 10:05"
 *   ปีอื่น → formatDateTimeTH "20 ก.ค. 2568 10:05" (ปีเต็ม พ.ศ. — กันสับสนคอมเมนต์ข้ามปี)
 */
function commentTimeLabel(input: string | null): string {
  const dayKey = thaiDayKey(input)
  if (!dayKey) return formatTimeHM(input)
  const todayKey = thaiDayKey(new Date())
  if (dayKey === todayKey) return formatTimeHM(input)
  return dayKey.slice(0, 4) === todayKey.slice(0, 4) ? formatDayMonthTimeTH(input) : formatDateTimeTH(input)
}

/**
 * feature 00038 Task 8 — ปุ่ม "ทักแชท" 4 สถานะ (UX-Design-Spec §2.2)
 *
 * "ทักแล้วหรือยัง" ต้องดูจาก **แถวของ commentId นี้เอง** (c.privateReplySentAt จาก server-side
 * join กับ CommentReplyLog) ไม่ใช่คีย์คน+โพสต์แบบ AUTO — คนคอมเมนต์ 2 ครั้งบนโพสต์เดียวกัน
 * ทักด้วยมือได้ทั้ง 2 อัน (Meta ผูกสิทธิ์กับคอมเมนต์ ไม่ใช่คน)
 *
 * หน้าต่างหมดเวลาใช้ privateReplyWindow() ตัวเดียวกับที่ countdown ในไฟล์นี้ใช้อยู่แล้ว (ค่าคงที่
 * PRIVATE_REPLY_WINDOW_MS = 7 วันเท่ากับ service ฝั่ง backend) — ไม่คำนวณ window ซ้ำอีกชุด
 */
type PrivateReplyState = 'SENT' | 'SENDING' | 'EXPIRED' | 'AVAILABLE'

function resolvePrivateReplyState(c: CommentItem, sendingId: string | null): PrivateReplyState {
  if (c.privateReplySentAt) return 'SENT'
  if (sendingId === c.id) return 'SENDING'
  if (privateReplyWindow(c.createdTime).expired) return 'EXPIRED'
  return 'AVAILABLE'
}

export default function CommentsClient({
  initialPosts,
  initialRawCount,
  initialCounts,
  shopIds,
  unified = false,
  channels,
}: {
  initialPosts: CommentPostItem[]
  /** จำนวนโพสต์ดิบที่ RSC ดึงมาในหน้าแรก (ไม่ใช่ยอดทั้งร้าน) — ใช้เป็น skip ของหน้าถัดไป */
  initialRawCount: number
  /** feature 00038 — ตัวนับ 4 กลุ่มของหน้าแรก มาจาก listCommentPosts เดียวกับที่ page.tsx fetch */
  initialCounts: CommentPostCounts
  /** ร้านที่แท็บนี้ครอบคลุม (feature 00037) — subscribe `comments:shop:{id}` ทุกตัว */
  shopIds: string[]
  /** true = โหมดรวมหลายร้าน → การ์ดโพสต์บอกชื่อร้านเจ้าของโพสต์ (ข้อความ ไม่ใช่ badge รูป) */
  unified?: boolean
  /** เพจที่ร้านเชื่อมไว้ — ใช้ทำตัวกรอง (user 2026-08-03: 'มีสิทธิ์ได้มาจากหลาย page ที่เชื่อม') */
  channels: ChannelOption[]
}) {
  const [posts, setPosts] = useState(initialPosts)
  // feature 00038 — ตัวนับ 4 กลุ่มจากเซิร์ฟเวอร์ (listCommentPosts) ตัวเดียวที่ badge/แท็บ/ตัวกรอง
  // ใช้ร่วมกัน (BR-CR-S4) — ต้องเข้าคู่กับ `posts` เสมอ (อัปเดตพร้อมกันทุกจุดที่ fetch)
  const [counts, setCounts] = useState<CommentPostCounts>(initialCounts)
  // จำนวนโพสต์ "ดิบ" ที่ query มาแล้วจริง (ก่อน filter ด้วย state) — ใช้เป็น skip ของหน้าถัดไป
  // ต้องแยกจาก posts.length เพราะ posts คือผลหลัง filter ด้วย ?state= แล้ว ถ้าใช้ posts.length
  // เป็น skip ตอนกรองอยู่ (เช่นแท็บ "บอทตอบแล้ว") จะข้ามแถวดิบผิดจำนวน เกิดโพสต์หายหรือซ้ำตอนโหลดเพิ่ม
  // 🛑 ต้องเป็น "จำนวนที่ fetch มาแล้วจริง" ไม่ใช่ `initialCounts.all` ซึ่งเป็นยอด **ทั้งร้าน**
  // ของเดิมผิดมาตลอดแต่ถูกกลบด้วยความบังเอิญ: effect ยิง refreshPosts ซ้ำตอน mount แล้วเขียนทับ
  // ค่านี้ทันที พอปิด double-fetch (2026-08-09) กับดักจะเปิดทันที — ปุ่ม "โหลดเก่ากว่านี้" จะข้าม
  // โพสต์เป็นสิบ. สองอย่างนี้ต้องแก้คู่กันเสมอ
  const rawFetchedRef = useRef(initialRawCount)
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
  const [channelTab, setChannelTab] = useState<CommentChannelFilter>('ALL')
  /**
   * แผงโหลดทับพื้นที่รายการทุกครั้งที่กรอง (user สั่งไว้ตั้งแต่ 2026-08-07 สำหรับ /orders:
   * "ทุกการ filter หรือ load ข้อมูลใหม่ มี preloading ขึ้นมาทับเสมอ ตามเวลาที่ใช้")
   * หน้านี้ถูกสร้างหลังคำสั่งนั้นแต่ไม่ได้หยิบ `useListBusy` ที่มีอยู่แล้วไปใช้ — sibling-surface-parity
   * (impeccable critique 2026-08-09 รอบ 2 · P2)
   */
  const listBusy = useListBusy()
  /**
   * 🛑 ต้องดึง `begin` ออกมาถือเป็นตัวแปรของตัวเอง แล้วใส่ **ตัวนี้** ใน dep array ของ effect
   * ห้ามใส่ `listBusy` ทั้งก้อนเด็ดขาด
   *
   * `useListBusy()` คืน object literal ใหม่ทุก render (`return { busy, run, begin }`) — อ็อบเจกต์
   * ที่ไม่เคยเท่ากับของ render ก่อนตาม Object.is. effect ที่ยิง fetch แล้วมี `listBusy` ใน deps
   * จึงกลายเป็นลูปไม่รู้จบทันที: fetch เสร็จ → setPosts/setCounts → re-render → อ็อบเจกต์ใหม่ →
   * effect รันใหม่ → fetch อีก วนเร็วเท่า round-trip (user เจอบน prod 2026-08-09 "มันยิง
   * /api/chat/comments/posts ไม่หยุด")
   *
   * ตัว `begin` เองเป็น `useCallback([minMs])` จึงเสถียรข้าม render — dep ที่ถูกต้องคือตัวนี้
   * และ **การ memo อ็อบเจกต์ที่ hook คืนไม่ได้แก้ปัญหานี้** เพราะ `busy` ต้องเปลี่ยนตามงานอยู่แล้ว
   * ก้อนนั้นก็ยังเปลี่ยน identity ทุกครั้งที่แผงเปิด/ปิด = ลูปเดิมแค่ช้าลง
   *
   * `/orders` ใช้ hook ตัวเดียวกันมาตั้งแต่ 2026-08-07 โดยไม่พัง เพราะที่นั่นเรียก `run()` จาก
   * event handler อย่างเดียว ไม่เคยมี effect ที่ผูกกับมันเลย — ไม่มี gate ไหนของโปรเจกต์เห็นความ
   * ต่างข้อนี้ (tsc/build/detector/grep เขียวหมด มันคือ dep array ที่ "ถูกตามกฎ exhaustive-deps")
   */
  const beginBusy = listBusy.begin
  const [filterOpen, setFilterOpen] = useState(false)
  /**
   * เดินนาฬิกาให้ตัวนับถอยหลังในแถวรายการขยับเอง (user สั่ง 2026-08-04)
   * ทุก 60 วินาทีพอ เพราะหน่วยเล็กสุดที่โชว์คือ "นาที" — ถี่กว่านั้นคือ re-render ฟรี ๆ
   * ค่าที่เก็บไม่ได้ถูกใช้ตรง ๆ มันมีไว้บังคับให้ component คำนวณเวลาที่เหลือใหม่เท่านั้น
   */
  const [, setClockTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setClockTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  // เริ่มที่ null เสมอ — มือถือต้องเห็น "รายการ" ก่อน ไม่ใช่ถูกโยนเข้าโพสต์ใดโพสต์หนึ่ง
  // (critique P0) เดสก์ท็อปมี 2 คอลัมน์อยู่แล้ว จึง auto-select ให้เฉพาะ ≥1024px
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thread, setThread] = useState<ThreadData | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  // feature 00038 Task 8 — commentId ที่กำลังส่ง private reply อยู่ (null = ไม่มี) ใช้ derive
  // สถานะปุ่ม SENDING ผ่าน resolvePrivateReplyState() เดียวกันทั้งไฟล์
  const [sendingPrivateReplyId, setSendingPrivateReplyId] = useState<string | null>(null)
  // feature 00038 Task 8 (rework) — คอมเมนต์ที่กำลังกรอกข้อความ "ทักแชท" อยู่ (null = โมดัลปิด)
  const [privateReplyComment, setPrivateReplyComment] = useState<CommentItem | null>(null)
  // แนบรูปในคำตอบ (user สั่ง 2026-08-03) — เอกสาร Meta: comment รับ `attachment_url` ได้
  // ใช้ท่าเดียวกับแชท: อัปขึ้น storage ของเราก่อน แล้ว server ค่อยทำ presigned URL ให้ Meta ดึง
  const [pendingFile, setPendingFile] = useState<{ fileId: string; previewUrl: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  // โหลดเพิ่ม: รายการตันที่ 25 โพสต์เงียบ ๆ มาก่อน (critique P1) — ตอนนี้มีปุ่มและรู้ว่ายังมีอีก
  const [loadingMore, setLoadingMore] = useState(false)
  // initialCounts.all = จำนวนดิบที่หน้าแรก fetch มา (ไม่ผ่าน state filter — page.tsx เรียกแบบ ALL
  // เสมอ) ใช้ตัวนี้แทน initialPosts.length ให้สอดคล้องกับ rawFetchedRef ด้านล่าง
  const [hasMore, setHasMore] = useState(initialRawCount >= 25)
  // ในเธรด: ดูเฉพาะคอมเมนต์ที่ยังไม่มีคำตอบของเพจ
  const [unansweredOnly, setUnansweredOnly] = useState(false)
  /**
   * ตัวกรอง "แสดงอะไร" เก็บที่เดียวแล้วให้ทั้งแถบแท็บและแผงตัวกรองอ่าน/เขียนตัวเดียวกัน: แท็บเป็น
   * ทางลัดของค่าชุดนี้ ไม่ใช่ state คู่ขนาน (feature 00038 UX-Design-Spec §3.2)
   *
   * เดิม `unanswered`/`done` เป็น boolean คู่ที่ overlap กันได้ (ที่มาของบั๊ก "ตัวเลข 2 ที่ไม่ตรงกัน"
   * ที่เจอมาแล้วในหน้านี้) — เปลี่ยนเป็น `postStatus` single-select 4 ค่า (ALL/UNANSWERED/BOT/HUMAN)
   * ผูกตรงกับ 4 แท็บใต้แถบช่องทาง ส่งเป็น `?state=` ให้ listCommentPosts กรองที่เซิร์ฟเวอร์
   * (postStatus เป็นค่า derived จาก derivePostState ไม่ใช่คอลัมน์ในฐาน กรองที่ client ไม่ได้แล้ว
   * เพราะไม่มีข้อมูลคอมเมนต์ดิบมาด้วย — server ต้องเป็นคนกรองและคืน counts คู่กันมาเสมอ)
   */
  const [show, setShow] = useState<CommentShowFilter>(DEFAULT_COMMENT_SHOW_FILTER)
  const postTab = show.postStatus
  const setPostTab = (tab: CommentShowFilter['postStatus']) =>
    setShow((s) => ({ ...s, postStatus: tab }))
  /**
   * คอมเมนต์ระดับบนที่ร้านเขียนเอง — มาจากตัวกรองชุดเดียวกัน (show.shopComments, ค่าตั้งต้นปิด)
   * ของพวกนี้ **เข้าฐานอยู่แล้ว** (ingestFeedComment เก็บทุกคอมเมนต์ + ติดธง isFromPage) แค่ไม่ควร
   * ปนอยู่ในลิสต์ "สิ่งที่ต้องตอบ" — ซ่อนแค่ **ระดับบน** เท่านั้น คำตอบของเพจที่อยู่ใต้คอมเมนต์ลูกค้า
   * ยังต้องเห็นตลอด (มันคือหลักฐานว่าเราตอบไปว่าอะไร)
   */
  const showShopComments = show.shopComments
  /**
   * ลำดับคอมเมนต์ในเธรด — ชุดเดียวกับ Facebook (user สั่ง 2026-08-04) คำไทยยึดคำที่ผู้ขายเห็นใน
   * Facebook/Business Suite อยู่แล้ว ไม่คิดคำใหม่ (impeccable clarify)
   *   RELEVANT = 'เกี่ยวข้องที่สุด' (ค่าตั้งต้น) — คอมเมนต์ที่ต้องตอบอยู่บนสุด แล้วไล่ใหม่→เก่า
   *   NEWEST   = 'ใหม่สุด' — ใหม่→เก่าล้วน
   *   ALL      = 'ทั้งหมด' — เก่า→ใหม่ตามลำดับที่เกิดจริง (เท่ากับ All comments ของ Facebook)
   * 'ซ่อนโดยเพจนี้' ยังทำไม่ได้ — PageComment ไม่มีคอลัมน์สถานะซ่อน จึงไม่ใส่ตัวเลือกที่กดแล้วว่างเสมอ
   */
  const [commentOrder, setCommentOrder] = useState<'RELEVANT' | 'NEWEST' | 'ALL'>('RELEVANT')
  const [emojiOpen, setEmojiOpen] = useState(false)
  // เล่นวิดีโอในหน้าเรา (user สั่ง 2026-08-03 "ไม่อยากให้กดออกไปใน facebook") — โหลด iframe ของ
  // Facebook video plugin เมื่อ "กดเล่น" เท่านั้น ไม่โหลดล่วงหน้าทุกโพสต์ (iframe ของ Meta หนัก
  // และตามผู้ใช้ด้วย cookie — โหลดเมื่อผู้ใช้สั่งเท่านั้นคือพฤติกรรมที่ถูกต้อง)
  const [playing, setPlaying] = useState(false)
  /**
   * ข้อความโพสต์ขยายอยู่ไหม (user สั่ง 2026-08-04: "อยากให้ description แสดงแค่ 3 แถวสูงสุด แต่ถ้า
   * ข้อความเกิน ให้กดดูเพิ่มเติมโดยที่มันจะ expand ลงมาทับคลิป เพื่อเพิ่มพื้นที่ให้แสดงผลคลิปหน่อย")
   * รีเซ็ตเมื่อเปลี่ยนโพสต์ ไม่งั้นโพสต์ถัดไปเปิดมาค้างสถานะขยายของโพสต์ก่อน
   */
  const [messageExpanded, setMessageExpanded] = useState(false)
  /**
   * ความสูงของแผงคอมเมนต์บนมือถือ (px) — ลากปรับได้ (user สั่ง 2026-08-04: "ในมือถือแสดงผลแย่
   * โดยเฉพาะตรงข้อความ พอจะพิมพ์ตอบ มันไม่เห็นเลยข้อความนั้น ๆ คืออะไร จะเป็นไปได้ไหมให้มันมี drag
   * ขยายความสูงได้")
   *
   * ทำไมต้องลากได้ ไม่ใช่ตั้งค่าคงที่: โพสต์มีทั้งคลิปแนวตั้ง (สูงมาก) และรูปแนวนอน สัดส่วนที่ดี
   * ระหว่าง "เห็นสื่อ" กับ "เห็นคอมเมนต์" จึงต่างกันทุกโพสต์ และตอนกำลังตอบคนก็อยากดันคอมเมนต์
   * ขึ้นมาให้สุด — ค่าคงที่ค่าเดียวทำให้ผิดทั้งสองเคส
   * ใช้ px ไม่ใช่ % เพราะคีย์บอร์ดมือถือทำให้ความสูง viewport เปลี่ยนกลางทาง
   */
  const [mobilePanelH, setMobilePanelH] = useState<number | null>(null)
  const [isNarrow, setIsNarrow] = useState(false)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const sync = () => setIsNarrow(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // ค่าเริ่มต้นบนมือถือ ~45% ของจอ — ไม่ตั้งไว้เลยจะได้แถบคอมเมนต์บางเฉียบตามที่ user เจอ
  useEffect(() => {
    if (!isNarrow || mobilePanelH !== null) return
    setMobilePanelH(clampPanelH(Math.round(window.innerHeight * 0.45)))
  }, [isNarrow, mobilePanelH])

  const clampPanelH = (h: number) => {
    /**
     * เพดานต้องเผื่อ "ของที่อยู่เหนือแผง" ให้พอจริง (user report 2026-08-04 รอบสอง "มันเพี้ยนกว่าเดิม
     * เวลาเราลากขึ้นลง"): รอบแรกผมเผื่อไว้แค่ 180px ซึ่งน้อยกว่าความสูงจริงของ header + แถบแท็บ +
     * หัวโพสต์ + ข้อความ 3 บรรทัด (~300px) คอลัมน์โพสต์จึงยุบจนสื่อเหลือเป็นเสี้ยวและแถบยอดไปเบียดกัน
     * 300px = ผลรวมจริงของ 4 ก้อนนั้น (วัดจากโครงที่ render อยู่ ไม่ใช่เลขสวย ๆ)
     */
    const reservedAbove = 300
    const max = Math.max(220, window.innerHeight - reservedAbove)
    return Math.min(Math.max(h, 160), max)
  }
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

  /**
   * feature 00038 หนี้ #2 — แถบแท็บสถานะ 4 ตัวเลื่อนแนวนอนบนมือถือ (overflow-x-auto ด้านล่าง) โดยไม่มี
   * สัญญาณว่ายังเลื่อนต่อได้อีก ผู้ใช้ digital-literacy ต่ำอาจไม่รู้ว่าแท็บ "คนตอบแล้ว" ซ่อนอยู่ทางขวา
   * (ของเดิมมี 2 แท็บพอดีจอ ขยายเป็น 4 ทำให้ล้นง่ายกว่าเดิมมาก) — เติม edge fade ที่ขอบซ้าย/ขวาเฉพาะ
   * ตอนยังเลื่อนไปทางนั้นได้จริง (ไม่ใช่ fade ค้างตลอดกาลไม่ว่าจะเลื่อนสุดหรือยัง) วัดด้วย scrollLeft/
   * scrollWidth ของกล่อง ไม่ใช้ arbitrary Tailwind value (HR7) — โปรเจกต์นี้ไม่มี pattern edge-fade
   * มาก่อน (grep `overflow-x-auto` ทั้ง repo แล้ว) จึงสร้างด้วย token สี `card`/`transparent` ที่มีอยู่แล้ว
   */
  const statusTabScrollRef = useRef<HTMLDivElement>(null)
  const [statusTabFade, setStatusTabFade] = useState({ left: false, right: false })

  const updateStatusTabFade = useCallback(() => {
    const el = statusTabScrollRef.current
    if (!el) return
    setStatusTabFade({
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    })
  }, [])

  useEffect(() => {
    const el = statusTabScrollRef.current
    if (!el) return
    updateStatusTabFade()
    // ResizeObserver จับได้ทั้งการเปลี่ยนขนาดจอและความกว้างเนื้อหาในกล่องเอง (pattern เดียวกับ
    // playerBoxRef ด้านบน) — ผูกครั้งเดียวตอน mount พอ ไม่ต้องผูกใหม่ทุกครั้งที่ counts เปลี่ยน
    const ro = new ResizeObserver(updateStatusTabFade)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateStatusTabFade])

  // ตัวเลข badge เปลี่ยนจำนวนหลักได้ (เช่น 9 -> 99+) ซึ่งเปลี่ยนความกว้างเนื้อหาโดยไม่มี event resize
  // ให้ ResizeObserver จับเสมอในบางเบราว์เซอร์ — สั่งวัดซ้ำตรง ๆ เมื่อ counts เปลี่ยนกันไว้อีกชั้น
  useEffect(() => {
    updateStatusTabFade()
  }, [counts, updateStatusTabFade])

  const refreshPosts = useCallback(async (
    ch: string | null,
    state: CommentShowFilter['postStatus'],
    provider: CommentChannelFilter,
  ) => {
    try {
      const params = new URLSearchParams()
      if (ch) params.set('channelId', ch)
      // feature 00038 — ?state= กรองที่ server (postStatus เป็นค่า derived ไม่มีในฐาน กรองที่นี่ไม่ได้)
      if (state !== 'ALL') params.set('state', state)
      // ?provider= ก็ต้องกรองที่ server ด้วยเหตุผลเดียวกันแต่คนละแบบ: ไม่ใช่เพราะกรองที่ client ไม่ได้
      // แต่เพราะ `counts` มาจาก server — กรองรายการที่ client แล้วปล่อยตัวเลขไว้ที่เดิม = ตัวเลข
      // ไม่ตรงกับรายการใต้มัน (impeccable critique 2026-08-09 P1)
      if (provider !== 'ALL') params.set('provider', provider)
      const qs = params.toString()
      const res = await fetch(`/api/chat/comments/posts${qs ? `?${qs}` : ''}`)
      if (!res.ok) return
      const data = (await res.json()) as { posts: CommentPostItem[]; counts: CommentPostCounts; rawCount: number }
      setPosts(data.posts)
      // counts เป็น global ทั้งร้านแล้ว (feature 00038 หนี้ #1) — set ตรง ๆ ไม่บวกสะสม
      setCounts(data.counts)
      // rawCount = จำนวนโพสต์ดิบที่ query รอบนี้ได้มา (ก่อนกรอง state) ใช้แค่คำนวณ skip/hasMore
      // ของหน้าถัดไป คนละความหมายกับ counts.all ซึ่งเป็นตัวเลขแสดงผลทั้งร้านแล้ว
      rawFetchedRef.current = data.rawCount
      setHasMore(data.rawCount >= 25)
    } catch {
      // โหลดไม่สำเร็จ = คงรายการเดิมไว้ ไม่ต้องรบกวนผู้ใช้
    }
  }, [])

  // เปลี่ยนเพจ/แท็บสถานะที่กรอง → ดึงรายการใหม่จาก server (กรองที่ฐาน ไม่ใช่กรองเฉพาะที่โหลดมาแล้ว)
  //
  // ช่องค้นหาถูกถอดออก 2026-08-04 ตามที่ user สั่ง ("ไม่ต้อง search") — แท็บข้อความมีช่องค้นหา
  // เพราะเธรดสะสมเป็นพันและชื่อลูกค้าคือกุญแจ ส่วนที่นี่หน่วยของรายการคือ "โพสต์" ซึ่งมีไม่มากและ
  // เรียงตามคอมเมนต์ล่าสุดอยู่แล้ว. debounce 350ms ที่มีไว้รอพิมพ์จึงไม่ต้องมีด้วย
  // ห่อที่ effect ตัวเดียว ไม่ใช่ไล่ห่อทีละปุ่ม — ครอบทุกแกนกรอง (เพจ/สถานะ/ช่องทาง) พร้อมกัน
  // และจะไม่หลุดเมื่อมีคนเพิ่มตัวกรองใหม่ทีหลัง (แพตเทิร์นเดียวกับ OrdersList)
  // ข้าม mount แรก: RSC ส่งรายการมาให้แล้ว ไม่มีอะไรให้รอ
  const filterFirstRun = useRef(true)
  useEffect(() => {
    if (filterFirstRun.current) {
      filterFirstRun.current = false
      return
    }
    beginBusy()
    void refreshPosts(channelId, show.postStatus, channelTab)
    // 🛑 dep เป็น `beginBusy` (useCallback เสถียร) ไม่ใช่ `listBusy` ทั้งก้อน — ดูเหตุผลยาวที่จุด
    // ประกาศ `beginBusy` ด้านบน (ใส่ทั้งก้อน = ยิง fetch ไม่หยุด)
  }, [channelId, show.postStatus, channelTab, refreshPosts, beginBusy])

  async function loadMorePosts() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      // skip ใช้จำนวนดิบที่เคย fetch มาแล้วจริง (rawFetchedRef) ไม่ใช่ posts.length — posts คือ
      // ผลหลัง filter ด้วย ?state= แล้ว ถ้าใช้ posts.length เป็น skip ตอนกำลังกรองอยู่จะข้าม/ซ้ำแถวดิบ
      const params = new URLSearchParams({ skip: String(rawFetchedRef.current) })
      if (channelId) params.set('channelId', channelId)
      if (show.postStatus !== 'ALL') params.set('state', show.postStatus)
      // ต้องตรงกับ refreshPosts เสมอ — ไม่งั้น "โหลดเพิ่ม" จะพาโพสต์ของช่องทางอื่นเข้ามาปนกลางรายการ
      if (channelTab !== 'ALL') params.set('provider', channelTab)
      const res = await fetch(`/api/chat/comments/posts?${params.toString()}`)
      if (!res.ok) return
      const data = (await res.json()) as { posts: CommentPostItem[]; counts: CommentPostCounts; rawCount: number }
      // กันซ้ำด้วย id — poll/realtime อาจแทรกโพสต์ใหม่เข้ามาระหว่างที่กำลังโหลดหน้าถัดไป
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...data.posts.filter((p) => !seen.has(p.id))]
      })
      // counts เป็น global ทั้งร้านอยู่แล้ว (feature 00038 หนี้ #1) — set ตรง ๆ ไม่บวกสะสมกับของเดิม
      // (เดิมบวก prev+ผลของ batch นี้ ซึ่งถูกต้องตอน counts ยังเป็น batch scope แต่ตอนนี้ counts
      // ที่ server ส่งมาคือทั้งร้านอยู่แล้วในทุกการเรียก บวกซ้ำจะทำให้ตัวเลขพุ่งเกินจริงทุกครั้งที่เลื่อน)
      setCounts(data.counts)
      rawFetchedRef.current += data.rawCount
      setHasMore(data.rawCount >= 25)
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

  /**
   * ไม่เลือกโพสต์ให้เอง — เข้ามาต้องเห็น "เลือกความคิดเห็น" เหมือนที่แท็บข้อความเห็น "เลือกบทสนทนา"
   * (user สั่ง 2026-08-04: "พอเข้าไป มันก็ไม่มี default เลือกความคิดเห็น มันเลือกอันแรกเสมอเลย")
   *
   * เหตุผลเดิม ("คอลัมน์ขวาว่างเปล่าดูเหมือนหน้าพัง", critique P0) ตกไปเพราะคอลัมน์ขวามี empty
   * state ที่บอกว่าต้องทำอะไรต่ออยู่แล้ว และการเลือกให้เองมีราคาที่มองไม่เห็น: โพสต์แรกถูกจ่อตอบ
   * ทุกครั้งที่เปิดหน้าโดยร้านไม่ได้เลือก แล้วรายการเรียงตามคอมเมนต์ล่าสุด = ตัวที่ถูกเลือก
   * เปลี่ยนไปเรื่อย ๆ
   */

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
    // ต้องส่ง channelTab ไปด้วย ไม่งั้น poll/realtime รอบถัดไปจะดึงรายการแบบไม่กรองช่องทางมาทับ
    // ของที่กรองอยู่ — อาการจะเป็น "กดพิลล์แล้วรายการถูกต้อง แต่ 15 วินาทีต่อมามันกลับมาเอง"
    void refreshPosts(channelId, show.postStatus, channelTab)
    if (selectedId) void loadThread(selectedId, { silent: true })
  }, [channelId, show.postStatus, channelTab, selectedId, refreshPosts, loadThread])

  // realtime จริง (user สั่ง 2026-08-03 "ทำ trigger ให้เป็น realtime จริงเลย") — DB trigger บน
  // PageComment ยิง broadcast `comments:shop:{shopId}` แบบ signal-only แล้ว client refetch เอง
  // ดู migration 20260803180000_page_comment_realtime_broadcast
  useEffect(() => {
    if (shopIds.length === 0) return
    // feature 00037 — คอมเมนต์ใหม่ของทุกร้านในขอบเขตต้องทำให้รายการอัปเดตเอง
    const offs = shopIds.map((id) => subscribeShopComments(id, refreshAll))
    return () => offs.forEach((off) => off())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopIds.join(','), refreshAll])

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
    // 🛑 กฎ "top-level อันไหนควรอยู่ในเธรด" อยู่ที่ `src/lib/comment-tree-visibility.ts` ไม่ใช่ที่นี่
    //
    // สกัดออกไปเพราะมันเคยผิดเงียบ ๆ: เดิมตัดคอมเมนต์ระดับบนของเพจทิ้งทั้งกิ่ง แต่ `replies` อ่าน
    // จาก children.get() ของ top-level ที่ **เหลืออยู่** เท่านั้น → ลูกค้าที่มาตอบใต้คอมเมนต์ของเพจ
    // หายไปทั้งจากหน้าจอและจากชิป "ยังไม่ตอบ N" ขณะที่ service นับคอมเมนต์ลูกค้าทุกชั้น
    // ผลคือแถวซ้ายขึ้น "ยังไม่ตอบ 1" แต่เปิดเข้าไปเจอเธรดว่าง — และคำถามนั้นตอบไม่ได้เลย
    //
    // เครื่องมือนี้สร้างเคสนี้เอง: กดส่งที่แถบล่างตอนยังไม่เลือกจะตอบใคร = คอมเมนต์ระดับบนของเพจ
    const tops = visibleTopLevelComments(list, showShopComments)
    const newestFirst = [...tops].sort(
      (a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime(),
    )
    // ALL = เก่า→ใหม่ตามที่ service ส่งมา (ลำดับที่เกิดจริง) | NEWEST = ใหม่→เก่า
    // RELEVANT = ดัน "คอมเมนต์ที่ต้องตอบ" ขึ้นบนสุด แล้วที่เหลือใหม่→เก่า (user สั่ง 2026-08-04
    // "comment ที่เกี่ยวข้องควรอยู่บนสุดเสมอ") — ถ้าตัวที่เกี่ยวข้องเป็นคำตอบใต้คอมเมนต์อื่น
    // ให้ดัน "ต้นเธรดของมัน" ขึ้นไป ไม่ใช่ดึงลูกออกมาลอยเดี่ยวจนอ่านไม่รู้ว่าตอบใคร
    const ordered =
      commentOrder === 'ALL'
        ? tops
        : commentOrder === 'NEWEST'
          ? newestFirst
          : (() => {
              const relevant = pickRelevantComment(list)
              if (!relevant) return newestFirst
              const topId = relevant.parentExternalId ?? relevant.externalCommentId
              const idx = newestFirst.findIndex((c) => c.externalCommentId === topId)
              if (idx <= 0) return newestFirst
              return [newestFirst[idx], ...newestFirst.filter((_, i) => i !== idx)]
            })()
    return ordered
      .filter((c) => !c.parentExternalId)
      // ลำดับถูกตัดสินไปแล้วข้างบนตาม commentOrder — เรียงเฉพาะ "คอมเมนต์ระดับบน" เท่านั้น
      // คำตอบใต้แต่ละอันยังเก่า→ใหม่ตามเดิม เพราะข้างในนั้นคือบทสนทนา อ่านกลับหัวไม่รู้เรื่อง
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
  }, [thread, commentOrder, showShopComments])

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

  /**
   * feature 00038 Task 8 — ยิง POST /api/chat/comments/{commentId}/private-reply แล้ว sync สถานะ
   * ปุ่มตามตาราง error mapping ของ UX-Design-Spec §2.2 / API.md §4.4/§5 (contract ที่ freeze แล้ว)
   *
   * 200: optimistic — เอา conversationId จาก response ใส่ state ทันที ไม่รีเฟรชทั้งหน้า (AC-CR-19)
   *   บทเรียนหน้าสินค้า 2026-08-06: response ที่ไม่มี field นั้น ≠ field นั้นไม่เปลี่ยน — ที่นี่ตรงข้าม
   *   response "มี" conversationId ให้แล้ว การไม่เอาไปใส่ state คือบั๊กเดียวกันในทางกลับกัน
   * 409 ALREADY_SENT: ไม่ใช่ความผิดผู้ใช้ (toast info ไม่ใช่ error) — response ไม่มี conversationId
   *   มาด้วย จึง refetch เธรดแบบเงียบเพื่อได้ค่าจริงจาก server แทนการเดา
   * ที่เหลือ (WINDOW_EXPIRED/CHANNEL_NOT_ACTIVE/UPSTREAM_ERROR/VALIDATION_ERROR): แค่เคลียร์
   * sendingPrivateReplyId แล้วปล่อยให้ resolvePrivateReplyState derive สถานะใหม่เอง — c.privateReplySentAt
   * ยังเป็น null เหมือนเดิม จึงตกไป EXPIRED (ถ้าหน้าต่างหมดจริง) หรือ AVAILABLE (กรณีอื่น) โดยอัตโนมัติ
   * ไม่ต้องมี state พิเศษแยก
   *
   * คืนค่า boolean ให้ผู้เรียก (PrivateReplyModal) ตัดสินว่าจะปิดโมดัลไหม — true เฉพาะตอนจบแบบไม่ต้อง
   * แก้ไขอะไรต่อ (ส่งสำเร็จ/ถูกส่งไปแล้วก่อนหน้า) ส่วน error จริง (หมดเวลา/เพจหลุด/upstream ล้ม) คืน
   * false ให้โมดัลเปิดค้างไว้เพื่อกดลองใหม่ได้โดยไม่ต้องพิมพ์ข้อความซ้ำ
   */
  const PRIVATE_REPLY_ERROR_TEXT: Record<string, string> = {
    WINDOW_EXPIRED: 'เกิน 7 วันแล้ว ทักแชทไม่ได้อีก',
    CHANNEL_NOT_ACTIVE: 'เพจนี้เชื่อมต่อไม่อยู่แล้ว ต้องเชื่อมต่อใหม่ก่อน',
    UPSTREAM_ERROR: 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง',
    VALIDATION_ERROR: 'พิมพ์ข้อความก่อนส่ง',
  }

  async function sendPrivateReply(comment: CommentItem, message: string): Promise<boolean> {
    setSendingPrivateReplyId(comment.id)
    try {
      const res = await fetch(`/api/chat/comments/${comment.id}/private-reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      // feature 00038 Task 9 — เก็บหนี้จาก Task 8: conversationId เป็น null ได้จริงเมื่อ sent:true
      // (Graph ส่งสำเร็จแต่ทรานแซกชันสร้างห้องแชทล้มเหลว — ดู comment-private-reply.service.ts
      // D2/บรรทัด 28-30) type เดิมเขียน `conversationId: string` แบบ non-nullable ซึ่งไม่ตรงกับ
      // response จริงของ route — ไม่ได้ทำให้พังตอนนี้แค่เป็น type ที่โกหก
      const body = (await res.json().catch(() => null)) as
        | { conversationId: string | null; sentAt: string }
        | { error?: string; code?: string }
        | null

      if (res.ok && body && 'conversationId' in body) {
        pacesToast.success('ส่งข้อความสำเร็จ — เกิดห้องแชทใหม่แล้ว')
        setThread((prev) =>
          prev
            ? {
                ...prev,
                comments: prev.comments.map((row) =>
                  row.id === comment.id
                    ? { ...row, privateReplySentAt: body.sentAt, privateReplyConversationId: body.conversationId }
                    : row,
                ),
              }
            : prev,
        )
        return true
      }

      const code = body && 'code' in body ? body.code : undefined
      if (code === 'ALREADY_SENT') {
        pacesToast.info('คอมเมนต์นี้ถูกทักไปแล้ว')
        if (selectedId) void loadThread(selectedId, { silent: true })
        return true
      }
      pacesToast.error((code && PRIVATE_REPLY_ERROR_TEXT[code]) ?? 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง')
      return false
    } catch {
      pacesToast.error('ส่งไม่สำเร็จ ลองใหม่อีกครั้ง')
      return false
    } finally {
      setSendingPrivateReplyId(null)
    }
  }

  /** feature 00038 Task 8 (rework) — เปิดโมดัลฟอร์ม "ทักแชท" (PrivateReplyModal.tsx) */
  function openPrivateReplyModal(comment: CommentItem) {
    setPrivateReplyComment(comment)
  }

  /** ปุ่ม "ส่งข้อความ" ใน PrivateReplyModal — ปิดโมดัลเฉพาะตอนจบแบบไม่ต้องแก้ไขอะไรต่อ */
  async function handlePrivateReplySend(message: string) {
    if (!privateReplyComment) return
    const done = await sendPrivateReply(privateReplyComment, message)
    if (done) setPrivateReplyComment(null)
  }

  // 🛑 แท็บช่องทางกรองที่ **server** แล้ว (ดู `?provider=` ใน refreshPosts/loadMorePosts) —
  // ห้ามกลับไปกรองที่ client. ของเดิมกรองที่นี่ด้วย `posts.filter(p => p.channel.provider === tab)`
  // โดยให้เหตุผลว่า "provider ติดมากับโพสต์แล้ว ไม่ต้องยิง server ใหม่" ซึ่งจริงเรื่องรายการ
  // แต่ลืมไปว่า `counts` มาจาก server → กดพิลล์ Instagram แล้วได้ "ยังไม่ตอบ 12" อยู่เหนือ
  // "ไม่พบความคิดเห็นตามตัวกรอง" (impeccable critique 2026-08-09 P1). ตัวเลขกับรายการต้องมาจาก
  // scope เดียวกันโดยโครงสร้าง — เหตุผลเดียวกับที่ `state` ถูกย้ายมา server ไปแล้วก่อนหน้านี้
  const postsByChannel = posts
  /**
   * feature 00038 — แท็บสถานะ (state) กรองที่ server แล้ว (ดู refreshPosts/loadMorePosts) `posts`
   * ที่ได้กลับมาจึงตรงกับ show.postStatus อยู่แล้วเสมอ ไม่ต้อง filter ซ้ำที่ client อีกชั้น
   * (ของเดิม visiblePosts filter ด้วย show.unanswered/done เป็นการกรองซ้ำบน client — ตอนนี้เลิกทำ
   * เพราะ state ไม่ใช่ boolean คู่ที่ overlap กันได้แล้ว server เป็นคนตัดสินขั้นเดียวจบ)
   * ตัวนับบนแท็บทั้ง 4 มาจาก `counts` ที่ server คำนวณแบบทั้งร้าน (feature 00038 หนี้ #1) — ไม่ผูกกับ
   * ขนาดของ `posts` ที่โหลดมาแล้วอีกต่อไป จึงตรงกับ badge บน tab "ความคิดเห็น" เสมอ (BR-CR-S4)
   */
  const visiblePosts = postsByChannel

  /**
   * 🛑 โพสต์ที่เปิดอยู่ต้องไม่หายไปจากแผงขวาเพียงเพราะมันหลุดจาก **รายการที่ถูกกรอง**
   *
   * เคสที่เกิดจริงและเกิดบ่อยที่สุด คือ "ตอบสำเร็จ": ผู้ขายอยู่แท็บ "ยังไม่ตอบ" → ตอบคอมเมนต์
   * ค้างอันสุดท้ายของโพสต์ → คำตอบเข้า DB → trigger ยิง realtime → refreshAll() ดึงรายการใหม่ที่
   * ไม่มีโพสต์นั้นแล้ว (postStatus ขยับเป็น HUMAN_ANSWERED) → เธรดที่กำลังอ่านอยู่หายไปต่อหน้า
   * ภายในไม่กี่วินาทีหลังกดส่ง
   *
   * นอกจากเป็นทางตันบนมือถือแล้ว (ดู P0 ที่แผงขวา) มันยังผิดในเชิงงานด้วย — ผู้ขายเพิ่งตอบเสร็จ
   * เขาควรได้อยู่ในเธรดนั้นต่อเพื่อเห็นว่าคำตอบขึ้นแล้ว ไม่ใช่ถูกเตะออกเพราะทำงานสำเร็จ
   * (คิวงานที่กลืนหลักฐานว่างานเสร็จ — impeccable critique รอบ 2)
   *
   * snapshot ถูกล้างเมื่อผู้ใช้กดออกเอง (selectedId = null) เท่านั้น
   */
  const selectedPostRef = useRef<CommentPostItem | null>(null)
  const foundPost = posts.find((p) => p.id === selectedId) ?? null
  if (foundPost) selectedPostRef.current = foundPost
  else if (!selectedId) selectedPostRef.current = null
  const selectedPost = selectedId ? (foundPost ?? selectedPostRef.current) : null

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
  /**
   * ช่องตอบคอมเมนต์ — โครงตาม ref ที่ user ส่งมาตรง ๆ 2026-08-04 ("ผมอยากให้ใช้ ref นี้อ่ะ ใช้ง่าย"):
   * รูปเพจอยู่นอกช่อง แล้วช่องพิมพ์เป็น pill กลมใบเดียวที่มี "ไอคอน action เรียงอยู่ข้างในชิดขวา"
   * ไม่ใช่ปุ่มลอยเรียงหน้า-หลังช่องแบบเดิม (ของเดิม avatar 32px ปนกับปุ่ม 44px ในแถวเดียว
   * แล้วมีลิงก์ "ยกเลิกการตอบ" ห้อยใต้อีกบรรทัด = แถวเบี้ยวและอ่านไม่ออกว่าอะไรคู่กับอะไร)
   *
   * ปุ่มส่งไม่มีใน ref (Facebook ส่งด้วย Enter) แต่เราคงไว้แบบ "โผล่เมื่อมีอะไรจะส่ง" — ปุ่มส่ง
   * ที่หายไปเลยทำให้คนที่ไม่รู้ว่ากด Enter ได้ติดตาย และ Enter เดี่ยวบนมือถือคือปุ่มขึ้นบรรทัดใหม่
   *
   * ตาม Design Spec ของ safepay-ux รอบนี้ (เก็บ 3 ข้อ): แถบบอกว่ากำลังตอบใครมี container ของตัวเอง
   * (ไม่ใช่ลิงก์ลอย), คำเตือน PII ย่อเหลือบรรทัดเดียวแต่ **ไม่ซ่อน** (BR-23 บังคับให้ถาวร),
   * และเลิกเขียน `disabled:opacity-60` ทับ default ของธีม (`_buttons.css` = opacity-50 อยู่แล้ว
   * ซึ่งจางกว่า — ของเดิมจึงดูเหมือนยังกดได้)
   */
  // ลบ `composerIcons` ออกแล้ว (impeccable critique 2026-08-09) — เป็น dead code ที่ grep เจอ
  // ที่เดียวคือนิยามของตัวเอง และข้างในมี `<input ref={fileInputRef}>` **ตัวที่สอง** ถ้าใครเผลอ
  // render มันขึ้นมา input สองตัวจะแชร์ ref เดียวกันแล้วตัวที่ mount ทีหลังชนะเงียบ ๆ — ปุ่มแนบรูป
  // จะเปิด input ที่ไม่ได้อยู่ในจอ. ไอคอนชุดที่ใช้จริงอยู่ใน renderComposer() ข้างล่างแล้ว
  const renderComposer = (inline: boolean) => (
    <div className={inline ? '' : 'w-full p-3'}>
      {/* บรรทัด "ตอบใคร" — บรรทัดข้อความเดียว ไม่ใช่การ์ดมีขอบ
          user 2026-08-04 รอบสอง: "ที่ทำมา มันรกกว่าเดิม ใช้ยาก ไม่ minimal และ UI ก็ใหญ่เทอะทะ"
          รอบแรกผมทำเป็นกล่องมีเส้นขอบซ้าย + แถบเตือนเต็มความกว้าง + pill ที่มีขอบซ้อนขอบ textarea
          = กล่องซ้อนกัน 3 ชั้นสูงกว่าช่องพิมพ์เอง. ref ของ Facebook มีชั้นเดียวคือ pill */}
      {replyTo && (
        <div className="text-default-700 mb-1 flex items-center gap-1 text-2xs">
          <Icon icon="arrow-back-up" width={12} height={12} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            ตอบ <span className="text-default-900 font-semibold">{replyTo.fromName ?? 'ผู้ใช้ Facebook'}</span>
          </span>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            aria-label="ยกเลิกการตอบ"
            className="hover:bg-default-100 text-default-700 flex size-6 shrink-0 items-center justify-center rounded"
          >
            <Icon icon="x" width={12} height={12} />
          </button>
        </div>
      )}
      {pendingFile && (
        <div className="relative mb-1 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingFile.previewUrl} alt="" className="max-h-20 rounded-lg" />
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
      <div className="relative flex items-center gap-2">
        {thread?.channel.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thread.channel.avatarUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
        )}
        {/* pill ชั้นเดียว: ช่องพิมพ์ + ไอคอนข้างในชิดขวา (ตาม ref)
            textarea ต้องไม่มีขอบ/เงา/ring ของตัวเองเลย ไม่งั้นได้กล่องซ้อนกล่องอย่างที่ user เจอ
            — `.form-textarea` ของ Paces มีขอบในตัว จึงไม่ใช้คลาสนั้นที่นี่ */}
        <div className="bg-light focus-within:border-primary border-default-200 flex min-w-0 flex-1 items-center gap-0.5 rounded-full border py-0.5 pe-1 ps-3">
          <textarea
            ref={replyBoxRef}
            rows={1}
            aria-label={replyTo ? 'พิมพ์คำตอบสาธารณะ' : 'เขียนความคิดเห็นในนามเพจ'}
            className="text-default-800 placeholder:text-default-500 min-h-9 w-0 flex-1 resize-none appearance-none border-0 bg-transparent py-2 text-sm shadow-none outline-none focus:border-0 focus:ring-0 focus:outline-none"
            placeholder={replyTo ? 'พิมพ์คำตอบ...' : `แสดงความคิดเห็นในนาม ${thread?.channel.name ?? 'เพจ'}...`}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            // enterKeyHint="enter" → คีย์บอร์ดมือถือขึ้นปุ่ม "ขึ้นบรรทัดใหม่" ให้ตรงกับสิ่งที่
            // handler ข้างล่างทำจริงบนจอสัมผัส
            enterKeyHint="enter"
            onKeyDown={(e) => {
              // Enter = ส่ง เฉพาะเดสก์ท็อป — guard ชุดนี้ **ก็อปมาทั้งดุ้นจาก ChatThread.tsx**
              // (แท็บข้อความ) โดยเจตนา ห้ามเขียนใหม่ให้ต่างออกไป: การตอบคอมเมนต์กับการตอบแชท
              // เป็นการกระทำเดียวกันในสายตาผู้ขาย ที่นี่เคยไม่มี Enter เลยทั้งที่คอมเมนต์ในไฟล์นี้
              // เขียนเองว่า "Facebook ส่งด้วย Enter" (impeccable critique 2026-08-09 P1)
              //
              // ทำไมต้องเช็คในตัว handler ไม่ใช่ตอน render: อ่าน window ตอน render = hydration mismatch
              const isTouch = window.matchMedia('(pointer: coarse)').matches
              // isComposing = กำลังเลือกคำจาก IME อยู่ Enter คือ "ยืนยันคำ" ไม่ใช่ "ส่ง"
              // บรรทัดนี้รับน้ำหนักทั้งหมดของภาษาไทย — ถอดออกแล้วผู้ใช้จะส่งคำที่ยังพิมพ์ไม่จบ
              if (e.key === 'Enter' && !e.shiftKey && !isTouch && !e.nativeEvent.isComposing) {
                // ปุ่มส่ง render เฉพาะตอนมีเนื้อหา (ดูข้างล่าง) — เงื่อนไขตรงนี้ต้องตรงกัน
                // ไม่งั้น Enter จะยิง submitReply กับฟอร์มว่างที่ปุ่มยังไม่ยอมให้กดด้วยซ้ำ
                if (sending || !(replyText.trim() || pendingFile)) return
                e.preventDefault()
                void submitReply()
              }
            }}
            disabled={sending}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
          />
          {/* ไอคอน 36px: เล็กกว่ากติกา 44px ของโปรเจกต์ แต่ pill สูง ~40px ทั้งแถบเป็นพื้นที่แตะของ
              ช่องพิมพ์อยู่แล้ว และ user สั่งตรง ๆ ให้เล็กลง ("ใหญ่เทอะทะ") — บันทึกไว้เป็นการตัดสินใจ
              ไม่ใช่ความพลาด */}
          {/* แผงอิโมจิต้องยึดกับ "ปุ่มนี้" ไม่ใช่ยึดกับแถวทั้งแถว (user report 2026-08-04
              "panel มันเพี้ยน" — ก่อนหน้านี้ relative อยู่ที่แถว แผงจึงไปเริ่มที่ขอบซ้ายสุดของแถว
              ห่างจากปุ่มที่กดไปครึ่งจอ) + align right เพราะปุ่มอยู่ชิดขวาของ pill */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setEmojiOpen((v) => !v)}
              aria-label="เลือกอิโมจิ"
              aria-expanded={emojiOpen}
              // aria-expanded ที่ไม่บอกว่า "ขยายอะไร" ทำให้ AT ประกาศสถานะลอย ๆ โดยผู้ใช้หา
              // แผงที่เปิดขึ้นมาไม่เจอ — ต้องชี้ไปที่กล่องของแผงเสมอ
              aria-controls="commentEmojiPicker"
              className="hover:bg-default-200 text-default-700 flex size-9 items-center justify-center rounded-full"
            >
              <Icon icon="mood-smile" className="text-lg" />
            </button>
            {emojiOpen && (
              <div id="commentEmojiPicker">
                <EmojiPicker
                  align="right"
                  onSelect={(emoji) => setReplyText((prev) => prev + emoji)}
                  onClose={() => setEmojiOpen(false)}
                />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending}
            aria-label="แนบรูปในคำตอบ"
            className="hover:bg-default-200 text-default-700 flex size-9 shrink-0 items-center justify-center rounded-full"
          >
            <Icon icon={uploading ? 'loader-2' : 'camera'} className={`text-lg ${uploading ? 'animate-spin' : ''}`} />
          </button>
          {(replyText.trim() || pendingFile) && (
            <button
              type="button"
              onClick={submitReply}
              disabled={sending}
              aria-label={replyTo ? 'ส่งคำตอบ' : 'ส่งความคิดเห็น'}
              className="bg-primary hover:bg-primary-hover flex size-9 shrink-0 items-center justify-center rounded-full text-white"
            >
              <Icon icon={sending ? 'loader-2' : 'send-2'} className={`text-lg ${sending ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>
      {/* BR-23 บังคับให้เตือนถาวร ห้ามเป็น toast ที่หายไป — แต่ไม่ต้องเป็นแถบสีเต็มความกว้าง
          ย้ายมาไว้ใต้ช่องพิมพ์เป็นบรรทัดเดียว text-2xs: ยังอ่านได้ตลอดเวลาที่พิมพ์ (คนมองที่ช่องพิมพ์)
          และไม่แย่งความเด่นจาก pill. คงสี warning-ink ไว้ (contrast 6.57:1 — critique P0 เดิม) */}
      <p className="text-warning-ink mt-1 flex items-center gap-1 text-2xs">
        <Icon icon="alert-triangle" width={12} height={12} className="shrink-0" />
        คอมเมนต์นี้เป็นสาธารณะ — ห้ามพิมพ์เบอร์โทรหรือที่อยู่ลูกค้า
      </p>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── รายการโพสต์ ─────────────────────────────────────────── */}
      <div
        // lg:flex-none คู่กับ flex-1 (bug user report prod 2026-08-04 "กดเข้ามาใน tab ความคิดเห็น
        // ครั้งแรก มันกว้างมาก"): ตอนยังไม่เลือกโพสต์ คลาส `flex-1` ทำให้ flex-basis เป็น 0 แล้ว
        // grow ทับความกว้าง lg:w-96 — บนมือถือคือสิ่งที่ต้องการ (รายการเต็มจอ) แต่บนเดสก์ท็อป
        // คอลัมน์บวมกินครึ่งจอ. เดิมไม่เห็นบั๊กนี้เพราะ auto-select โพสต์แรกทำให้ selectedId
        // ไม่เคยเป็น null บนเดสก์ท็อป — พอถอด auto-select ออกตามที่ user สั่ง มันจึงโผล่
        className={`border-default-200 flex min-w-0 flex-col border-e lg:flex lg:w-96 lg:shrink-0 ${
          selectedId ? 'hidden' : 'flex flex-1 lg:flex-none'
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
            {/* 🛑 `radiogroup` ไม่ใช่ `tablist` — แถวนี้เป็น "ตัวกรองที่เลือกได้ทีละอัน" ไม่ได้สลับ
                หน้าจอ. `tablist` สัญญากับ screen reader ว่ามี `tabpanel` ที่มันคุมอยู่ ซึ่งแถวนี้
                ไม่มี (panel ที่แท้จริงถูกคุมโดยแท็บสถานะข้างล่าง) AT จะประกาศ "tab 1 of 4" แล้ว
                หา panel ไม่เจอ · radiogroup + aria-checked ตรงกับสิ่งที่มันเป็นจริง และได้กติกา
                ลูกศรซ้าย/ขวามาด้วย (impeccable critique 2026-08-09 — persona Sam + Alex) */}
            <div className="bg-light flex w-full items-center gap-0.5 rounded-lg p-1" role="radiogroup" aria-label="ตัวกรองช่องทาง">
              {(['ALL', 'DEEP', 'MESSENGER', 'INSTAGRAM'] as const).map((tab, idx, arr) => {
                const active = channelTab === tab
                const display = tab === 'ALL' ? null : getChannelDisplay(tab)
                const label = tab === 'ALL' ? 'ทั้งหมด' : display!.label
                return (
                  <button
                    key={tab}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    // roving tabindex: Tab เข้ามาหยุดจุดเดียว แล้วเดินด้วยลูกศร — ไม่ใช่กด Tab
                    // ผ่านทีละ 4 ปุ่มทุกครั้งที่จะข้ามแถวนี้ไป
                    tabIndex={active ? 0 : -1}
                    onKeyDown={(e) => {
                      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
                      if (!dir) return
                      e.preventDefault()
                      const next = arr[(idx + dir + arr.length) % arr.length]!
                      setChannelTab(next)
                      const group = e.currentTarget.parentElement
                      group?.querySelectorAll<HTMLElement>('[role="radio"]')[arr.indexOf(next)]?.focus()
                    }}
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
              show={show}
              onApply={(pageId, nextShow) => {
                setChannelId(pageId)
                setShow(nextShow)
              }}
              open={filterOpen}
              onOpenChange={setFilterOpen}
            />
            {/* ชิปบอกว่ากำลังกรองเพจไหนอยู่ + กดกากบาทล้างได้ (Base: active-filter chips ของ
                InboxList.tsx:867-882) — ปุ่มตัวกรองไม่ได้โชว์ชื่อเพจบนหน้าปุ่ม ชิปจึงจำเป็น */}
            {channelId && (
              <span className="badge bg-primary/15 text-primary-ink text-2xs inline-flex items-center gap-1">
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
            **ความหมาย**ของแท็บยังเป็นของหน้านี้เอง — user สั่งชัด 2026-08-04 ว่า "ไม่ได้ให้ลอก tab
            มา ผมให้ copy style" คือยกหน้าตา ไม่ใช่ยกความหมายของปิดงาน/สแปม ซึ่งฝั่งคอมเมนต์ไม่มี
            คอลัมน์รองรับอยู่แล้ว

            feature 00038 UX-Design-Spec §3.2 — ขยาย 2 → 4 ตัว (ทั้งหมด/ยังไม่ตอบ/บอทตอบแล้ว/
            คนตอบแล้ว) คงโครง underline-tab เดิมเป๊ะ ไม่ใช่ pill ใหม่ตามที่ mockup วาด (HR6: layout
            ตามธีมปัจจุบัน ไม่ใช่ asset ดิบของ mockup) — เพิ่ม overflow-x-auto ให้แถวเลื่อนแนวนอนได้
            บนมือถือ (390px ไม่พอให้ 4 แท็บ + ตัวเลขอยู่ในบรรทัดเดียวแบบไม่ตัดคำ) + edge fade บอกว่า
            ยังเลื่อนต่อได้อีก (หนี้ #2 — ดู statusTabFade ด้านบน) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            {statusTabFade.left && (
              <div
                aria-hidden="true"
                className="from-card pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-linear-to-r to-transparent"
              />
            )}
            <div
              ref={statusTabScrollRef}
              onScroll={updateStatusTabFade}
              className="border-default-200 flex min-w-0 items-center gap-3 overflow-x-auto border-b"
              role="tablist"
              aria-label="สถานะการตอบ"
            >
          {([
            // ป้ายกลาง (ไม่ใช่ semantic color) — แท็บ "ทั้งหมด" ไม่ใช่สถานะงาน จึงไม่ควรมีสีแดง/เหลือง/
            // เขียวเหมือน 3 แท็บที่เหลือ (user report prod: ไม่มีเลขคู่กับมีเลขปนกัน ดูเหมือนโหลดไม่ครบ)
            { key: 'ALL', label: 'ทั้งหมด', icon: null, badgeClass: 'bg-default-200 text-default-700', count: counts.all },
            // ยังไม่ตอบ = แดง (ยังไม่มีใครแตะ) · บอทตอบ = เหลือง (งานกลาง ยังไม่มีคนยืนยัน —
            // ห้ามเขียว แม้ฟังดู positive, Verified-Means-Green สงวนเขียวให้สถานะที่คนยืนยันแล้ว
            // เท่านั้น) · คนตอบ = เขียว (จบงานจริง)
            // ป้ายแท็บย่อ "บอทตอบ"/"คนตอบ" (ตัด "แล้ว") ต่างจากป้ายเต็มบนแถวโพสต์/บับเบิลตั้งใจ —
            // แท็บแข่งพื้นที่กัน 4 อันในบรรทัดเดียวบนมือถือ จุดอื่นไม่แข่งพื้นที่จึงคงคำเต็มไว้
            { key: 'UNANSWERED', label: 'ยังไม่ตอบ', icon: 'alert-circle', badgeClass: 'bg-danger text-white', count: counts.unanswered },
            { key: 'BOT', label: 'บอทตอบ', icon: 'robot', badgeClass: 'bg-warning text-white', count: counts.botAnswered },
            { key: 'HUMAN', label: 'คนตอบ', icon: 'circle-check', badgeClass: 'bg-success text-white', count: counts.humanAnswered },
          ] as const).map((t, idx, arr) => {
            const on = postTab === t.key
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`commentPostTab-${t.key}`}
                // แท็บชุดนี้คุมรายการโพสต์ข้างล่างจริง ๆ จึงเป็น tablist ได้ (ต่างจากพิลล์ช่องทาง
                // ที่เป็นแค่ตัวกรอง) — ต้องชี้ไปที่ panel ให้ครบ ไม่งั้น AT ประกาศว่ามีแท็บแล้ว
                // หา panel ที่มันคุมไม่เจอ
                aria-controls="commentPostListPanel"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                onKeyDown={(e) => {
                  const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
                  if (!dir) return
                  e.preventDefault()
                  const next = arr[(idx + dir + arr.length) % arr.length]!
                  setPostTab(next.key)
                  document.getElementById(`commentPostTab-${next.key}`)?.focus()
                }}
                onClick={() => setPostTab(t.key)}
                className={`-mb-px flex shrink-0 items-center gap-1 border-b-2 px-0 py-1.5 text-sm text-nowrap ${
                  on ? 'border-primary text-primary font-semibold' : 'text-default-600 border-transparent font-medium'
                }`}
              >
                {t.icon && <Icon icon={t.icon} width={14} height={14} className="shrink-0" />}
                {t.label}
                {/* ตัวนับมาจาก `counts` ที่ server คำนวณแบบทั้งร้าน (feature 00038 หนี้ #1) ไม่คำนวณ
                    ซ้ำที่ client และไม่บวกสะสมตอน lazy-load — จอนี้เคยโชว์ "ยังไม่ตอบ 7 กับ 8"
                    พร้อมกันมาแล้วเพราะคำนวณคนละที่ ตัดที่ 99+ เหมือน badge ยังไม่อ่านของแท็บข้อความ
                    แสดงเสมอรวมกรณี 0 (user report prod: 2 ใน 4 แท็บไม่มีเลขดูเหมือนโหลดไม่ครบ —
                    0 คือข้อมูล ไม่ใช่ความว่างเปล่า ผู้ใช้ต้องแยกออกจาก "ยังโหลดไม่เสร็จ") */}
                <span
                  className={`${t.badgeClass} text-2xs flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-semibold`}
                >
                  {t.count > 99 ? '99+' : t.count}
                </span>
              </button>
            )
          })}
            </div>
            {statusTabFade.right && (
              <div
                aria-hidden="true"
                className="from-card pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-linear-to-l to-transparent"
              />
            )}
          </div>
        </div>
        </div>

        {/* panel ที่แท็บสถานะข้างบนคุมอยู่ — id นี้ถูกอ้างด้วย aria-controls ของทุกแท็บ
            aria-busy บอก screen reader ว่าเนื้อหากำลังเปลี่ยน (ก่อนหน้านี้รายการสลับเงียบสนิท) */}
        <div
          id="commentPostListPanel"
          role="tabpanel"
          aria-labelledby={`commentPostTab-${postTab}`}
          aria-busy={listBusy.busy || loadingMore || undefined}
          // relative = จุดยึดของ ListBusyOverlay (absolute inset-0) — ทับเฉพาะพื้นที่ผลลัพธ์
          // ไม่ทับหัวคอลัมน์ เพราะนั่นคือสิ่งที่ผู้ขายเพิ่งกดและกำลังจะกดต่อ
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <ListBusyOverlay busy={listBusy.busy} />
          {visiblePosts.length === 0 ? (
            <div className="p-4">
              {/* แยกกรณี "กรองแล้วไม่เจอ" ออกจาก "ยังไม่มีเลย" — ของเดิมบอกว่าไม่มีความคิดเห็น
                  ทั้งที่กรองอยู่ ทำให้เข้าใจผิดว่าระบบพัง (critique P1)
                  ต้องครอบแท็บช่องทางด้วย: กด IG/Deep ที่ยังไม่มีคอมเมนต์ไหลเข้าเลย ต้องได้คำอธิบาย
                  ว่าไม่มี "ตามตัวกรอง" ไม่ใช่ "ยังไม่มีความคิดเห็น" ลอย ๆ ซึ่งอ่านเหมือนระบบพัง */}
              {channelId || channelTab !== 'ALL' || show.postStatus !== 'ALL' || show.shopComments ? (
                <SellerEmptyState
                  compact
                  icon="search-off"
                  title="ไม่พบความคิดเห็นตามตัวกรอง"
                  description="ลองเปลี่ยนช่องทาง/เพจ/สถานะ หรือล้างตัวกรองเพื่อดูทั้งหมด"
                />
              ) : (
                <SellerEmptyState
                  compact
                  icon="message-circle"
                  title="ยังไม่มีความคิดเห็น"
                  description="เมื่อมีคนคอมเมนต์ใต้โพสต์ของเพจ จะแสดงที่นี่"
                />
              )}
              {/* 🛑 ปุ่มนี้ต้องล้าง **ทุกแกนที่กรองอยู่** ไม่ใช่แค่แกนที่บังเอิญอยู่ใกล้ตา —
                  เดิมล้างแค่ช่องทาง/เพจ ทิ้ง show.postStatus กับ show.shopComments ไว้ ผู้ใช้จึงกด
                  "ล้างตัวกรอง" แล้วรายการยังว่างอยู่เหมือนเดิม ซึ่งอ่านได้อย่างเดียวว่าระบบพัง
                  (impeccable critique 2026-08-09) เงื่อนไขที่โชว์ปุ่มก็ต้องครอบทุกแกนด้วยเช่นกัน */}
              {(channelId || channelTab !== 'ALL' || show.postStatus !== 'ALL' || show.shopComments) && (
                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setChannelTab('ALL')
                      setChannelId(null)
                      setShow((s) => ({ ...s, postStatus: 'ALL', shopComments: false }))
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
                    {/* ชื่อร้านเจ้าของโพสต์ (feature 00037) — เฉพาะโหมดรวม; ข้อความไม่ใช่ badge รูป
                        ด้วยเหตุผลเดียวกับแถวในแท็บข้อความ (รูปเพจซ้ำกันได้ระหว่างสาขา) */}
                    {unified && p.shop && (
                      <span className="text-default-500 text-2xs mt-0.5 flex items-center gap-0.5 truncate">
                        <Icon icon="building-store" className="size-3 shrink-0" />
                        <span className="truncate">{p.shop.name}</span>
                      </span>
                    )}
                    <span className="text-default-700 mt-0.5 block truncate text-2xs">
                      {p.lastCommentText
                        ? `${p.lastCommenterName ?? 'ผู้ใช้ Facebook'}: ${p.lastCommentText}`
                        : `${p.commentCount} ความคิดเห็น`}
                    </span>
                    {/* บรรทัดที่ 3 — โผล่เฉพาะแถวที่ยังมีอะไรค้าง (user สั่ง 2026-08-04, ขยาย feature
                        00038 UX-Design-Spec §3.2): ตัดสินจาก p.postStatus (ตัวที่แย่ที่สุดชนะ,
                        BR-CR-S2) ตัวเดียวกับที่แท็บใช้ — UNANSWERED โชว์ badge เดิมทั้งคู่ (ไม่แตะ)
                        · BOT_ANSWERED โชว์ badge ใหม่สีเหลืองตำแหน่งเดียวกัน · HUMAN_ANSWERED
                        ไม่โชว์อะไรเลย (โพสต์ที่จบงานแล้วไม่ควรมีป้ายค้างทุกแถวตลอดไป) */}
                    {p.postStatus === 'UNANSWERED' && (
                      /* ป้ายสองใบใต้ preview — เป็น `badge` จริงไม่ใช่ข้อความสีแดงลอย ๆ
                         (user report 2026-08-04 "ยังไม่ตอบ มันไม่เห็น label ด้วย" + ส่งภาพชิป
                         สนใจ/DEV มาเทียบ) ชุดเดียวกับชิปแท็กในรายการแชท: badge + พื้นจาง 15%
                         ป้ายเวลาแยกใบเพราะเป็นข้อมูลคนละเรื่อง (สถานะงาน vs เส้นตายของ Meta) */
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="badge bg-danger/15 text-danger-ink text-2xs inline-flex items-center gap-1">
                          <Icon icon="alert-circle" width={11} height={11} className="shrink-0" />
                          ยังไม่ตอบ
                        </span>
                        {/* เส้นตายทักแชท: มีค่า = ยังมีคอมเมนต์ค้างที่ทักได้ (นับถอยหลังอันที่ใกล้สุด)
                            null = ของที่ค้างพ้น 7 วันไปหมดแล้ว → บอกว่าทักไม่ได้แล้ว แต่ยัง
                            "ยังไม่ตอบ" อยู่ (ตอบสาธารณะใต้โพสต์ได้ตลอด)
                            เดิมบรรทัดนี้อ่าน oldestUnansweredAt ที่เป็น "เก่าสุดทั้งกอง" จึงขึ้น
                            "หมดเวลาทักแชท" ทุกแถวทั้งที่ในเธรดยังเหลือ 6 วัน — แก้ที่ service แล้ว */}
                        {p.oldestUnansweredAt ? (
                          // โทนมาจาก privateReplyWindow() ตัวเดียว — badge นี้กับข้อความในเธรด
                          // ต้องเปลี่ยนสีพร้อมกันเสมอ (HR16)
                          (() => {
                            // อ่านผลลัพธ์ครั้งเดียวแล้วใช้ทั้ง tone/expired/remaining — เดิมเรียก
                            // privateReplyWindow() สองรอบแล้ว `.replace('คงเหลือ ', '')` แกะสตริง
                            // ที่ SSOT ประกอบมาแล้ว (คำนำหน้าเปลี่ยนเมื่อไหร่ก็อ่านเป็น
                            // "ทักแชทได้อีก คงเหลือ 3 วัน" โดยไม่มีอะไรฟ้อง)
                            const w = privateReplyWindow(p.oldestUnansweredAt!)
                            // 🛑 oldestUnansweredAt มาจาก server ซึ่งเก่าได้ถึง 60 วิ ขณะที่นาฬิกา
                            // client เดินอยู่ — ในนาทีที่เส้นตายผ่านพอดี ของเดิมอ่านว่า
                            // "ทักแชทได้อีก หมดเวลาทักแชท" ซึ่งเป็นนาทีที่ข้อความนี้สำคัญที่สุด
                            if (w.expired) {
                              return (
                                <span className="badge bg-default-100 text-default-700 text-2xs inline-flex items-center gap-1">
                                  <Icon icon="clock-off" width={11} height={11} className="shrink-0" />
                                  หมดเวลาทักแชท
                                </span>
                              )
                            }
                            return (
                              <span
                                className={`badge text-2xs inline-flex max-w-full items-center gap-1 ${
                                  w.tone === 'danger' ? 'bg-danger/15 text-danger-ink' : 'bg-warning/15 text-warning-ink'
                                }`}
                              >
                                <Icon icon="clock" width={11} height={11} className="shrink-0" />
                                <span className="truncate">ทักแชทได้อีก {w.remaining}</span>
                              </span>
                            )
                          })()
                        ) : (
                          <span className="badge bg-default-100 text-default-700 text-2xs inline-flex items-center gap-1">
                            <Icon icon="clock-off" width={11} height={11} className="shrink-0" />
                            หมดเวลาทักแชท
                          </span>
                        )}
                      </span>
                    )}
                    {/* feature 00038 — บอทตอบแล้วทุกคอมเมนต์ของโพสต์นี้ แต่ยังไม่มีคนยืนยัน
                        (Verified-Means-Green: เหลืองไม่ใช่เขียว เพราะยังไม่มีมนุษย์ยืนยัน) */}
                    {p.postStatus === 'BOT_ANSWERED' && (
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="badge bg-warning/15 text-warning-ink text-2xs inline-flex items-center gap-1">
                          <Icon icon="robot" width={11} height={11} className="shrink-0" />
                          บอทตอบแล้ว
                        </span>
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.25">
                    {/* เวลาแบบสัมพัทธ์ (เมื่อกี้ / 3 ชม. / 2 วัน) — HH:MM เดิมทำให้เมื่อวานกับ
                        เมื่อครู่หน้าตาเหมือนกัน (critique P1) ตัวเดียวกับที่แท็บข้อความใช้ */}
                    <span className="text-default-700 text-2xs">
                      {p.lastCommentAt ? formatChatListTime(p.lastCommentAt) : ''}
                    </span>
                    {/* วงกลมตัวเลขท้ายแถวถูกถอดออก 2026-08-04 (user: "เอาตรงนี้ออกให้หน่อย") —
                        ข้อมูลเดียวกันอยู่ในป้าย "ยังไม่ตอบ" ใต้ preview แล้ว ตัวเลขซ้ำสองที่ในแถวเดียว
                        ทำให้ต้องอ่านสองรอบว่ามันคือเรื่องเดียวกันหรือเปล่า */}
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
        {/* 🛑 ปุ่มย้อนกลับต้องอยู่ **นอก** ternary — ไม่ว่าสถานะภายในจะเป็นอะไร ทางออกต้องมีเสมอ
            เดิมปุ่มนี้อยู่ในกิ่ง `selectedPost` truthy อย่างเดียว พอ selectedId มีค่าแต่หาโพสต์
            ไม่เจอ (โพสต์หลุดจากรายการหลัง refresh) บนจอ <1024px คอลัมน์ซ้ายถูก hidden ไปแล้ว
            และกิ่งที่ render คือกิ่งที่ไม่มีปุ่ม → ออกจากหน้าจอไม่ได้เลยนอกจากกด back ของเบราว์เซอร์
            (impeccable critique รอบ 2 · P0) */}
        {selectedId && !selectedPost && (
          <div className="border-default-200 flex shrink-0 items-center gap-3 border-b px-3 py-2 lg:hidden">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="กลับไปรายการโพสต์"
              className="hover:bg-default-100 text-default-700 flex size-11 shrink-0 items-center justify-center rounded-lg"
            >
              <Icon icon="arrow-left" className="text-lg" />
            </button>
            <span className="text-default-800 text-sm font-medium">รายการความคิดเห็น</span>
          </div>
        )}
        {!selectedPost ? (
          /* คำและโครงคู่กับคอลัมน์กลางของ /inbox ตอนยังไม่เลือกเธรด (page.tsx:283-289 —
             `card flex h-full min-w-0 flex-1 items-center justify-center` + EmptyState compact)
             อ่านเป็นประโยคคู่กัน: เลือกบทสนทนา / เลือกความคิดเห็น */
          <div className="card flex h-full min-w-0 flex-1 items-center justify-center">
            <SellerEmptyState
              compact
              icon="message-circle"
              title="เลือกความคิดเห็น"
              description="เลือกโพสต์ทางซ้ายมือเพื่อเริ่มอ่านและตอบความคิดเห็น"
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
                {/* ชื่อโพสต์เป็นลิงก์ไป Facebook แทนปุ่มแยก (user สั่ง 2026-08-04 "เอา button เปิดบน
                    facebook เปลี่ยนเป็น hyperlink ที่ชื่อคลิกแทน") — คืนพื้นที่แถวหัวให้เนื้อหา
                    ไม่มี permalink (โพสต์เก่าที่ดึง meta ไม่ได้) = ข้อความเฉย ๆ ไม่ใช่ลิงก์ตาย */}
                {selectedPost.permalink ? (
                  <a
                    href={selectedPost.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="เปิดโพสต์นี้บน Facebook"
                    className="text-default-800 hover:text-primary mb-0 flex items-center gap-1 truncate text-sm font-semibold"
                  >
                    <span className="truncate">{selectedPost.message?.trim() || 'โพสต์ไม่มีข้อความ'}</span>
                    <Icon icon="external-link" className="text-default-600 size-3.5 shrink-0" />
                  </a>
                ) : (
                  <p className="text-default-800 mb-0 truncate text-sm font-semibold">
                    {selectedPost.message?.trim() || 'โพสต์ไม่มีข้อความ'}
                  </p>
                )}
                <p className="text-default-700 mb-0 truncate text-xs">
                  {selectedPost.reactionCount ?? '–'} รีแอ็กชัน ·{' '}
                  {thread?.post.fbCommentCount ?? selectedPost.commentCount} ความคิดเห็น
                  {selectedPost.shareCount != null && ` · แชร์ ${selectedPost.shareCount}`}
                  {thread?.post.createdTime && ` · ${formatDateTH(thread.post.createdTime)}`}
                </p>
              </div>
              {/* ชิป "ยังไม่ตอบ N" ในหัวโพสต์ถูกถอดออก 2026-08-04 (user: "ยังไม่ตอบ 4 เอาออกด้วย") —
                  ตัวเลขเดียวกันอยู่บนชิปในแผงคอมเมนต์ด้านขวาและบนแถวในรายการซ้ายแล้ว */}
            </div>

            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {/* คอลัมน์ซ้าย = โพสต์เต็มความสูง (user สั่ง 2026-08-03 "อยากให้เต็มจอเลย")
                ข้อความอยู่บน สื่อกินพื้นที่ที่เหลือทั้งหมด แถวยอดชิดล่างสุดของคอลัมน์ */}
            {/* มือถือ: คอลัมน์โพสต์ยืดหยุ่นได้ (flex-1 + overflow-hidden) เพื่อยอมให้แผงคอมเมนต์
                ที่ลากปรับความสูงแล้วกินที่คืนได้ — เดิมเป็น shrink-0 สื่อจึงกินความสูงเท่าไหร่ก็ได้
                แล้วเบียดคอมเมนต์เหลือแถบเดียว (user report 2026-08-04) */}
            <div className="border-default-200 flex min-h-0 flex-1 flex-col overflow-hidden border-b lg:h-full lg:w-1/2 lg:flex-none lg:shrink lg:border-e lg:border-b-0">
              {/**
               * เนื้อโพสต์: 3 บรรทัดเป็นค่าตั้งต้น กด "ดูเพิ่มเติม" แล้วขยาย **ทับสื่อ** ไม่ใช่ดันสื่อลง
               * (user สั่ง 2026-08-04 — เจตนาคือให้คลิปได้พื้นที่คงที่)
               *
               * ทำไมต้อง render 2 ชั้น (ตัวในโฟลว์ที่ invisible + overlay): user report 2026-08-04
               * "ขนาดคลิปก่อนดูเพิ่มเติม ขยับด้วย ขนาดไม่เท่ากัน" — รอบก่อนผมย้ายกล่องข้อความทั้งก้อน
               * ไปเป็น absolute ตอนขยาย ทำให้ตัวห่อไม่มีลูกในโฟลว์เลย ความสูงจึงเหลือ 0 แล้วพื้นที่สื่อ
               * ที่เหลือโตขึ้น → คลิปที่ล็อกสัดส่วนไว้ก็โตตาม (กว้างขึ้นเห็นได้ชัด)
               * ชั้นในโฟลว์จึงต้องอยู่ตลอดเพื่อ **จองความสูงเท่าเดิม** แค่ซ่อนด้วย invisible
               * (ไม่ใช่ hidden ซึ่งจะยุบความสูงเหมือนกัน)
               */}
              <div className="relative w-full shrink-0">
                {(() => {
                  const text = selectedPost.message?.trim() ?? ''
                  const looksLong = text.length > 120 || text.split('\n').length > 3
                  return (
                    <>
                      {/* ชั้นในโฟลว์ — จองความสูงของ "3 บรรทัด + ปุ่ม" ไว้เสมอ */}
                      <div className={`w-full p-3 ${messageExpanded ? 'invisible' : ''}`} aria-hidden={messageExpanded}>
                        <p className="text-default-800 mb-0 line-clamp-3 whitespace-pre-wrap text-sm">
                          {text || 'โพสต์ไม่มีข้อความ'}
                        </p>
                        {looksLong && (
                          <button
                            type="button"
                            onClick={() => setMessageExpanded(true)}
                            tabIndex={messageExpanded ? -1 : 0}
                            className="text-primary mt-1 text-xs font-semibold hover:underline"
                          >
                            ดูเพิ่มเติม
                          </button>
                        )}
                      </div>

                      {/* ชั้นขยาย — ลอยทับสื่อ ใช้เส้นคั่นล่างไม่ใช่เงา (เงาบนกล่องกว้างเต็มคอลัมน์
                          อ่านเป็นแผ่นเทาขอบแข็ง — user report 2026-08-04) */}
                      {messageExpanded && (
                        <div className="border-default-200 bg-card absolute inset-x-0 top-0 z-10 max-h-80 w-full overflow-y-auto border-b p-3">
                          <p className="text-default-800 mb-0 whitespace-pre-wrap text-sm">
                            {text || 'โพสต์ไม่มีข้อความ'}
                          </p>
                          <button
                            type="button"
                            onClick={() => setMessageExpanded(false)}
                            className="text-primary mt-1 text-xs font-semibold hover:underline"
                          >
                            ย่อลง
                          </button>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* วิดีโอเล่นในหน้าเราผ่าน Facebook video plugin (iframe สาธารณะ ไม่ต้องใช้ token
                  และไม่ต้องมีสิทธิ์อ่านไฟล์วิดีโอ ซึ่งเป็นเหตุผลที่ก่อนหน้านี้ทำได้แค่ลิงก์ออก) */}
              {playing && isVideoPost(selectedPost.mediaType) && selectedPost.permalink ? (
                <div className="bg-default-100 flex min-h-40 w-full flex-1 items-center justify-center overflow-hidden lg:min-h-0">
                  {/* กล่องล็อกสัดส่วนตามรูปปก แล้วย่อให้พอดีกับพื้นที่ที่เหลือ (max-h-full/max-w-full)
                      — iframe จึงไม่มีวันสูง/กว้างเกินคอลัมน์ ส่วน width ที่ส่งให้ปลั๊กอินมาจากการวัด
                      กล่องจริง จึงไม่มีภาพล้นกรอบอีก */}
                  <div
                    ref={playerBoxRef}
                    style={{ aspectRatio: String(posterRatio ?? 16 / 9) }}
                    /**
                     * เดสก์ท็อป: ให้ **ความสูง** เป็นตัวคุม (h-full w-auto) แล้ว aspect-ratio คำนวณ
                     * ความกว้างตามมา — user report 2026-08-04 "พอจะกดเล่น video มันเต็มจอเฉย":
                     * เดิมคุมด้วย w-full แล้วหวังให้ max-h-full ตัด ซึ่งไม่ทำงานเมื่อคอลัมน์ยังไม่มี
                     * ความสูงที่แน่นอน (คลิปแนวตั้งอัตราส่วน ~9:16 จึงสูงเป็น 1.8 เท่าของความกว้าง
                     * แล้วดันแถวยอดตกจอ) · มือถือคอลัมน์เรียงลงมาไม่มีความสูงตายตัว จึงยังใช้ w-full
                     * ตามเดิม + ตัวห่อมี overflow-hidden กันส่วนเกินอีกชั้น
                     */
                    className="max-h-full w-full max-w-full lg:h-full lg:w-auto"
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
                  // มือถือ: ให้สื่อมีความสูงขั้นต่ำ (min-h-40) แล้วค่อยยืดตามที่เหลือ — ไม่ใช่ยุบตาม
                  // flex จนเหลือเสี้ยวเดียวเมื่อผู้ใช้ลากแผงคอมเมนต์ขึ้นสูง (user report 2026-08-04)
                  className="bg-default-100 relative block min-h-40 w-full flex-1 lg:min-h-0"
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

            {/* ที่จับลากปรับความสูง (มือถือเท่านั้น) — touch-none ให้ pointer event เป็นของเราไม่ใช่
                ของ scroller, cursor-row-resize บอกว่าลากได้ก่อนจะลอง */}
            {isNarrow && (
              <div
                role="separator"
                aria-label="ปรับความสูงของรายการความคิดเห็น"
                // 🛑 `separator` ที่ปรับค่าได้ต้องโฟกัสได้ + มีค่าให้ AT อ่าน + เดินด้วยลูกศรได้
                // เดิมมีแต่ pointer handler จึงประกาศตัวว่า "ปรับได้" กับ screen reader แล้วผู้ใช้
                // คีย์บอร์ดแตะไม่ได้เลย — สัญญาที่ทำไม่ได้แย่กว่าไม่สัญญา
                // (impeccable critique 2026-08-09 — persona Sam)
                tabIndex={0}
                aria-orientation="horizontal"
                aria-valuenow={mobilePanelH ?? Math.round(window.innerHeight * 0.45)}
                aria-valuemin={clampPanelH(0)}
                aria-valuemax={clampPanelH(Number.MAX_SAFE_INTEGER)}
                onKeyDown={(e) => {
                  // ขึ้น = สูงขึ้น (ทิศเดียวกับการลาก) · ก้าวละ 24px, Home/End ไปสุดทาง
                  const cur = mobilePanelH ?? Math.round(window.innerHeight * 0.45)
                  const step =
                    e.key === 'ArrowUp' ? 24 : e.key === 'ArrowDown' ? -24 : 0
                  if (step) {
                    e.preventDefault()
                    setMobilePanelH(clampPanelH(cur + step))
                    return
                  }
                  if (e.key === 'Home' || e.key === 'End') {
                    e.preventDefault()
                    setMobilePanelH(clampPanelH(e.key === 'Home' ? 0 : window.innerHeight))
                  }
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  dragRef.current = { startY: e.clientY, startH: mobilePanelH ?? Math.round(window.innerHeight * 0.45) }
                }}
                onPointerMove={(e) => {
                  const d = dragRef.current
                  if (!d) return
                  // ลากขึ้น = แผงสูงขึ้น (startY - clientY เป็นบวก)
                  setMobilePanelH(clampPanelH(d.startH + (d.startY - e.clientY)))
                }}
                onPointerUp={() => {
                  dragRef.current = null
                }}
                onPointerCancel={() => {
                  dragRef.current = null
                }}
                className="border-default-200 bg-light flex h-6 shrink-0 cursor-row-resize touch-none items-center justify-center border-t lg:hidden"
              >
                <span className="bg-default-400 h-1 w-10 rounded-full" aria-hidden="true" />
              </div>
            )}

            {/* ฝั่งขวา: คอมเมนต์เลื่อนเองได้ + ช่องพิมพ์ปักอยู่ล่างคอลัมน์นี้ ไม่เลื่อนหนีไปกับโพสต์ */}
            <div
              // inline style เฉพาะจอแคบ — บนเดสก์ท็อปต้องปล่อยให้คลาส lg:h-full/lg:w-1/2 ทำงาน
              // (inline style ชนะคลาสเสมอ ถ้าใส่ทุกจอจะพังเลย์เอาต์ 2 คอลัมน์)
              style={isNarrow && mobilePanelH ? { height: mobilePanelH } : undefined}
              className={`flex min-h-0 flex-col lg:h-full lg:w-1/2 ${isNarrow && mobilePanelH ? 'shrink-0' : 'flex-1'}`}
            >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="w-full p-3">
                {/* แถวจัดลำดับคอมเมนต์ — ชุดเดียวกับ Facebook (user สั่ง 2026-08-04)
                    ใช้ดรอปดาวน์ตัวเดียวไม่ใช่ชิป 4 อัน เพราะคอลัมน์นี้กว้างครึ่งเดียวของแผงขวา
                    (มือถือเต็มจอ ~360px) ชิป 4 อันตกบรรทัดแน่ — Facebook เองก็ใช้ดรอปดาวน์
                    Base: components/safepay/FilterDropdown.tsx (ตัวเดียวกับหน้าอื่นใน (paces))
                    ชิป "ยังไม่ตอบ N" แยกไว้: เป็นตัวกรองของเราเอง ไม่มีใน Facebook และเป็นเหตุผล
                    ที่ร้านเปิดหน้านี้ (critique P1 — โพสต์ไวรัลมีคอมเมนต์เป็นร้อย) */}
                {tree.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-1.5">
                    <FilterDropdown
                      icon="arrows-sort"
                      value={commentOrder}
                      onChange={(v) => setCommentOrder(v as 'RELEVANT' | 'NEWEST' | 'ALL')}
                      options={[
                        { value: 'RELEVANT', label: 'เกี่ยวข้องที่สุด' },
                        { value: 'NEWEST', label: 'ใหม่สุด' },
                        { value: 'ALL', label: 'ทั้งหมด' },
                      ]}
                    />
                    <button
                      type="button"
                      onClick={() => setUnansweredOnly(!unansweredOnly)}
                      aria-pressed={unansweredOnly}
                      className={`badge text-2xs inline-flex min-h-9 items-center gap-1 px-3 ${
                        unansweredOnly ? 'bg-danger text-white' : 'bg-danger/15 text-danger-ink'
                      }`}
                    >
                      <Icon icon="alert-circle" width={12} height={12} />
                      ยังไม่ตอบ {tree.reduce((n, t) => n + t.unansweredHere, 0)}
                    </button>
                  </div>
                )}
              {loadingThread && !thread ? (
                <CommentsThreadSkeleton />
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
                      privateReplySendingId={sendingPrivateReplyId}
                      onOpenPrivateReply={openPrivateReplyModal}
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
                            privateReplySendingId={sendingPrivateReplyId}
                            onOpenPrivateReply={openPrivateReplyModal}
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

      {/* โมดัลฟอร์ม "ทักแชท" (feature 00038 Task 8, rework จาก Swal — user report prod "UI Modal
          แย่มาก") — position: fixed จึงไม่ต้องอยู่ใกล้ trigger ในทรี, mount เฉพาะตอนมีคอมเมนต์ที่
          กำลังกรอกอยู่เท่านั้น (unmount = ปิด ไม่ใช่ toggle visibility) */}
      {privateReplyComment && (
        <PrivateReplyModal
          fromName={privateReplyComment.fromName}
          defaultValue={
            channels.find((ch) => ch.id === selectedPost?.channel.id)?.commentPrivateReplyText ?? ''
          }
          sending={sendingPrivateReplyId === privateReplyComment.id}
          onClose={() => setPrivateReplyComment(null)}
          onSend={handlePrivateReplySend}
        />
      )}
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
  privateReplySendingId = null,
  onOpenPrivateReply,
}: {
  c: CommentItem
  channel?: { name: string; avatarUrl: string | null; provider: string }
  onReply: () => void
  isReply?: boolean
  /** มีคำตอบของเพจอยู่ข้างใต้แล้ว — ไม่งั้นผู้ขายต้องจำเองว่าตอบอันไหนไปแล้ว (critique P1) */
  answered?: boolean
  /** คอมเมนต์ที่ช่องพิมพ์กำลังจ่อตอบอยู่ (user สั่ง 2026-08-04 "ใส่สีฟ้าอ่อน ๆ พื้นหลังให้ด้วย") */
  active?: boolean
  /** feature 00038 Task 8 — commentId ที่กำลังส่ง private reply อยู่ (derive สถานะ SENDING) */
  privateReplySendingId?: string | null
  /** feature 00038 Task 8 — เปิดโมดัลยืนยันทักแชท */
  onOpenPrivateReply: (c: CommentItem) => void
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
  // feature 00038 Task 8 — ปุ่มไม่ render เลยเมื่อ isFromPage/isDeleted (UX-Design-Spec §2.5) เหมือน
  // เดิม; ไม่ผูกกับสวิตช์อัตโนมัติ (D-6/BR-CR-15) — render เสมอไม่ว่าสวิตช์ B จะเปิดหรือปิด
  const privateReplyState =
    c.isFromPage || c.isDeleted ? null : resolvePrivateReplyState(c, privateReplySendingId)

  /**
   * กดที่แถวคอมเมนต์ = เตรียมช่องตอบให้เลย (user สั่ง 2026-08-04: "ยังไม่ auto reply เวลากดเข้า
   * comment list นั้น") — ผูกเป้าหมายการตอบ + โฟกัสช่องพิมพ์ในจังหวะเดียว ไม่ต้องเล็งปุ่ม "ตอบ"
   * ตัวเล็กใต้บับเบิล (บนมือถือปุ่มนั้นเล็กกว่า 44px ตามแถวเครื่องมือของ Facebook อยู่แล้ว)
   *
   * ข้ามคลิกที่ตกบนปุ่ม/ลิงก์ข้างใน (ปุ่ม "ตอบ" มี onClick ของตัวเองอยู่แล้ว — ปล่อยให้ bubble มาถึง
   * ที่นี่จะสั่งซ้ำอีกรอบ) · คอมเมนต์ที่ถูกลบไม่มีอะไรให้ตอบ
   *
   * ยังเก็บปุ่ม "ตอบ" ไว้ ไม่ทำ div นี้เป็น role="button": ปุ่มคือทางของคีย์บอร์ด/screen reader
   * (โฟกัสได้อยู่แล้ว) ส่วนการกดทั้งแถวเป็นทางลัดของเมาส์/นิ้ว — ยัด role ทับ div ที่มีปุ่มซ้อนอยู่
   * ข้างในจะได้ nested interactive ที่ a11y ตีว่าผิดแทน
   */
  const startReplyFromRow = (e: React.MouseEvent<HTMLDivElement>) => {
    if (c.isDeleted) return
    // 🛑 ลากคัดลอกข้อความในคอมเมนต์ต้องไม่ถูกตีเป็น "กดเพื่อตอบ" — `click` ยิงหลัง drag-select
    // ที่เริ่มและจบในอิลิเมนต์เดียวกันเสมอ แล้ว onReply() → useEffect โฟกัสช่องพิมพ์ ซึ่ง
    // **ยุบ selection ทิ้ง** ผู้ขายจึงคัดเบอร์โทร/ที่อยู่ออกจากคอมเมนต์ไม่ได้เลย ทั้งที่การคัด
    // ข้อมูลลูกค้าจากคอมเมนต์ไปสร้างออเดอร์คืองานหลักของ social commerce ไทย (PRODUCT.md
    // §Operating Context) — impeccable critique 2026-08-09 P1
    if (!window.getSelection()?.isCollapsed) return
    if ((e.target as HTMLElement).closest('button, a')) return
    onReply()
  }

  return (
    <div
      className={`flex items-start gap-2 ${c.isDeleted ? '' : 'cursor-pointer'}`}
      data-comment-id={c.id}
      onClick={startReplyFromRow}
    >
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
            {/* feature 00038 Task 9 — บอทกับคนตอบเป็นคนละความหมาย ป้ายจึงแยกกัน (mutually
                exclusive): isAutoReply=true มาจากระบบตอบอัตโนมัติ ไม่ใช่คนในทีมร้าน จึงไม่ใช่
                "ผู้ดูแลเพจ" — ใช้ inline-text pattern เดิม (ไอคอน+ข้อความ text-2xs ข้างชื่อ) ไม่ใช่
                AutoReplyTag.tsx เต็มรูป เพราะไม่มี trace data ให้กาง (ข้อความคงที่ ไม่มีกลุ่มคำ
                แบบ 00023) popup ที่กดแล้วว่างเปล่าแย่กว่าไม่มี popup (UX-Design-Spec §3, decision #4)
                สี warning-ink ตัวเดียวกับ badge "บอทตอบแล้ว" — Verified-Means-Green ห้ามเขียว
                เพราะยังไม่มีมนุษย์ยืนยัน */}
            {c.isFromPage &&
              (c.isAutoReply ? (
                <span className="text-warning-ink inline-flex items-center gap-0.5 text-2xs font-medium">
                  <Icon icon="robot" className="text-2xs" />
                  ตอบอัตโนมัติ
                </span>
              ) : (
                <span className="text-primary inline-flex items-center gap-0.5 text-2xs font-medium">
                  <Icon icon="pencil" className="text-2xs" />
                  ผู้ดูแลเพจ
                </span>
              ))}
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
        <div className="text-default-700 mt-0.5 flex flex-wrap items-center gap-3 ps-3 text-xs">
          <span title={formatDateTimeTH(c.createdTime)}>{commentTimeLabel(c.createdTime)}</span>
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
          {/* ปุ่ม "ทักแชท" 4 สถานะ (feature 00038 Task 8, UX-Design-Spec §2) — Meta ให้ทักแชทจาก
              คอมเมนต์ได้ภายใน 7 วันนับจากเวลาที่ลูกค้าคอมเมนต์ พ้นแล้วทักไม่ได้อีกเลย ผู้ขายต้อง
              เห็นตัวเลขตอนกำลังตัดสินใจ ไม่ใช่ไปรู้ตอนกดแล้วโดน Meta ปฏิเสธ (มาจากคอมเมนต์เดิม
              ก่อนหน้านี้ ตอนนี้ปุ่มกดได้จริงแล้ว ปิดหนี้ที่ค้างจาก feature 00029) */}
          {privateReplyState === 'AVAILABLE' && (
            <>
              <button
                type="button"
                onClick={() => onOpenPrivateReply(c)}
                className="btn btn-sm border-default-300 text-default-800 hover:border-default-400 inline-flex items-center gap-1 border"
              >
                <Icon icon="message-reply" className="text-sm" />
                ทักแชท
              </button>
              {chatWindow && (
                // สีเดียวกับ badge บนแถวโพสต์เสมอ (privateReplyWindow().tone) — เดิมตรงนี้ hardcode
                // danger จึงแดงตั้งแต่ยังเหลือเกือบ 7 วัน
                <span
                  className={chatWindow.tone === 'danger' ? 'text-danger-ink font-semibold' : 'text-warning-ink font-medium'}
                  title={`ทักแชทส่วนตัวได้ภายใน 7 วันนับจากเวลาคอมเมนต์ (${formatDateTimeTH(c.createdTime)})`}
                >
                  {chatWindow.text}
                </span>
              )}
            </>
          )}
          {privateReplyState === 'SENDING' && (
            <button
              type="button"
              disabled
              className="btn btn-sm bg-default-200 text-default-500 inline-flex items-center gap-1 cursor-not-allowed"
            >
              <span className="border-default-500 size-3 inline-block animate-spin rounded-full border-2 border-t-transparent" />
              กำลังส่ง...
            </button>
          )}
          {/* 🛑 SENT/EXPIRED เป็น **badge ไม่ใช่ปุ่ม** — ทั้งคู่ไม่มีวันกดได้: "ทักแล้ว" คือ
              ข้อเท็จจริงในอดีต ส่วน "หมดเวลา" คือสภาพถาวร. เดิมเป็น <button disabled> ทั้งคู่
              ทำให้เธรดที่จัดการครบแล้วเต็มไปด้วยปุ่มเทาที่ตายแล้ว = อ่านว่า "ถูกห้าม" แทนที่จะเป็น
              "เสร็จแล้ว" · และ disabled ถอดมันออกจากลำดับคีย์บอร์ด/interactive tree ของ screen
              reader ด้วย ทั้งที่เวลาที่ทักไปแล้วมีอยู่แค่ตรงนี้ที่เดียว
              (impeccable critique 2026-08-09 P2) */}
          {privateReplyState === 'SENT' && (
            <>
              {/* เขียวถูกต้องที่นี่ตาม Verified-Means-Green: มนุษย์เป็นคนกดส่งและ Meta รับแล้วจริง
                  (ต่างจาก "บอทตอบแล้ว" ซึ่งยังไม่มีคนยืนยัน จึงเป็นเหลือง) */}
              <span
                className="badge bg-success/15 text-success-ink text-2xs inline-flex items-center gap-1"
                title={`ทักแชทส่วนตัวไปแล้วเมื่อ ${formatDateTimeTH(c.privateReplySentAt)}`}
              >
                <Icon icon="circle-check" width={11} height={11} className="shrink-0" />
                ทักแล้ว · {commentTimeLabel(c.privateReplySentAt)}
              </span>
              {c.privateReplyConversationId && (
                // ขั้นถัดไปหลังทักสำเร็จ ต้องไม่ใช่สิ่งที่มองเห็นยากที่สุดบนแถว — เดิมเป็นข้อความ
                // ขีดเส้นใต้ 12px ที่แยกไม่ออกจากปุ่ม "ตอบ" ข้าง ๆ
                <Link
                  href={`/inbox/${c.privateReplyConversationId}`}
                  className="btn btn-sm border-default-300 text-default-800 hover:border-default-400 inline-flex items-center gap-1 border"
                >
                  <Icon icon="message-2" className="text-sm" />
                  เปิดห้องแชท
                </Link>
              )}
            </>
          )}
          {privateReplyState === 'EXPIRED' && (
            <span
              className="badge bg-default-100 text-default-700 text-2xs inline-flex items-center gap-1"
              title="Facebook ให้ทักแชทส่วนตัวจากคอมเมนต์ได้ภายใน 7 วันเท่านั้น — ตอบสาธารณะใต้คอมเมนต์ยังทำได้ตลอด"
            >
              <Icon icon="clock-off" width={11} height={11} className="shrink-0" />
              หมดเวลาทักแชท
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
