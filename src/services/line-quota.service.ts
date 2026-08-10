// (S-9, feature 00025 TFR-LINE-07 / SDS TD-006) — อ่านและ cache โควตาข้อความ LINE
//
// cache อยู่บนแถว ShopChannel เอง (quotaValue/quotaUsed/quotaFetchedAt) ไม่ใช่ตารางใหม่ — TTL 5 นาที
//
// 🛑 หลักการที่ห้ามกลับทิศ (TD-006): **อ่านโควตาไม่ได้ ต้องไม่บล็อกการส่ง**
//    การบล็อกด้วยข้อมูลที่เราอ่านไม่ได้ = ระบบเราล่มแล้วร้านตอบลูกค้าไม่ได้ ซึ่งแย่กว่าปล่อยให้ LINE
//    ปฏิเสธเอง (ซึ่งมีเส้นทาง error รองรับอยู่แล้วใน channel-chat.service.ts)
//
// 🛑 ทุกฟังก์ชันที่ "เขียน cache" ในไฟล์นี้กลืน error ของตัวเองทั้งหมดโดยตั้งใจ — มันเป็นงานบัญชี
//    ข้างเคียง ไม่ใช่ผลลัพธ์ที่ผู้ใช้ขอ การทำให้การส่งที่สำเร็จไปแล้วกลายเป็น error เพราะเขียน cache
//    ไม่ผ่าน คือการเปลี่ยนความสำเร็จเป็นความล้มเหลวด้วยมือตัวเอง

import { prisma } from '@/lib/prisma'
import { decryptToken } from '@/lib/token-crypto'
import { fetchLineQuota } from '@/lib/channels/line-adapter'
import {
  classifyLineQuota,
  computeLineQuotaRemaining,
  isLineQuotaCacheFresh,
  type LineQuotaLevel,
  type LineQuotaRead,
} from '@/lib/line/quota'

/** ฟิลด์ขั้นต่ำที่ต้องมีเพื่ออ่านโควตา — รับเป็นแถวที่ผู้เรียกมีอยู่แล้ว (เส้นทางกดส่งโหลด
 *  `conversation.shopChannel` มาครบอยู่แล้ว) เพื่อไม่ให้เสีย query ซ้ำโดยไม่จำเป็น */
export interface LineQuotaChannelRow {
  id: string
  accessTokenEnc: string
  quotaValue: number | null
  quotaUsed: number | null
  quotaFetchedAt: Date | null
}

/** สิ่งที่ทั้ง route (API.md §4.4) และเส้นทางกดส่งใช้ร่วมกัน */
export interface LineQuotaSnapshot {
  /** `unknown` = อ่านไม่สำเร็จและไม่มีค่า cache เลย — ห้ามตีความว่าโควตาหมด */
  type: 'limited' | 'unlimited' | 'unknown'
  total: number | null
  used: number | null
  /** ค่าโดยประมาณ (คลาดเคลื่อนได้ถึง 5 นาทีตาม TTL) — ห้ามใช้เป็นตัวเลขทางการเงิน */
  remaining: number | null
  level: LineQuotaLevel
  fetchedAt: Date | null
  /** true = ค่าที่คืนมาไม่ได้เพิ่งอ่านจาก LINE สำเร็จ (ใช้ค่าเก่า หรือไม่มีค่าเลย) */
  stale: boolean
}

function toSnapshot(read: LineQuotaRead, fetchedAt: Date | null, stale: boolean): LineQuotaSnapshot {
  const level = classifyLineQuota(read)
  if (read.kind === 'LIMITED') {
    return {
      type: 'limited',
      total: read.total,
      used: read.used,
      remaining: computeLineQuotaRemaining(read.total, read.used),
      level,
      fetchedAt,
      stale,
    }
  }
  return {
    type: read.kind === 'UNLIMITED' ? 'unlimited' : 'unknown',
    total: null,
    used: null,
    remaining: null,
    level,
    fetchedAt,
    stale,
  }
}

/**
 * แปลงค่าที่ cache ไว้บนแถวกลับเป็น "ผลการอ่าน"
 *
 * 🛑 กติกาการตีความคอลัมน์ที่ต้องอ่านคู่กันเสมอ ห้ามดูทีละคอลัมน์:
 *   - `quotaFetchedAt = null`                  → ยังไม่เคยอ่านสำเร็จเลย = UNKNOWN
 *   - `quotaFetchedAt != null, quotaValue = null` → เคยอ่านสำเร็จ และผลคือ "ไม่จำกัด"
 *   - `quotaFetchedAt != null, quotaValue != null` → เคยอ่านสำเร็จ และมีเพดานจริง
 * (คอมเมนต์ใน schema.prisma เขียนไว้ว่า "NULL = ยังไม่เคยอ่าน" ซึ่งจริงเฉพาะเมื่อดูคู่กับ
 *  quotaFetchedAt — คอลัมน์ quotaValue ตัวเดียวแยก "ไม่จำกัด" กับ "ไม่รู้" ไม่ได้)
 */
function readFromCache(row: LineQuotaChannelRow): LineQuotaRead {
  if (!row.quotaFetchedAt) return { kind: 'UNKNOWN' }
  if (row.quotaValue === null) return { kind: 'UNLIMITED' }
  return { kind: 'LIMITED', total: row.quotaValue, used: row.quotaUsed ?? 0 }
}

