/**
 * ตัวตัดสินของหน้าต่าง "พัสดุ" ในแชท (ShipmentDraftPanel) — pure เพื่อให้เทสจับได้
 * (docs/conventions/ui-boolean-needs-a-testable-home.md)
 */

import { hasLiveIshipShipment } from './iship/live-shipment'
import { isOtherCourier } from './iship/courier'
import { ORDER_STATUS_META } from './order-display'
import { canMarkDelivered, canMarkDispatched } from './manual-shipment'
import type { ShippingStageKey } from './order-stage'

export type IShipState = 'READY' | 'NOT_CONNECTED' | 'DISCONNECTED'

export type PanelView =
  /** มีใบ iShip (รวม FAILED) — ShipmentStatusView */
  | 'ISHIP_STATUS'
  /** ส่งเองไปแล้ว — มุมมอง C */
  | 'MANUAL_DONE'
  /** ออเดอร์ไม่ใช่ PENDING และยังไม่มีพัสดุ — กล่อง D */
  | 'STATUS_BLOCKED'
  /** ที่อยู่ผู้ส่งของร้านไม่ครบ — มีทางออก "ส่งเองแทน" */
  | 'SENDER_BLOCKED'
  /** ฟอร์มส่งเองอย่างเดียว ไม่มีแถบเลือก */
  | 'MANUAL_ONLY'
  /** แถบเลือก 3 วิธี */
  | 'CHOOSE'

export interface PanelViewInput {
  ishipState: IShipState
  orderStatus: string
  /** ใบ iShip ล่าสุดที่ไม่ CANCELLED (อาจ FAILED) */
  ishipShipment: { status: string; isDryRun: boolean } | null
  hasManual: boolean
  senderBlocked: boolean
  /** ร้านกดไปฟอร์มเอง (ส่งเองแทน / แก้ที่อยู่หรือขนส่ง) */
  forceForm: boolean
}

export function decidePanelView(i: PanelViewInput): PanelView {
  const live = hasLiveIshipShipment(i.ishipShipment)
  // ISHIP ชนะ MANUAL เหมือนหน้าคำสั่งซื้อ (orders/[token]/page.tsx shipmentSource)
  if (live && !i.forceForm) return 'ISHIP_STATUS'
  if (i.hasManual && !live) return 'MANUAL_DONE'
  if (i.orderStatus !== 'PENDING') return 'STATUS_BLOCKED'
  if (i.ishipState !== 'READY') return 'MANUAL_ONLY'
  if (i.senderBlocked) return i.forceForm ? 'MANUAL_ONLY' : 'SENDER_BLOCKED'
  if (i.ishipShipment && !i.forceForm) return 'ISHIP_STATUS'
  return 'CHOOSE'
}

/**
 * 00080 — มุมมอง MANUAL_DONE: ปุ่มขั้นถัดไป + ป้ายสถานะ จากสถานะออเดอร์ (ผ่านตัวตัดสินกลาง manual-shipment)
 * view นี้ = มีเลขส่งเอง และไม่มี iShip live อยู่แล้ว (decidePanelView) จึงใส่ facts ตรง ๆ
 * CONFIRMED/CANCELLED = ไม่มีปุ่ม (CANCELLED คงพฤติกรรมเดิม)
 */
export function manualDoneStep(orderStatus: string): {
  action: 'DISPATCH' | 'DELIVER' | null
  stage: ShippingStageKey | undefined
} {
  const facts = { status: orderStatus, fulfillmentMode: 'SHIPPED', hasManualTracking: true, hasLiveIshipShipment: false }
  if (canMarkDispatched(facts)) return { action: 'DISPATCH', stage: 'AWAITING_DISPATCH' }
  if (canMarkDelivered(facts)) return { action: 'DELIVER', stage: 'SHIPPING' }
  return { action: null, stage: undefined }
}

/** มุมมองที่ไม่มีช่องกรอก — ปิดหน้าต่างได้ไม่ต้องถามยืนยัน */
export function isViewOnlyPanelView(v: PanelView): boolean {
  return v !== 'MANUAL_ONLY' && v !== 'CHOOSE'
}

