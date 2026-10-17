// feature 00078 — ประกอบค่าตัวแปรเทมเพลตจากข้อมูลออเดอร์ (pure: ผู้เรียกอ่านฐานแล้วส่ง snapshot เข้ามา) · HR16
import { formatBaht } from '@/lib/format-money'
import { formatDate, formatDateTH, formatTimeHM } from '@/lib/format-date'
import { publicOrderUrl } from '@/lib/public-order-url'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { appointmentRangeText } from '@/lib/appointment-summary'
import type { AutoNotifyKind } from './ledger-constants'

type Moneyish = number | string | { toString(): string } | null | undefined
type Dateish = Date | string | number | null | undefined

export interface AutoNotifySnapshot {
  vertical: string
  shopName: string | null
  buyerName: string | null
  orderNo: string | null
  publicToken: string
  createdAt: Dateish
  totalAmount: Moneyish
  /** ชื่อรายการแรก */
  firstItemName: string | null
  /** จำนวนรายการทั้งหมดจากฐาน (_count.items) — ห้ามใช้ items.length ของ take:1 */
  itemCount: number
  courierName: string | null
  trackingNo: string | null
  /** ลิงก์ติดตามพัสดุ — ผู้เรียกคำนวณ (trackingLinkFor, T09) ไม่มี = null */
  trackingLink: string | null
  serviceName: string | null
  appointmentStart: Dateish
  appointmentEnd: Dateish
  depositAmount: Moneyish
  serviceStartedAt: Dateish
  serviceClosedAt: Dateish
}

const num = (x: Moneyish): number => {
  const n = Number(x ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * ตัด "คุณ" นำหน้า (เทมเพลตมักเขียน "เรียนคุณ{ชื่อลูกค้า}") · ว่าง = "ลูกค้า"
 * ไม่ตัดเมื่อตัวถัดไปเป็นสระ/วรรณยุกต์ที่ขึ้นต้นคำไม่ได้ — "คุณากร" เป็นชื่อคน ไม่ใช่ "คุณ"+"ากร"
 */
export function customerDisplayName(buyerName: string | null | undefined): string {
  const stripped = (buyerName ?? '').replace(/^\s*คุณ(?![ะาิีึืุูัํ็่้๊๋์ำๅ])\s*/, '').trim()
  return stripped || 'ลูกค้า'
}

/** ชื่อรายการแรก + " และอีก N รายการ" (D-1) · ไม่มีรายการ = ใช้คำเรียกรายการ (เหมือนเดิมของ messages route) */
export function itemsText(first: string | null, count: number, fallback: string): string {
  const name = first?.trim() || fallback
  return count > 1 ? `${name} และอีก ${count - 1} รายการ` : name
}

const dateTimeText = (d: Dateish): string => (d == null ? '' : `${formatDateTH(d)} ${formatTimeHM(d)}`)

export function buildTemplateValues(kind: AutoNotifyKind, s: AutoNotifySnapshot): Record<string, string> {
  const common = {
    ชื่อร้าน: s.shopName?.trim() ?? '',
    ชื่อลูกค้า: customerDisplayName(s.buyerName),
    เลขคำสั่งซื้อ: s.orderNo?.trim() ?? '',
  }
  const url = publicOrderUrl(s.publicToken)
  const when = s.appointmentStart == null ? '' : appointmentRangeText(new Date(s.appointmentStart), s.appointmentEnd == null ? null : new Date(s.appointmentEnd))
  const service = s.serviceName?.trim() ?? ''
  switch (kind) {
    case 'ORDER_SUMMARY': {
      const noun = resolveOrderVocab(s.vertical).noun
      return {
        ...common,
        วันที่สั่งซื้อ: s.createdAt == null ? '' : formatDate(s.createdAt),
        รายการสินค้า: itemsText(s.firstItemName, s.itemCount, noun),
        ยอดสุทธิ: formatBaht(num(s.totalAmount)),
        ลิงก์คำสั่งซื้อ: url,
        คำเรียกรายการ: noun,
      }
    }
    case 'TRACKING': {
      const courier = s.courierName?.trim() ?? ''
      return {
        ...common,
        // "อื่นๆ" ไม่บอกอะไรลูกค้า → ว่าง → บรรทัดขนส่งถูกตัด (พฤติกรรมเดิมของ trackingMessage)
        ขนส่ง: courier === 'อื่นๆ' ? '' : courier,
        เลขพัสดุ: s.trackingNo?.trim() ?? '',
        ลิงก์ติดตามพัสดุ: s.trackingLink?.trim() ?? '',
        ลิงก์คำสั่งซื้อ: url,
      }
    }
    case 'SERVICE_BOOKED': {
      const deposit = num(s.depositAmount)
      return {
        ...common,
        วันเวลานัด: when,
        บริการ: service,
        ยอดรวม: formatBaht(num(s.totalAmount)),
        ยอดมัดจำที่ตกลงไว้: deposit > 0 ? formatBaht(deposit) : '',
        ลิงก์งาน: url,
      }
    }
    case 'SERVICE_STARTED':
      return {
        ชื่อร้าน: common.ชื่อร้าน,
        ชื่อลูกค้า: common.ชื่อลูกค้า,
        บริการ: service,
        วันเวลานัด: when,
        เวลาเริ่มงาน: dateTimeText(s.serviceStartedAt),
        ลิงก์งาน: url,
      }
    case 'SERVICE_CLOSED':
      return {
        ชื่อร้าน: common.ชื่อร้าน,
        ชื่อลูกค้า: common.ชื่อลูกค้า,
        บริการ: service,
        วันเวลานัด: when,
        เวลาเริ่มงาน: dateTimeText(s.serviceStartedAt),
        เวลาปิดงาน: dateTimeText(s.serviceClosedAt),
        ลิงก์งาน: url,
      }
  }
}
