/**
 * meta-ads-quality.service — ตัวดึงคำขอ Q1–Q4 ของรายงานคุณภาพโฆษณา (00093 FR-002)
 * แคช 15 นาที ต่อ (shop · บัญชี · ชนิดคำขอ · since · until · ชุดแอดที่กรอง) · เก็บเฉพาะผลสำเร็จ (แบบ meta-ads-spend)
 * ไม่มีตาราง/migration · การ์ดแต่ละใบมีสถานะของตัวเอง (FR-008) — คำขอหนึ่งล้มไม่ลากคำขออื่น
 * 🛑 token ถอดรหัสในฟังก์ชันที่ถูกแคชเท่านั้น — ไม่เป็น argument (ไม่เข้าคีย์แคช) ไม่ออก client/log
 * ค่าโฆษณาของหน้านี้ไม่มาจากที่นี่ — มาจาก getAdSpend ตัวเดียวกับ /reports/ads (BRD §2)
 */
import { createHash } from 'node:crypto'
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { decryptToken } from '@/lib/token-crypto'
import { fetchQuality, type QualityKind, type QualityFetch } from '@/lib/meta-ads-quality'

export type CardStatus = 'OK' | 'EMPTY' | 'UNAVAILABLE' | 'ERROR' | 'AUTH'
export type QualityCard<K extends QualityKind> = {
  status: CardStatus
  rows: Extract<QualityFetch<K>, { state: 'OK' }>['rows']
  /** เวลา (ms) ที่ดึงจาก Meta จริง — แสดง "อัปเดตเมื่อ" · null เมื่อไม่ใช่ OK/EMPTY */
  fetchedAt: number | null
}
export type QualityBundle = { [K in QualityKind]: Promise<QualityCard<K>> }

class NotOk extends Error {
  constructor(public state: 'AUTH' | 'ERROR' | 'UNAVAILABLE') { super('QUALITY_NOT_OK') }
}

const hashIds = (ids: string[] | undefined) => (ids ? createHash('sha1').update([...ids].sort().join(',')).digest('hex').slice(0, 16) : 'all')

async function loadFresh(kind: QualityKind, shopId: string, adAccountId: string, since: string, until: string, adIds: string[] | undefined) {
  const conn = await prisma.metaAudienceConnection.findUnique({ where: { shopId }, select: { tokenEnc: true } })
  if (!conn) throw new NotOk('ERROR') // แถวหายระหว่างทาง — โยนเพื่อไม่ให้ ERROR ถูกแคช
  const r = await fetchQuality({ kind, adAccountId, token: decryptToken(conn.tokenEnc), since, until, adIds })
  if (r.state !== 'OK') throw new NotOk(r.state) // โยน = unstable_cache ไม่เก็บ → แคชเฉพาะผลสำเร็จ
  return { rows: r.rows as unknown[], fetchedAt: Date.now() }
}

export type QualityRequest = {
  shopId: string
  since: string
  until: string
  /** กรอง Q2 (เลือกเพจ) — undefined = ระดับบัญชี · [] = ไม่มีแอดให้ถาม (ไม่ยิง Meta) */
  scopeAdIds?: string[]
  /** เลือกแอดเดียว (เฉพาะ Q3/Q4) */
  adId?: string | null
}

const settle = <K extends QualityKind>(status: CardStatus, rows: QualityCard<K>['rows'] = [] as never, fetchedAt: number | null = null): QualityCard<K> => ({ status, rows, fetchedAt })

/** เรียกครั้งเดียวต่อหน้า — คืน 4 promise แยกกัน (ไม่ reject) ให้แต่ละการ์ดรอของตัวเอง */
export function getQualityBundle(req: QualityRequest): QualityBundle {
  const conn = prisma.metaAudienceConnection.findUnique({ where: { shopId: req.shopId }, select: { adAccountId: true, stoppedReason: true } })
  const one = async <K extends QualityKind>(kind: K, adIds: string[] | undefined): Promise<QualityCard<K>> => {
    const c = await conn.catch(() => null)
    if (!c) return settle('ERROR')
    if (c.stoppedReason === 'TOKEN_OR_PERMISSION') return settle('AUTH')
    if (adIds && adIds.length === 0) return settle('EMPTY') // เพจที่ไม่มีแอดมีแชท — ไม่มีอะไรให้ถาม Meta
    try {
      // ผลล้มเหลวไม่ถูกแคช → "ลองใหม่" แค่เรนเดอร์ใหม่ก็ดึงสดเฉพาะการ์ดที่ล้ม การ์ดที่สำเร็จใช้แคชเดิม
      const v = await unstable_cache(loadFresh, ['ad-quality', kind, req.shopId, c.adAccountId, req.since, req.until, hashIds(adIds)], { revalidate: 900 })(kind, req.shopId, c.adAccountId, req.since, req.until, adIds)
      return settle(v.rows.length ? 'OK' : 'EMPTY', v.rows as QualityCard<K>['rows'], v.fetchedAt)
    } catch (e) {
      if (e instanceof NotOk) return settle(e.state)
      console.error('[ad-quality] failed', e instanceof Error ? e.message : 'unknown') // ไม่ log ตัว error ดิบ (อาจมี URL)
      return settle('ERROR')
    }
  }
  const filterIds = req.adId ? [req.adId] : req.scopeAdIds
  return {
    ad: one('ad', undefined),
    account: one('account', req.scopeAdIds),
    placement: one('placement', filterIds),
    agegender: one('agegender', filterIds),
  }
}