/** ชื่อสถานะออเดอร์จาก SSOT เดียวกับการ์ดออเดอร์ */
export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_META[status]?.label ?? status
}

/**
 * หน้าติดตามพัสดุสาธารณะของ iShip — hardcode โดยเจตนา (ลูกค้าปลายทางกดเปิด ต้องเป็น production
 * เสมอ ไม่ผูกกับ env ISHIP_BASE_URL ที่ไว้สลับไประบบทดสอบ)
 */
export const trackingUrl = (trackingNo: string) =>
  `https://app.iship.cloud/tracking?track=${encodeURIComponent(trackingNo)}`

export type TrackingMessageMode = 'ISHIP' | 'MANUAL'

/**
 * ตัวอย่างข้อความแจ้งเลข (preview ในแผงเท่านั้น) — 🛑 ข้อความจริงประกอบที่ server ด้วย composeNotice('TRACKING')
 * (00078 T14) ห้ามใช้ฟังก์ชันนี้สร้างข้อความที่ส่งออก · ลบได้เมื่อ preview ย้ายไปอ่านเทมเพลตจาก strip-context
 *
 * trackingNo = null คือโหมด "ตัวอย่างข้อความ" ก่อนบันทึก — ต้องผ่านฟังก์ชันนี้ตัวเดียวกับข้อความ
 * จริง ห้ามเขียนตัวอย่างซ้ำใน JSX เพราะสองชุดจะเพี้ยนจากกัน
 *
 * MANUAL: ไม่แนบลิงก์ iShip (ยังไม่มีหลักฐานว่าหน้านั้นหาเลขที่ไม่ได้เปิดผ่าน iShip เจอ — ลิงก์ตาย
 * แย่กว่าไม่มีลิงก์) และขนส่ง "อื่นๆ" ไม่บอกอะไรลูกค้า จึงตัดบรรทัดขนส่งทิ้ง
 */
export function trackingMessage(
  mode: TrackingMessageMode,
  trackingNo: string | null,
  courierName: string | null,
): string {
  const lines: string[] = []
  const name = courierName?.trim()
  if (mode === 'MANUAL') {
    if (name && !isOtherCourier(name)) lines.push(`จัดส่งด้วย ${name}`)
    // preview ที่ยังไม่ได้เลือกขนส่ง — ตัวยึดตำแหน่ง (เลือก "อื่นๆ" แล้วตัดบรรทัดเหมือนข้อความจริง)
    else if (trackingNo === null && !name) lines.push('จัดส่งด้วย (ขนส่งที่เลือก)')
    lines.push(`เลขติดตามพัสดุ: ${trackingNo ?? '(เลขที่กรอกด้านบน)'}`)
    return lines.join('\n')
  }
  if (name) lines.push(`จัดส่งด้วย ${name}`)
  lines.push(`เลขติดตามพัสดุ: ${trackingNo ?? '(จะแสดงหลังสร้างพัสดุสำเร็จ)'}`)
  lines.push(`ติดตามพัสดุ: ${trackingNo ? trackingUrl(trackingNo) : '(ลิงก์จะแนบให้อัตโนมัติ)'}`)
  return lines.join('\n')
}

/**
 * แปลง `Invalid transition: X → Y` จาก shipOrder เป็นไทย (เกิดได้เมื่อสองแท็บ/สองคนกดพร้อมกัน)
 * คืน null = ไม่ใช่ข้อความนี้ ให้ผู้เรียกใช้ข้อความเดิม
 */
export function translateInvalidTransition(message: string): string | null {
  const m = /^Invalid transition: (\w+) → (\w+)$/.exec(message)
  if (!m) return null
  if (m[1] === 'SHIPPED') {
    return 'คำสั่งซื้อนี้บันทึกเลขพัสดุไว้แล้ว แก้เลขพัสดุได้ที่หน้าคำสั่งซื้อ'
  }
  return `คำสั่งซื้อนี้อยู่สถานะ${orderStatusLabel(m[1])} จึงบันทึกเลขพัสดุไม่ได้`
}
