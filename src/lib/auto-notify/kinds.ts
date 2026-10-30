// feature 00078 — ชนิดข้อความส่งอัตโนมัติ + ชนิดที่แต่ละประเภทกิจการใช้ได้ · pure module
import { resolveOrderVocab } from '@/lib/seller-menu'
import { AUTO_NOTIFY_KINDS, type AutoNotifyKind } from './ledger-constants'

export { AUTO_NOTIFY_KINDS }
export type { AutoNotifyKind }

const KINDS_BY_VERTICAL: Record<string, readonly AutoNotifyKind[]> = {
  ONLINE_SALES: ['ORDER_SUMMARY', 'TRACKING'],
  // 00086: SERVICE_FINISHED ส่งตาม "ลูกค้าเห็นรูป" ของร้าน ไม่มีสวิตช์ของตัวเอง (ดู IMPLICIT_KINDS)
  SERVICE_QUEUE: ['SERVICE_BOOKED', 'SERVICE_STARTED', 'SERVICE_CLOSED', 'SERVICE_FINISHED'],
  // LODGING: บิลเข้าพักสร้างผ่าน booking.service ที่ไม่ผูกแชทและไม่มีจุดส่ง — ว่างจนกว่าจะต่อจุดส่ง (user เคาะ 2026-10-17 ทับ OQ-5)
  LODGING: [],
}

/** ชนิดที่ร้านประเภทนี้ใช้ได้ ตามลำดับแสดง — vertical ที่ไม่รู้จัก = ไม่มีชนิดใดเลย (fail-closed: ห้ามส่งหาลูกค้าโดยเดา) */
export function kindsForVertical(vertical: string): readonly AutoNotifyKind[] {
  return KINDS_BY_VERTICAL[vertical] ?? []
}

export function isKindAvailable(vertical: string, kind: AutoNotifyKind): boolean {
  return kindsForVertical(vertical).includes(kind)
}

/**
 * feature 00086 (PRD §10.2 แถว 2026-10-27 · ชนะ DATABASE §1.1 ข้อ 7) — ชนิดที่ "ไม่มีสวิตช์ในหน้าตั้งค่า"
 * SERVICE_FINISHED ส่งเมื่อร้านเปิด "ลูกค้าเห็นรูปและบันทึก" (Shop.serviceJobPhotosBuyerVisible) โดยไม่ต้องเปิดสวิตช์แยก
 * ⇒ หน้าตั้งค่า/แถบแจ้งใช้ switchableKindsForVertical · ตัวจองอ่านค่าสวิตช์จากร้านแทนแถว AutoNotifySwitch (T3)
 */
export const IMPLICIT_KINDS: readonly AutoNotifyKind[] = ['SERVICE_FINISHED']

export function isImplicitKind(kind: AutoNotifyKind): boolean {
  return IMPLICIT_KINDS.includes(kind)
}

/** ชนิดที่มีแถวสวิตช์/เทมเพลตให้ร้านตั้งเอง ตามลำดับแสดง (= kindsForVertical ลบ IMPLICIT_KINDS) */
export function switchableKindsForVertical(vertical: string): readonly AutoNotifyKind[] {
  return kindsForVertical(vertical).filter((k) => !isImplicitKind(k))
}

/** ชื่อไอคอน tabler แบบเปล่า (ไม่มี prefix) — ส่งเข้า wrapper `Icon` ซึ่งเติม `tabler:` ให้เอง */
export const AUTO_NOTIFY_KIND_ICON: Record<AutoNotifyKind, string> = {
  ORDER_SUMMARY: 'receipt',
  TRACKING: 'truck-delivery',
  SERVICE_BOOKED: 'calendar-check',
  SERVICE_STARTED: 'player-play',
  SERVICE_CLOSED: 'clipboard-check',
  SERVICE_FINISHED: 'camera',
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
    case 'SERVICE_FINISHED':
      return 'เมื่อทำเสร็จ (ลิงก์รูปก่อน-หลัง)'
  }
}
