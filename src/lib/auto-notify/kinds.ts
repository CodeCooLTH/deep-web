// feature 00078 — ชนิดข้อความส่งอัตโนมัติ + ชนิดที่แต่ละประเภทกิจการใช้ได้ · pure module
import { resolveOrderVocab } from '@/lib/seller-menu'
import { AUTO_NOTIFY_KINDS, type AutoNotifyKind } from './ledger-constants'

export { AUTO_NOTIFY_KINDS }
export type { AutoNotifyKind }

const KINDS_BY_VERTICAL: Record<string, readonly AutoNotifyKind[]> = {
  ONLINE_SALES: ['ORDER_SUMMARY', 'TRACKING'],
  SERVICE_QUEUE: ['SERVICE_BOOKED', 'SERVICE_STARTED', 'SERVICE_CLOSED'],
  LODGING: ['ORDER_SUMMARY'],
}

/** ชนิดที่ร้านประเภทนี้ใช้ได้ ตามลำดับแสดง — vertical ที่ไม่รู้จัก = ไม่มีชนิดใดเลย (fail-closed: ห้ามส่งหาลูกค้าโดยเดา) */
export function kindsForVertical(vertical: string): readonly AutoNotifyKind[] {
  return KINDS_BY_VERTICAL[vertical] ?? []
}

export function isKindAvailable(vertical: string, kind: AutoNotifyKind): boolean {
  return kindsForVertical(vertical).includes(kind)
}

/** ชื่อไอคอน tabler (ใช้กับ `@iconify/react` รูปแบบ `tabler-*` ตามที่โปรเจกต์ใช้) */
export const AUTO_NOTIFY_KIND_ICON: Record<AutoNotifyKind, string> = {
  ORDER_SUMMARY: 'tabler-receipt',
  TRACKING: 'tabler-truck-delivery',
  SERVICE_BOOKED: 'tabler-calendar-check',
  SERVICE_STARTED: 'tabler-player-play',
  SERVICE_CLOSED: 'tabler-circle-check',
}

/** ป้ายแถวในหน้าตั้งค่า — ORDER_SUMMARY ผันคำเรียกรายการตามประเภทกิจการ (HR16: ใช้ resolveOrderVocab) */
export function autoNotifyKindLabel(kind: AutoNotifyKind, vertical: string): string {
  switch (kind) {
    case 'ORDER_SUMMARY':
      return `เมื่อสร้าง${resolveOrderVocab(vertical).noun}`
    case 'TRACKING':
      return 'เมื่อมีเลขพัสดุ'
    case 'SERVICE_BOOKED':
      return 'เมื่อสร้างงานบริการ'
    case 'SERVICE_STARTED':
      return 'เมื่อเริ่มงาน'
    case 'SERVICE_CLOSED':
      return 'เมื่อปิดงาน'
  }
}
