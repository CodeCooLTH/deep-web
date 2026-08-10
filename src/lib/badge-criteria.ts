/**
 * badgeCriteriaLabel — คำอธิบายใต้ชื่อเหรียญบนหน้าร้านสาธารณะ ("ได้มายังไง")
 *
 * ที่มา: ref ที่ user ส่ง 2026-08-10 (Trust signals) ซึ่งเหรียญแต่ละใบมีบรรทัดรองบอกที่มา
 * เช่น "★4.9 · 50+ reviews" / "Since 2026" — ชื่อเหรียญอย่างเดียวบอกไม่ได้ว่าต้องทำอะไรถึงได้
 * และบนหน้าที่ทั้งหน้ามีไว้พิสูจน์ความน่าเชื่อถือ เหรียญที่อธิบายที่มาไม่ได้ = ของตกแต่ง
 *
 * 🛑 ข้อความทุกบรรทัด **แปลจาก `Badge.criteria` ที่เป็นเกณฑ์จริงในระบบ** ไม่ใช่คำโฆษณาที่แต่งขึ้น
 * (`prisma/badge-seed-data.ts` เป็น SSOT ของเกณฑ์) — ห้ามเติมคำที่ระบบวัดไม่ได้ เช่น
 * "ส่งตรงเวลา 98%" หรือ "ไม่มีข้อพิพาท" ซึ่งมีใน ref แต่เราไม่มีข้อมูลรองรับ
 *
 * 🛑 ชนิดที่ไม่รู้จัก → คืน null แล้ว UI ไม่ render บรรทัดนั้นเลย ไม่ใช่เดาข้อความกลาง ๆ
 * ถ้าวันหนึ่งมีเกณฑ์ชนิดใหม่ เหรียญนั้นจะแค่ไม่มีคำอธิบาย ไม่ใช่มีคำอธิบายที่ผิด
 */
type Criteria = { type?: string; [k: string]: unknown }

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)

export function badgeCriteriaLabel(criteria: unknown): string | null {
  if (!criteria || typeof criteria !== 'object') return null
  const c = criteria as Criteria

  switch (c.type) {
    case 'ORDER_COUNT': {
      const n = num(c.count)
      return n ? `ขายครบ ${n.toLocaleString('th-TH')} ออเดอร์` : null
    }
    case 'FIRST_ORDER':
      return 'ขายได้ออเดอร์แรก'
    case 'HIGH_RATING': {
      const r = num(c.minRating)
      const rev = num(c.minReviews)
      if (r && rev) return `คะแนน ${r}+ จาก ${rev}+ รีวิว`
      return r ? `คะแนน ${r}+` : null
    }
    case 'PERFECT_RATING':
      return 'คะแนนเต็มทุกรีวิว'
    case 'UNIQUE_REVIEWERS': {
      const n = num(c.count)
      return n ? `รีวิวจากลูกค้า ${n}+ คน` : null
    }
    case 'ZERO_COMPLAINT': {
      const n = num(c.minOrders)
      return n ? `ไม่มีเรื่องร้องเรียนใน ${n} ออเดอร์` : 'ไม่มีเรื่องร้องเรียน'
    }
    case 'FAST_SHIPPING': {
      const h = num(c.maxHours)
      return h ? `ส่งของภายใน ${h} ชั่วโมง` : null
    }
    case 'FULL_VERIFICATION':
      return 'ยืนยันตัวตนครบทุกระดับ'
    case 'VERIFICATION': {
      const lv = num(c.level)
      return lv ? `ยืนยันตัวตนระดับ ${lv}` : 'ยืนยันตัวตนแล้ว'
    }
    case 'VETERAN': {
      const m = num(c.months)
      return m ? `เปิดร้านมาแล้ว ${m} เดือน` : null
    }
    case 'SIGNUP_YEAR': {
      const y = num(c.year)
      // ปี ค.ศ. ในเกณฑ์ → พ.ศ. บนหน้าจอ ให้ตรงกับวันที่ที่เหลือทั้งระบบ
      return y ? `สมาชิกตั้งแต่ปี ${y + 543}` : null
    }
    case 'AUCTION_HOSTED': {
      const n = num(c.count)
      return n ? `เปิดประมูล ${n} ครั้ง` : null
    }
    case 'AUCTION_SOLD': {
      const n = num(c.count)
      return n ? `ปิดการประมูลได้ ${n} ครั้ง` : null
    }
    case 'AUCTION_WON': {
      const n = num(c.count)
      return n ? `ชนะประมูล ${n} ครั้ง` : null
    }
    case 'AUCTION_WON_COMPLETED': {
      const n = num(c.count)
      return n ? `ชนะประมูลแล้วรับของครบ ${n} ครั้ง` : null
    }
    case 'AUCTION_BID_COUNT': {
      const n = num(c.count)
      return n ? `เสนอราคา ${n} ครั้ง` : null
    }
    case 'AUCTION_HIGH_BID_COUNT': {
      const n = num(c.minBidCount)
      return n ? `ประมูลที่มีคนสู้ราคา ${n}+ ครั้ง` : null
    }
    case 'WATCHLIST_COUNT': {
      const n = num(c.count)
      return n ? `มีคนติดตามสินค้า ${n}+ ครั้ง` : null
    }
    case 'REACTION_COUNT': {
      const n = num(c.count)
      return n ? `ได้รีแอ็กชัน ${n}+ ครั้ง` : null
    }
    default:
      return null
  }
}
