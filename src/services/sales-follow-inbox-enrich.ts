// 00095 S-8b — แปะ followBot ลงแถวกล่องแชท (ใช้ทั้ง RSC inbox/page.tsx และ GET /api/chat/conversations — ฟังก์ชันเดียวกัน
// ไม่งั้นหน้าแรกกับหน้าที่ refetch ไม่ตรงกัน เหมือนบทเรียน enrichWithFollowUpCounts)
import { getFollowBotRowSummaries, type FollowBotRowSummary } from './sales-follow-bot.service'

/**
 * กล่องแชทรวมหลายร้าน (00037): แบ่งตาม shopId ของแต่ละห้อง — 1 ชุดคำสั่งต่อร้านที่มีในหน้า (ปกติ 1 ร้าน)
 * ล้ม = followBot null ทุกแถว (แคปซูลเป็นของเสริม ห้ามทำให้รายการแชทโหลดไม่ขึ้น)
 */
export async function enrichWithFollowBot<T extends { id: string; shopId: string }>(
  items: T[],
): Promise<(T & { followBot: FollowBotRowSummary | null })[]> {
  const byShop = new Map<string, string[]>()
  for (const i of items) byShop.set(i.shopId, [...(byShop.get(i.shopId) ?? []), i.id])
  const found = new Map<string, FollowBotRowSummary | null>()
  await Promise.all(
    [...byShop].map(async ([shopId, ids]) => {
      try {
        for (const [id, v] of await getFollowBotRowSummaries(shopId, ids)) found.set(id, v)
      } catch (e) {
        console.error('[follow-bot] row summaries failed', e)
      }
    }),
  )
  return items.map((i) => ({ ...i, followBot: found.get(i.id) ?? null }))
}
