/**
 * meta-ads-spend.service — แหล่งค่าโฆษณาของรายงานยอดขายตามโฆษณา (00091 FR-010)
 * ดึงสดต่อคำขอ + แคชฝั่ง server ~15 นาที (คีย์ shop+บัญชี+ช่วง) · ไม่มีตาราง/migration (มติ 2026-11-14)
 * ไม่ผูกกับ gate OPEN_META_AUDIENCE: มีแถวเชื่อมต่อ = อ่านค่าโฆษณาได้
 * 🛑 token ถอดรหัสในฟังก์ชันที่ถูกแคชเท่านั้น — ไม่เป็น argument (ไม่เข้าคีย์แคช) ไม่ออก client/log
 */
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { decryptToken } from '@/lib/token-crypto'
import { fetchAdInsights, type InsightsResult } from '@/lib/meta-ads-insights'

export type SpendResult = Omit<InsightsResult, 'state'> & { state: InsightsResult['state'] | 'NOT_CONNECTED' }
export type SpendSource = (shopId: string, since: string, until: string) => Promise<SpendResult>

const NONE = { accountName: null, currency: null, tz: null, rows: [] as InsightsResult['rows'] }

class NotOk extends Error {
  constructor(public result: InsightsResult) { super('INSIGHTS_NOT_OK') }
}

async function loadFresh(shopId: string, adAccountId: string, since: string, until: string): Promise<InsightsResult> {
  const conn = await prisma.metaAudienceConnection.findUnique({ where: { shopId }, select: { tokenEnc: true } })
  // แถวหายระหว่างทาง (race) — โยนเพื่อไม่ให้ ERROR ถูกแคช 15 นาที
  if (!conn) throw new NotOk({ state: 'ERROR', ...NONE })
  const r = await fetchAdInsights({ adAccountId, token: decryptToken(conn.tokenEnc), since, until })
  // โยน = unstable_cache ไม่เก็บ → แคชเฉพาะผลสำเร็จ (ผลล้มเหลวลองใหม่ได้ทันทีเมื่อกด "ลองใหม่")
  if (r.state !== 'OK') throw new NotOk(r)
  return r
}

export const getAdSpend: SpendSource = async (shopId, since, until) => {
  const conn = await prisma.metaAudienceConnection.findUnique({ where: { shopId }, select: { adAccountId: true, stoppedReason: true } })
  if (!conn) return { state: 'NOT_CONNECTED', ...NONE }
  // โทเคน/สิทธิ์ถูกระบบหยุดไปแล้ว — ไม่ต้องเสียเวลายิง Graph
  if (conn.stoppedReason === 'TOKEN_OR_PERMISSION') return { state: 'AUTH', ...NONE }
  try {
    const cached = unstable_cache(loadFresh, ['ad-spend', shopId, conn.adAccountId, since, until], { revalidate: 900 })
    return await cached(shopId, conn.adAccountId, since, until)
  } catch (e) {
    if (e instanceof NotOk) return e.result
    console.error('[ad-spend] failed', e instanceof Error ? e.message : 'unknown') // ไม่ log ตัว error ดิบ (อาจมี URL)
    return { state: 'ERROR', ...NONE }
  }
}
