// 00066 พื้นผิว (b) — ตัวตัดสินของปุ่มลอย "งานของฉัน" เป็นฟังก์ชันบริสุทธิ์ (BR-ACT-21)
// เพื่อให้ boolean ที่ตัดสิน UI มีที่ให้เทสจับ — ห้ามย้ายกลับไปเป็น ternary ใน JSX
import type { FollowUpChange } from '@/lib/follow-up-view'

/** ปุ่มยกสูงกี่ขั้น: 0 = พื้น · 1 = เหนือช่องพิมพ์หรือ dock ร่างออเดอร์ · 2 = เหนือทั้งคู่ */
export type BubbleLift = 0 | 1 | 2

/** composer = หน้าที่มีช่องพิมพ์ล่าง (ห้องแชท/คอมเมนต์) · dock = ชิปร่างออเดอร์ที่ย่อไว้กำลังแสดง */
export function bubbleLift(i: { composerPresent: boolean; dockVisible: boolean }): BubbleLift {
  return ((i.composerPresent ? 1 : 0) + (i.dockVisible ? 1 : 0)) as BubbleLift
}

export interface BubbleRow {
  id: string
  status: string
  bucket: string
}
export interface BubbleData<R extends BubbleRow> {
  rows: R[]
  total: number
  lateCount: number
}

const inBubble = (r: BubbleRow) => r.status === 'OPEN' && (r.bucket === 'late' || r.bucket === 'today')

/**
 * ผลของ action บนการ์ด → สถานะปุ่ม (optimistic) — "ทำแล้ว" ปิดทันที ไม่รอ refetch
 * แถวที่ไม่ใช่ OPEN หรือเลื่อนพ้นวันนี้แล้ว = หลุดจาก bubble · refresh = คงเดิม (ผู้เรียกโหลดใหม่เอง)
 */
export function applyBubbleChange<R extends BubbleRow>(d: BubbleData<R>, c: FollowUpChange<R>): BubbleData<R> {
  if (c.kind === 'refresh') return d
  const id = c.kind === 'remove' ? c.id : c.item.id
  const old = d.rows.find((r) => r.id === id)
  if (!old) return d
  const keep = c.kind === 'upsert' && inBubble(c.item)
  const lateDelta = (old.bucket === 'late' ? 1 : 0) - (keep && c.kind === 'upsert' && c.item.bucket === 'late' ? 1 : 0)
  return {
    rows: keep && c.kind === 'upsert' ? d.rows.map((r) => (r.id === id ? c.item : r)) : d.rows.filter((r) => r.id !== id),
    total: keep ? d.total : Math.max(0, d.total - 1),
    lateCount: Math.max(0, d.lateCount - lateDelta),
  }
}

/** หน้าที่มีช่องพิมพ์แถบล่าง: ห้องแชท + คอมเมนต์ (ทั้งเดสก์ท็อปและมือถือ) */
export function isComposerPath(pathname: string | null | undefined): boolean {
  const p = pathname ?? ''
  return p.startsWith('/inbox/comments') || /^\/inbox\/[^/]+$/.test(p)
}
