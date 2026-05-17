/**
 * badge-labels.ts — utility สำหรับ label และ criteria description ของ badge
 *
 * แยกออกจาก page.tsx เพื่อให้ BadgeGrid.tsx (client) import ได้โดยไม่ circular:
 *   page.tsx (RSC) → BadgeGrid.tsx (client) → badge-labels.ts (utility)
 * badge-icons.ts อยู่คนละที่ (_constants ระดับ (dashboard)) ไม่ circular
 */

// ─── Category label map — derive จาก criteria.type (ไม่ใช่ badge.type) ──────
// badge.type จริงมีแค่ ACHIEVEMENT|VERIFICATION — category label derive จาก criteria.type
// เพื่อให้ card บอก context ที่ meaningful กว่า
export const CRITERIA_CATEGORY_LABEL: Record<string, string> = {
  FIRST_ORDER: 'ยอดขาย',
  ORDER_COUNT: 'ยอดขาย',
  PERFECT_RATING: 'รีวิว',
  HIGH_RATING: 'รีวิว',
  UNIQUE_REVIEWERS: 'รีวิว',
  VETERAN: 'อายุร้าน',
  FAST_SHIPPING: 'การจัดส่ง',
  ZERO_COMPLAINT: 'บริการ',
  FULL_VERIFICATION: 'ยืนยันตัวตน',
  SIGNUP_YEAR: 'ครบรอบ',
}

/** parse criteria.type อย่างปลอดภัย — criteria เป็น unknown ใน BadgeProgress */
export function getCategoryLabel(criteria: unknown): string | null {
  const type = (criteria as { type?: string } | null)?.type
  if (!type) return null
  return CRITERIA_CATEGORY_LABEL[type] ?? null
}

/**
 * criteriaToText — แปล criteria JSON → ข้อความไทย อธิบายวิธีปลดล็อก badge
 *
 * parse criteria as {type?:string,...} อย่างปลอดภัย (type guard ไม่ throw)
 * ครอบคลุมทุก type ที่ seed ไว้ใน DB + fallback สำหรับ unknown type
 */
export function criteriaToText(criteria: unknown): string {
  // ดึง type + numeric fields อย่างปลอดภัยผ่าน type narrowing (ไม่ throw)
  const c = criteria as Record<string, unknown> | null | undefined
  const type = typeof c?.type === 'string' ? c.type : ''

  const num = (key: string): number => {
    const v = c?.[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }

  switch (type) {
    case 'FIRST_ORDER':
      return 'สร้างออเดอร์แรกให้สำเร็จ'

    case 'ORDER_COUNT': {
      const count = num('count')
      return `สร้างออเดอร์สำเร็จให้ครบ ${count} ออเดอร์`
    }

    case 'PERFECT_RATING': {
      const minReviews = num('minReviews')
      return `รักษาคะแนนรีวิว 5.0 ดาว พร้อมรีวิวอย่างน้อย ${minReviews} ครั้ง`
    }

    case 'HIGH_RATING': {
      const minRating = num('minRating')
      const minReviews = num('minReviews')
      return `รักษาคะแนนรีวิวเฉลี่ยไม่ต่ำกว่า ${minRating} ดาว พร้อมรีวิวอย่างน้อย ${minReviews} ครั้ง`
    }

    case 'ZERO_COMPLAINT': {
      const minOrders = num('minOrders')
      return `ไม่มีออเดอร์ถูกยกเลิก ครบ ${minOrders} ออเดอร์`
    }

    case 'VETERAN': {
      const minDays = num('minDays')
      return `ใช้งานบัญชีต่อเนื่องครบ ${minDays} วัน`
    }

    case 'FAST_SHIPPING': {
      const maxHours = num('maxHours')
      const minOrders = num('minOrders')
      return `ส่งของภายใน ${maxHours} ชั่วโมงเฉลี่ย ต่อเนื่อง ${minOrders} ออเดอร์`
    }

    case 'FULL_VERIFICATION':
      return 'ยืนยันตัวตนครบทุกระดับ (L1 + L2 + L3)'

    case 'UNIQUE_REVIEWERS': {
      const count = num('count')
      return `ได้รับรีวิวจากลูกค้าไม่ซ้ำกันครบ ${count} ราย`
    }

    case 'SIGNUP_YEAR': {
      const year = num('year')
      return `เป็นสมาชิกตั้งแต่ปี ${year}`
    }

    default:
      return 'ทำตามเงื่อนไขของรางวัลนี้'
  }
}
