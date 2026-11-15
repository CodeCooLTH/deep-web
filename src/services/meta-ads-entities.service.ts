/**
 * meta-ads-entities.service — ตัวดึงโครงสร้างแคมเปญ/ชุด/โฆษณา ของหน้าสรุปโฆษณา (00094 E1–E3)
 * แคช 15 นาที ต่อ (shop · บัญชี · ชุดรหัสโฆษณา) · เก็บเฉพาะผลสำเร็จ (แบบ meta-ads-spend) · ไม่มีตาราง/migration
 * ไม่ผูก gate OPEN_META_AUDIENCE: มีแถวเชื่อมต่อ = อ่านได้
 * 🛑 token ถอดรหัสในฟังก์ชันที่ถูกแคชเท่านั้น — ไม่เป็น argument ไม่ออก client/log
 */
import { createHash } from 'node:crypto'
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { decryptToken } from '@/lib/token-crypto'
import { fetchEntities, type EntitiesResult } from '@/lib/meta-ads-entities'

export type EntitiesCard = Omit<EntitiesResult, 'state'> & { state: EntitiesResult['state'] | 'NOT_CONNECTED' }
export type EntitiesSource = (shopId: string, adIds: string[]) => Promise<EntitiesCard>

const NONE = { campaigns: [], adsets: [], ads: [] }

class NotOk extends Error {
  constructor(public result: EntitiesResult) { super('ENTITIES_NOT_OK') }
}

async function loadFresh(shopId: string, adAccountId: string, adIds: string[]): Promise<EntitiesResult> {
  const conn = await prisma.metaAudienceConnection.findUnique({ where: { shopId }, select: { tokenEnc: true } })
  if (!conn) throw new NotOk({ state: 'ERROR', ...NONE }) // แถวหายระหว่างทาง — โยนเพื่อไม่ให้ ERROR ถูกแคช
  const r = await fetchEntities({ adAccountId, token: decryptToken(conn.tokenEnc), adIds })
  if (r.state !== 'OK') throw new NotOk(r) // โยน = unstable_cache ไม่เก็บ
  return r
}

export const getAdEntities: EntitiesSource = async (shopId, adIds) => {
  const conn = await prisma.metaAudienceConnection.findUnique({ where: { shopId }, select: { adAccountId: true, stoppedReason: true } })
  if (!conn) return { state: 'NOT_CONNECTED', ...NONE }
  if (conn.stoppedReason === 'TOKEN_OR_PERMISSION') return { state: 'AUTH', ...NONE }
  const key = createHash('sha1').update([...adIds].sort().join(',')).digest('hex').slice(0, 16)
  try {
    return await unstable_cache(loadFresh, ['ad-entities', shopId, conn.adAccountId, key], { revalidate: 900 })(shopId, conn.adAccountId, adIds)
  } catch (e) {
    if (e instanceof NotOk) return e.result
    console.error('[ad-entities] failed', e instanceof Error ? e.message : 'unknown') // ไม่ log ตัว error ดิบ (อาจมี URL)
    return { state: 'ERROR', ...NONE }
  }
}
