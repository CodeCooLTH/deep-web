// (00025 ส่วนขยาย 2026-08-12, FR-CH-02) — งานรายวันที่ตรวจว่า access token ของแต่ละ OA
// ยังใช้ได้อยู่ไหม และเหลืออีกกี่วันก่อนหมดอายุ
//
// เหตุผลที่ต้องมี: ตอนเชื่อมเราตรวจครั้งเดียว หลังจากนั้นไม่มีอะไรตรวจซ้ำเลย ⇒ ร้านที่วาง token
// แบบ 30 วันจะรู้ว่ามันตายก็ต่อเมื่อกดส่งข้อความหาลูกค้าแล้วไม่ออก ซึ่งคือนาทีที่แย่ที่สุด

import { prisma } from '@/lib/prisma'
import { decryptToken } from '@/lib/token-crypto'
import { probeLineToken } from '@/lib/line/health-probe'
import { markChannelTokenInvalid } from './shop-channel.service'
import { pushLineTokenExpiring } from './seller-push.service'
import { TOKEN_EXPIRY_ALERT_DAYS } from '@/lib/line/constants'
import { daysUntilTokenExpiry } from '@/lib/line/channel-health'

export interface LineTokenSweepResult {
  checked: number
  invalidated: number
  warned: number
  failed: number
}

/**
 * เกณฑ์ที่ "เพิ่งถูกข้าม" ในรอบนี้ — คืน `null` ถ้ายังไม่ข้ามเกณฑ์ไหนใหม่
 *
 * 🛑 เทียบ "วันนี้เหลือกี่วัน" กับ "รอบก่อนเหลือกี่วัน" แทนการจำว่าเคยเตือนไปแล้วหรือยัง
 * เพราะการจำต้องมีคอลัมน์เพิ่มอีกตัว และคอลัมน์นั้นจะผิดทันทีที่ร้านเปลี่ยน token กลางคัน
 * (เหลือ 3 วัน → วาง token ใหม่ 30 วัน → เกณฑ์ต้องเริ่มนับใหม่ทั้งชุด ซึ่งวิธีนี้ได้ฟรี)
 */
export function crossedAlertThreshold(daysLeftNow: number, daysLeftBefore: number | null): number | null {
  for (const t of TOKEN_EXPIRY_ALERT_DAYS) {
    // ข้ามเกณฑ์ = วันนี้ถึงแล้ว แต่รอบก่อนยังไม่ถึง (รอบก่อนไม่รู้ = ถือว่ายังไม่เคยเตือน)
    if (daysLeftNow <= t && (daysLeftBefore === null || daysLeftBefore > t)) return t
  }
  return null
}

export async function sweepLineTokenHealth(now: Date = new Date()): Promise<LineTokenSweepResult> {
  const rows = await prisma.shopChannel.findMany({
    where: { provider: 'LINE', status: 'ACTIVE' },
    select: {
      id: true,
      shopId: true,
      name: true,
      accessTokenEnc: true,
      lineTokenExpiresAt: true,
      lineTokenCheckedAt: true,
    },
  })

  const result: LineTokenSweepResult = { checked: 0, invalidated: 0, warned: 0, failed: 0 }

  for (const row of rows) {
    // 🛑 try/catch **รายแถว** — แถวหนึ่งล้มต้องไม่หยุดแถวที่เหลือ (AC-CH-08)
    // ร้านที่ token พังคือร้านที่ทำให้ลูปนี้ throw ได้ง่ายที่สุด และเป็นร้านที่เราต้องเตือนที่สุด
    try {
      result.checked++
      const probe = await probeLineToken(decryptToken(row.accessTokenEnc))

      if (!probe.valid) {
        // LINE ปฏิเสธ token ตรง ๆ — ตัวนี้ยิง push ให้เองครั้งเดียวตอนสถานะพลิก
        await markChannelTokenInvalid(row.id)
        result.invalidated++
        continue
      }

      const daysBefore = row.lineTokenExpiresAt
        ? daysUntilTokenExpiry(row.lineTokenExpiresAt, row.lineTokenCheckedAt?.getTime() ?? now.getTime())
        : null

      await prisma.shopChannel.update({
        where: { id: row.id },
        data: { lineTokenExpiresAt: probe.expiresAt, lineTokenCheckedAt: now },
      })

      // ไม่มีวันหมดอายุ (long-lived) = ไม่มีอะไรต้องเตือน — จบตรงนี้
      if (!probe.expiresAt) continue

      const daysLeft = daysUntilTokenExpiry(probe.expiresAt, now.getTime())
      const crossed = crossedAlertThreshold(daysLeft, daysBefore)
      if (crossed !== null) {
        await pushLineTokenExpiring({ shopId: row.shopId, channelName: row.name, daysLeft })
        result.warned++
      }
    } catch (e) {
      result.failed++
      console.error('[line-token-health] ตรวจช่องทางไม่สำเร็จ', row.id, e instanceof Error ? e.message : e)
    }
  }

  return result
}
