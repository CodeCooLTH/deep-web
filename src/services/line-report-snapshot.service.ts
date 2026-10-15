/**
 * line-report-snapshot.service.ts — สร้าง/อ่าน snapshot ของหน้า "สรุปรายละเอียด" สาธารณะ (00070 EXT-LINK U8)
 *
 * 🛑 token ดิบไม่ถูกเก็บ/ไม่ถูก log — เก็บเฉพาะ sha256 · อ่านด้วย hash เสมอ (แม้รูปแบบผิดก็ hash เพื่อเวลาตอบใกล้เคียงกัน)
 * 🛑 NOT_FOUND ใช้ร่วมกันทั้ง "ไม่มี / รูปแบบผิด / กลุ่มถูกลบ / payload อ่านไม่ได้" — ผู้ถือลิงก์แยกกรณีไม่ได้
 */
import { Prisma, type LineReportDeliveryKind } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { detailLinkUrl } from '@/lib/line-report/config'
import { detailExpiresAt } from '@/lib/line-report/detail-expiry'
import { parseSnapshot, type DetailSnapshotV1 } from '@/lib/line-report/detail-snapshot'
import { hashDetailToken, isWellFormedToken, newDetailToken } from '@/lib/line-report/detail-token'
import type { TemplateV1 } from '@/lib/line-report/template'
import type { GroupSummary, Window } from '@/lib/line-report/types'
import { buildDetailSnapshot } from '@/services/line-report-detail.service'
import type { SweepCache } from '@/services/line-report-summary.service'

export type SnapshotView =
  | { kind: 'OK'; snapshot: DetailSnapshotV1 }
  | { kind: 'EXPIRED'; expiresAt: Date; reportKind: LineReportDeliveryKind }
  | { kind: 'NOT_FOUND' }

export async function getSnapshotView(token: string, now: Date = new Date()): Promise<SnapshotView> {
  const hash = hashDetailToken(String(token)) // hash ทุกครั้ง — ไม่ short-circuit ตามรูปแบบ
  if (!isWellFormedToken(token)) return { kind: 'NOT_FOUND' }
  const row = await prisma.lineReportSnapshot.findUnique({
    where: { tokenHash: hash },
    select: { kind: true, expiresAt: true, payload: true, group: { select: { status: true } } },
  })
  if (!row || row.group.status === 'REMOVED') return { kind: 'NOT_FOUND' }
  if (now.getTime() >= row.expiresAt.getTime() || row.payload == null) {
    return { kind: 'EXPIRED', expiresAt: row.expiresAt, reportKind: row.kind } // ไม่ส่ง payload
  }
  const snapshot = parseSnapshot(row.payload)
  if (!snapshot) {
    console.error('[line-report] detail snapshot unreadable')
    return { kind: 'NOT_FOUND' }
  }
  return { kind: 'OK', snapshot }
}

/** null = ปุ่มไม่ใช่ DETAIL / ซ่อนปุ่ม / ไม่มีฐาน https → ไม่เขียนแถว · error อื่น throw ให้ผู้เรียกจับ (ใช้ปุ่มเดิม) */
export async function createDetailSnapshot(input: {
  groupId: string
  deliveryId?: string | null
  kind: 'DAILY' | 'MONTHLY' | 'TEST' | 'COMMAND'
  template: TemplateV1
  summary: GroupSummary
  title: string
  window: Window
  now: Date
  cache: SweepCache
}): Promise<{ url: string } | null> {
  const { template, now } = input
  if (template.button.target !== 'DETAIL' || !template.button.show) return null
  if (!detailLinkUrl('x')) return null // เช็คก่อน build — ไม่เสีย query ถ้าไม่มีลิงก์ใช้
  const snapshot = await buildDetailSnapshot({
    summary: input.summary,
    template,
    kind: input.kind,
    title: input.title,
    window: input.window,
    now,
    cache: input.cache,
  })
  const { token, hash } = newDetailToken()
  const url = detailLinkUrl(token)
  if (!url) return null
  await prisma.lineReportSnapshot.create({
    data: {
      tokenHash: hash,
      groupId: input.groupId,
      deliveryId: input.deliveryId ?? null,
      kind: input.kind,
      windowStart: input.window.startIso,
      windowEnd: input.window.endIso,
      computedAt: new Date(input.window.computedAt),
      expiresAt: detailExpiresAt(now),
      payload: snapshot as unknown as Prisma.InputJsonValue,
    },
  })
  return { url }
}
