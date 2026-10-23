// feature 00084 T10b — ตัดสินว่า "หลังสร้างคำสั่งซื้อ" จะเปิดพัสดุกับใคร/ถามอะไร (Design-Spec §5.3, SRS CS-25)
// pure ล้วน (ไม่แตะ DB/เครือข่าย/Swal) เพื่อให้เทสจับได้ตรง ๆ — ตัวเรียกจริงอยู่ที่ lib/iship/after-order-create.ts
//
// แต่ละโหมดต้อง "รวม ACTIVE แล้ว": เจ้าที่ไม่ได้เชื่อม/ไม่ ACTIVE ส่งเข้ามาเป็น 'OFF'
// (ตรงกับ resolveChatIshipCreateMode ที่ fail-closed อยู่แล้ว)

import { flashPriceBadge } from './flash-order-ui'

export type CreateMode = 'AUTO' | 'ASK' | 'OFF'

export interface AfterCreateProviders {
  iship: CreateMode
  flash: CreateMode
}

export type AfterCreateDecision =
  | { kind: 'NONE' }
  | { kind: 'ISHIP'; mode: 'AUTO' | 'ASK' }
  | { kind: 'FLASH'; mode: 'AUTO' | 'ASK' }
  /** สองเจ้า: ถามเสมอแม้ตั้ง AUTO — ห้ามระบบเลือกแทนร้าน/ห้ามเลือกเจ้าที่ถูกกว่าเอง (BR-FLASH-21) */
  | { kind: 'CHOOSE' }

export function decideAfterCreate(p: AfterCreateProviders): AfterCreateDecision {
  const iship = p.iship !== 'OFF'
  const flash = p.flash !== 'OFF'
  if (iship && flash) return { kind: 'CHOOSE' }
  if (iship) return { kind: 'ISHIP', mode: p.iship as 'AUTO' | 'ASK' }
  if (flash) return { kind: 'FLASH', mode: p.flash as 'AUTO' | 'ASK' }
  return { kind: 'NONE' }
}

// ─── ข้อความ Swal เดิมของ iShip — ห้ามแก้ (ร้าน iShip อย่างเดียวต้องเห็นเหมือนเดิมทุกตัวอักษร) ───

export const ISHIP_ASK_TITLE = 'สร้างพัสดุที่ iShip ด้วยไหม'
export const ISHIP_ASK_HTML =
  'ระบบจะเปิดพัสดุกับขนส่งตามค่าที่ตั้งไว้ในหน้าตั้งค่าการจัดส่ง<br/>' +
  '<span class="text-danger">มีค่าใช้จ่ายจริงกับบัญชี iShip ของร้าน</span>'
export const ASK_CONFIRM_TEXT = 'สร้างพัสดุ'
export const ASK_CANCEL_TEXT = 'ไม่ใช่ตอนนี้'
export const AFTER_CREATE_FALLBACK_ERROR = 'ยังสร้างพัสดุไม่ได้ — เปิดพัสดุอีกครั้งได้จากหน้าคำสั่งซื้อ'

// ─── ข้อความของ Flash / ตัวเลือกผู้ให้บริการ ─────────────────────────────────────

export const FLASH_ASK_TITLE = 'สร้างพัสดุที่ Flash ด้วยไหม'
export const FLASH_ASK_WARNING = 'มีค่าใช้จ่ายจริงกับบัญชี Flash ของร้าน'
export const CHOOSE_TITLE = 'เปิดพัสดุกับใคร'
export const CHOOSE_REQUIRED = 'เลือกก่อนว่าจะเปิดพัสดุกับใคร'
export const CHOOSE_FOOTNOTE = 'มีค่าใช้จ่ายจริง ดูราคาก่อนได้ที่หน้าคำสั่งซื้อ (ปุ่มจัดการพัสดุ)'
export const NEEDS_REVIEW_TOAST = 'ต้องตรวจสอบพัสดุ ตรวจที่ Flash แล้วจัดการจากหน้าคำสั่งซื้อ'
export const PRICE_UNKNOWN = 'ประเมินราคาไม่ได้'

/** ตัวเลือกใน Swal CHOOSE — ค่าไม่มีข้อมูลผู้ใช้ จึงใส่ HTML ตรง ๆ ได้ */
export const CHOOSE_OPTIONS = {
  FLASH: 'Flash (บัญชีของร้านเอง)<br/><small>ใช้ราคาสัญญา บิลกับ Flash โดยตรง</small>',
  ISHIP: 'iShip<br/><small>เทียบราคาได้หลายขนส่ง บิลผ่าน iShip</small>',
} as const

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

// ─── ผลหลังยิงสร้างพัสดุ → toast ────────────────────────────────────────────────

export interface ShipmentOutcome {
  status?: string
  trackingNo?: string | null
  lastErrorMessage?: string | null
}

export function shipmentOutcomeToast(body: ShipmentOutcome): { type: 'success' | 'warning' | 'error'; message: string } {
  if (body.status === 'CREATED') {
    return { type: 'success', message: body.trackingNo ? `สร้างพัสดุแล้ว เลขติดตาม ${body.trackingNo}` : 'สร้างพัสดุแล้ว' }
  }
  // Flash 1003 ที่เรายังไม่มีเลขพัสดุ — ไม่ใช่ความล้มเหลว แต่ห้ามปล่อยให้ร้านนึกว่าเปิดสำเร็จ
  if (body.status === 'NEEDS_REVIEW') return { type: 'warning', message: NEEDS_REVIEW_TOAST }
  return {
    type: 'error',
    message: body.lastErrorMessage ?? 'สร้างพัสดุไม่สำเร็จ — กดลองใหม่ได้จากหน้าคำสั่งซื้อ',
  }
}

// ─── สรุปใน Swal ASK ของ Flash ───────────────────────────────────────────────────

export interface FlashAskFacts {
  receiverName: string | null
  phone: string | null
  subdistrict: string | null
  district: string | null
  province: string | null
  postcode: string | null
  weightKg: number | null
  cod: number
  quote: { totalBaht: number; pricingTable: string } | null
}

/** แถวที่ขาด "ไม่แสดง" ไม่ใช่แสดงว่างหรือ ฿0 — ราคาเท่านั้นที่บอกตรง ๆ ว่าประเมินไม่ได้ */
export function flashAskRows(f: FlashAskFacts): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  const who = [f.receiverName, f.phone].filter((x): x is string => Boolean(x && x.trim())).join(' · ')
  if (who) rows.push({ label: 'ผู้รับ', value: who })
  const place = [
    f.subdistrict && `ต.${f.subdistrict}`,
    f.district && `อ.${f.district}`,
    f.province,
    f.postcode,
  ]
    .filter(Boolean)
    .join(' ')
  if (place) rows.push({ label: 'ส่งไป', value: place })
  if (f.weightKg != null && f.weightKg > 0) rows.push({ label: 'น้ำหนัก', value: `${f.weightKg.toFixed(1)} กก.` })
  if (f.cod > 0) rows.push({ label: 'เก็บเงินปลายทาง', value: `฿${f.cod.toLocaleString('th-TH')}` })
  rows.push({
    label: 'ค่าส่งโดยประมาณ',
    value: f.quote
      ? `฿${f.quote.totalBaht.toLocaleString('th-TH')} (ประมาณการ · ${flashPriceBadge(f.quote.pricingTable).label})`
      : PRICE_UNKNOWN,
  })
  return rows
}
