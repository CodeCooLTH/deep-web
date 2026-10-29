/**
 * หน้า "เรียกรถ" (feature 00087) — ตัวตัดสินสถานะ/ตัวกรอง/สิทธิ์ยกเลิก ของคำขอเรียกรถ (ShipmentPickup)
 * ใช้ร่วมทั้ง iShip และ Flash · service ยกเลิกทั้งสองเจ้าเรียก canCancelPickup ตัวเดียวกัน (BRD BR-5)
 */

export type PickupFilterKey = 'all' | 'active' | 'done' | 'cancelled' | 'failed'

export const PICKUP_FILTERS: { key: PickupFilterKey; label: string; statuses: string[] | null }[] = [
  { key: 'all', label: 'ทั้งหมด', statuses: null },
  { key: 'active', label: 'กำลังดำเนินการ', statuses: ['REQUESTED', 'ACCEPTED'] },
  { key: 'done', label: 'เสร็จสิ้น', statuses: ['CLOSED'] },
  { key: 'cancelled', label: 'ยกเลิก', statuses: ['CANCELLED'] },
  { key: 'failed', label: 'ไม่สำเร็จ', statuses: ['FAILED'] },
]

/** ค่าจาก URL ที่ไม่รู้จัก = ทั้งหมด */
export function parsePickupFilter(v: string | null | undefined): PickupFilterKey {
  return PICKUP_FILTERS.some((f) => f.key === v) ? (v as PickupFilterKey) : 'all'
}

export function pickupFilterStatuses(key: PickupFilterKey): string[] | null {
  return PICKUP_FILTERS.find((f) => f.key === key)?.statuses ?? null
}

export type PickupTone = 'info' | 'primary' | 'success' | 'neutral' | 'danger'

const STATUS_VIEW: Record<string, { label: string; tone: PickupTone; icon: string }> = {
  REQUESTED: { label: 'รอขนส่งรับงาน', tone: 'info', icon: 'clock' },
  ACCEPTED: { label: 'พนักงานรับงานแล้ว', tone: 'primary', icon: 'user-check' },
  CLOSED: { label: 'เข้ารับเสร็จแล้ว', tone: 'success', icon: 'circle-check' },
  CANCELLED: { label: 'ยกเลิกแล้ว', tone: 'neutral', icon: 'circle-x' },
  FAILED: { label: 'เรียกรถไม่สำเร็จ', tone: 'danger', icon: 'alert-circle' },
}

export function pickupStatusView(status: string): { label: string; tone: PickupTone; icon: string } {
  return STATUS_VIEW[status] ?? { label: 'ไม่ทราบสถานะ', tone: 'neutral', icon: 'help-circle' }
}

/** ยกเลิกได้เฉพาะคำขอที่ยังไม่จบ — เข้ารับเสร็จ/ยกเลิกแล้ว/ล้มเหลว ห้ามยิงยกเลิกไปขนส่ง */
export function canCancelPickup(status: string): boolean {
  return status === 'REQUESTED' || status === 'ACCEPTED'
}