async function writeCache(channelId: string, read: LineQuotaRead, fetchedAt: Date): Promise<void> {
  try {
    await prisma.shopChannel.update({
      where: { id: channelId },
      data: {
        quotaValue: read.kind === 'LIMITED' ? read.total : null,
        quotaUsed: read.kind === 'LIMITED' ? read.used : null,
        quotaFetchedAt: fetchedAt,
      },
    })
  } catch (e) {
    console.warn('[line-quota] เขียน cache โควตาไม่สำเร็จ', e instanceof Error ? e.message : e)
  }
}

/**
 * อ่านโควตาของช่องทาง LINE หนึ่งช่อง — ใช้ cache ถ้ายังไม่หมดอายุ (ไม่ยิง LINE ซ้ำภายใน 5 นาที)
 *
 * ไม่โยน error ในทุกกรณี (สัญญาของ API.md §4.4: "อ่านจาก LINE ไม่สำเร็จ → คืน 200 พร้อม stale:true
 * ห้ามคืน 5xx") — อ่านไม่ได้แล้วมีค่าเก่าอยู่ ให้คืนค่าเก่าพร้อม `stale: true` เพื่อให้หน้าจอยัง
 * บอกอะไรได้บ้าง ไม่ใช่ว่างเปล่า
 */
export async function getLineQuota(
  channel: LineQuotaChannelRow,
  opts: { now?: number; forceRefresh?: boolean } = {},
): Promise<LineQuotaSnapshot> {
  const nowMs = opts.now ?? Date.now()

  if (!opts.forceRefresh && isLineQuotaCacheFresh(channel.quotaFetchedAt, nowMs)) {
    return toSnapshot(readFromCache(channel), channel.quotaFetchedAt, false)
  }

  try {
    const read = await fetchLineQuota({ provider: 'LINE', accessToken: decryptToken(channel.accessTokenEnc) })
    const fetchedAt = new Date(nowMs)
    await writeCache(channel.id, read, fetchedAt)
    return toSnapshot(read, fetchedAt, false)
  } catch (e) {
    // 🛑 feature ที่ fail เงียบ ต้องมี console.error/warn เสมอ (บทเรียน iShip check-price ที่พังเงียบ
    // บน prod อยู่หลายสัปดาห์โดยไม่มีใครเห็น) — ที่นี่ไม่ throw ต่อ แต่ต้องมีร่องรอยให้ตามได้
    console.warn('[line-quota] อ่านโควตาจาก LINE ไม่สำเร็จ — ใช้ค่าเดิม/ไม่ทราบแทน', {
      channelId: channel.id,
      reason: e instanceof Error ? e.message : String(e),
    })
    return toSnapshot(readFromCache(channel), channel.quotaFetchedAt, true)
  }
}

/**
 * ส่ง push สำเร็จ 1 คำขอ = โควตาถูกหัก 1 (TFR-LINE-07 "ลด quotaUsed ในหน่วยความจำได้เลย +1")
 *
 * 🛑 นับเป็น "ต่อคำขอ" ไม่ใช่ "ต่อชิ้นข้อความ" — LINE นับ 1 push (ที่มีได้ถึง 5 message object)
 * เป็น 1 ข้อความต่อผู้รับ (BR-LINE-12) ผู้เรียกต้องเรียกฟังก์ชันนี้ครั้งเดียวต่อการยิง 1 ครั้ง
 *
 * ใช้ `updateMany` + เงื่อนไข `quotaValue: { not: null }` เพื่อไม่ให้ไปสร้างตัวเลขขึ้นมาเองสำหรับ
 * ช่องที่ยังไม่เคยอ่านโควตา (ถ้าเพิ่ม used โดยไม่มี total ก็ยังคำนวณอะไรไม่ได้อยู่ดี แต่จะกลายเป็น
 * ตัวเลขที่ดูเหมือนของจริงโดยไม่มีที่มา) — แถวที่ไม่เข้าเงื่อนไขจะถูกข้ามเงียบ ๆ ตามตั้งใจ
 */
export async function noteLinePushConsumed(channelId: string): Promise<void> {
  try {
    await prisma.shopChannel.updateMany({
      where: { id: channelId, quotaValue: { not: null }, quotaUsed: { not: null } },
      data: { quotaUsed: { increment: 1 } },
    })
  } catch (e) {
    console.warn('[line-quota] นับโควตาที่ใช้ไปไม่สำเร็จ', e instanceof Error ? e.message : e)
  }
}

/**
 * LINE ปฏิเสธเพราะโควตา ทั้งที่ cache ฝั่งเราบอกว่าเหลือ → ค่าที่เก็บไว้ผิดแน่นอน
 *
 * ล้างเฉพาะ `quotaFetchedAt` (ไม่แตะตัวเลข) เพื่อบังคับให้การอ่านครั้งถัดไปยิงไปถาม LINE ใหม่ —
 * 🛑 ห้ามเดาค่าใหม่เอง (เช่นตั้ง used = value) เพราะเราไม่รู้ว่า LINE ปฏิเสธด้วยเหตุโควตารายเดือนหมด
 * หรือชน rate limit ชั่วคราว — ทั้งสองกรณีมาเป็น HTTP 429 เหมือนกัน (ดู classifyLineOutboundError)
 */
export async function invalidateLineQuota(channelId: string): Promise<void> {
  try {
    await prisma.shopChannel.update({ where: { id: channelId }, data: { quotaFetchedAt: null } })
  } catch (e) {
    console.warn('[line-quota] ล้าง cache โควตาไม่สำเร็จ', e instanceof Error ? e.message : e)
  }
}
