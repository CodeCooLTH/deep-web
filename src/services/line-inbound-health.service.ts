// (00025 ส่วนขยาย 2026-08-12) — บันทึกว่า "event ขาเข้าถูกปฏิเสธ" เพื่อให้มีหลักฐานให้อ่านทีหลัง
//
// 🛑 ทำไมต้องมีไฟล์นี้: webhook ของ LINE **ต้องตอบ HTTP 200 ทุกกรณี** (BR-LINE-05/06, TC-04
// [ห้ามข้าม]) รวมตอนลายเซ็นไม่ผ่านและตอนหา destination ไม่เจอ — เปลี่ยนเป็น 4xx ไม่ได้เพราะ LINE
// จะไล่ retry คำขอที่ยังไงก็ไม่ผ่าน ⇒ ทั้งสองเส้นทางเดิมจึงเหลือแค่ `console.warn` แล้วจบ
// และ Vercel plan นี้ query runtime log ย้อนหลังไม่ได้ ⇒ log ที่อ่านย้อนหลังไม่ได้ = ไม่มีค่า
//
// ผลคือขาเข้าตายได้เงียบสนิทถาวรโดยไม่มีสถานะ ไม่มี error และอาการที่ร้านสัมผัสได้คือ
// "วันนี้ลูกค้าเงียบจัง" ซึ่งหน้าตาเหมือน "ไม่มีอะไรเกิดขึ้น" ทุกประการ

import { prisma } from '@/lib/prisma'
import { INBOUND_FAIL_WRITE_THROTTLE_MS } from '@/lib/line/constants'

export type LineInboundFailReason = 'SIGNATURE_MISMATCH' | 'DESTINATION_NOT_FOUND'

/**
 * จดว่าช่องทางนี้เพิ่งปฏิเสธ event ขาเข้า
 *
 * 🛑 **throttle เป็นด่านความปลอดภัย ไม่ใช่การประหยัด write** — คำขอที่ลายเซ็นไม่ผ่านคือคำขอที่
 * ยังไม่ผ่านการยืนยันตัวตน (ลายเซ็นเป็น auth เพียงอย่างเดียวของ route นั้น) ถ้าไม่ throttle
 * ใครที่รู้ `destination` จะยิงรัวให้เราเขียน DB รัวตามได้ทันที
 *
 * ห้าม throw — ผู้เรียกอยู่บนเส้นทางที่ต้องตอบ 200 ให้ LINE เสมอ
 */
export async function recordLineInboundFailure(
  channelId: string,
  reason: LineInboundFailReason,
  now: Date = new Date(),
): Promise<void> {
  try {
    const throttleFloor = new Date(now.getTime() - INBOUND_FAIL_WRITE_THROTTLE_MS)
    await prisma.shopChannel.updateMany({
      // เขียนเฉพาะเมื่อครั้งล่าสุดเก่ากว่าเพดาน throttle (หรือยังไม่เคยเขียนเลย) — เงื่อนไขอยู่ใน
      // WHERE ไม่ใช่อ่านมาเทียบใน JS เพื่อให้ atomic ต่อคำขอที่เข้ามาพร้อมกัน
      where: {
        id: channelId,
        OR: [{ lineLastInboundFailAt: null }, { lineLastInboundFailAt: { lt: throttleFloor } }],
      },
      data: {
        lineLastInboundFailAt: now,
        lineLastInboundFailReason: reason,
        lineInboundFailCount: { increment: 1 },
      },
    })
  } catch (e) {
    console.error('[line-inbound-health] บันทึกความล้มเหลวไม่สำเร็จ', e instanceof Error ? e.message : e)
  }
}

/**
 * ลายเซ็นผ่าน = **พิสูจน์แล้วว่า channel secret ถูกต้อง** ⇒ ล้างประวัติความล้มเหลวทิ้ง
 *
 * เรียกเฉพาะเมื่อ `currentCount > 0` เท่านั้น (ผู้เรียกเช็คให้) — ไม่งั้นทุกข้อความที่เข้ามาปกติ
 * จะกลายเป็น UPDATE เปล่า ๆ หนึ่งครั้ง
 */
export async function clearLineInboundFailure(channelId: string): Promise<void> {
  try {
    await prisma.shopChannel.update({
      where: { id: channelId },
      data: { lineInboundFailCount: 0, lineLastInboundFailAt: null, lineLastInboundFailReason: null },
    })
  } catch (e) {
    console.error('[line-inbound-health] ล้างตัวนับไม่สำเร็จ', e instanceof Error ? e.message : e)
  }
}

/**
 * นับกรณี `destination` หาช่องทางไม่เจอ — **ไม่มีแถวให้เขียน** (นั่นคือนิยามของมัน)
 * เก็บเป็นตัวนับระดับ process บน `globalThis` แบบเดียวกับ rate-limit ของโปรเจกต์นี้
 *
 * 🛑 ตัวเลขนี้ต่อ instance ไม่ใช่ทั้งระบบ (Vercel serverless) — ใช้บอก "เพิ่งมีเข้ามาไหม"
 * ในหน้าต่างสั้น ๆ ของปุ่มทดสอบเท่านั้น ห้ามเอาไปทำสถิติ
 */
interface DestinationMissStore {
  lastAt: number | null
  count: number
}
const destinationMiss: DestinationMissStore = ((globalThis as Record<string, unknown>).__lineDestinationMiss ??= {
  lastAt: null,
  count: 0,
}) as DestinationMissStore

export function recordLineDestinationMiss(nowMs: number = Date.now()): void {
  destinationMiss.lastAt = nowMs
  destinationMiss.count += 1
}

export function readLineDestinationMiss(): Readonly<DestinationMissStore> {
  return destinationMiss
}
