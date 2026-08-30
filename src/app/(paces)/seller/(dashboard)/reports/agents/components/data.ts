/**
 * data.ts — ชนิดข้อมูลและตัวช่วยแสดงผลของรายงานผลงานแอดมิน (feature 00059)
 *
 * แพตเทิร์นเดียวกับ `orders/components/data.ts` / `customers/components/data.ts`:
 * ชนิดที่ข้ามเส้น RSC → client ต้องอยู่ที่นี่ไฟล์เดียว และต้อง **serialize ได้ทั้งหมด**
 * (ห้ามมีฟังก์ชัน/Date ที่ไม่ได้แปลง — feedback_rsc_props_must_be_serializable)
 */
import { getChannelLabel } from '@/lib/chat-channel'

/** หนึ่งแถวของตารางจัดอันดับ — ตัวเลขทุกตัวถูกคำนวณมาแล้วจาก service */
export type LeaderboardRow = {
  agentUserId: string
  displayName: string
  avatar: string | null
  isCurrentMember: boolean
  conversations: number
  qualifiedConversations: number
  convertedConversations: number
  conversionRatePct: number | null
  ordersCreated: number
  /** null = ผู้ใช้คนนี้ไม่มีสิทธิ์เห็นตัวเลขเงิน (ถูกตัดที่ขอบ response แล้ว) */
  revenue: number | null
  firstResponseAvgSec: number | null
  firstResponseMedianSec: number | null
  responseAvgSec: number | null
  responseMedianSec: number | null
  responseSampleCount: number
  slaPct: number | null
  slaRequired: number
  slaWithin: number
  timeToCloseAvgSec: number | null
  /* กรวย "ตอบแชท → เปิดบิล" — ตอบคำถามว่าคนนี้คุยแล้วไปจนถึงเปิดบิลเองได้ไหม */
  repliedConversations: number
  conversationsWithOrder: number
  conversationsWithClosedOrder: number
  /** บิลบนเธรดที่เขาตอบ ซึ่งคนอื่นเป็นเจ้าของเครดิต — >0 คู่กับ ordersCreated=0 คือสัญญาณ */
  ordersCreatedByOthers: number
}

export type BreakdownRow = {
  conversationId: string
  customerName: string
  channel: string
  source: 'ADS' | 'SHORTLINK' | 'DIRECT'
  assignedAgentName: string | null
  startedAtISO: string
  firstResponseSec: number | null
  durationSec: number
  orderNo: string | null
  orderValue: number | null
  result: 'CONVERTED' | 'PENDING' | 'NOT_CONVERTED'
}

/** ป้ายผลของเธรด — คำที่ใช้อยู่แล้วในระบบ ไม่ตั้งศัพท์ใหม่ */
export const RESULT_LABEL: Record<BreakdownRow['result'], string> = {
  CONVERTED: 'ปิดการขายได้',
  PENDING: 'รอชำระ/ยังไม่ยืนยัน',
  NOT_CONVERTED: 'ยังไม่มีคำสั่งซื้อ',
}

/** สีของป้ายผล — token ตามความหมาย (เขียว = สำเร็จจริง ตาม Verified-Means-Green) */
export const RESULT_TONE: Record<BreakdownRow['result'], string> = {
  CONVERTED: 'bg-success/15 text-success-ink',
  PENDING: 'bg-warning/15 text-warning-ink',
  NOT_CONVERTED: 'bg-default-200 text-default-700',
}

export const SOURCE_LABEL: Record<BreakdownRow['source'], string> = {
  ADS: 'จากโฆษณา',
  SHORTLINK: 'จากลิงก์',
  DIRECT: 'ทักเข้ามาเอง',
}

/** ชื่อช่องทาง — ผ่าน SSOT เดิมของระบบเสมอ ห้ามพิมพ์ 'Messenger' เองที่นี่ (Hard Rule 16) */
export const channelLabel = (channel: string) => getChannelLabel(channel)
