/**
 * shop-stat-vocab — คำเรียกตัวเลขบนหน้าร้านสาธารณะ ผันตามประเภทกิจการ
 *
 * 🛑 ผันทั้งชุด ไม่ใช่แทนคำนามตัวเดียว — ร้านขายอะไหล่ไม่ได้ "ให้บริการ" ลูกค้าเขา "ซื้อ"
 * คำที่ผิดโดเมนบนหน้าที่ผู้ซื้อใช้ตัดสินใจ อ่านเป็นข้อความที่ระบบเติมมาเอง ไม่ใช่ข้อมูลของร้านนี้
 *
 * 🛑 `unitLabel` (ลักษณนาม) ต้องมาจากที่นี่ ห้าม hardcode "ใบ" ที่หน้าจอ — ประโยค
 * "จาก 168 ใบที่ปิดจบ" ผิดโดเมนทันทีสำหรับร้านบ้านพัก (ครั้ง) และร้านคิวงาน (งาน)
 *
 * SSOT เดียวของคำชุดนี้ — เดิมอยู่ใน ProfileHero.tsx ซึ่งไฟล์อื่นเข้าไม่ถึงจึงเกิดการพิมพ์ซ้ำ (HR16)
 */
export type ShopStatVocab = {
  orders: string
  customers: string
  repeat: string
  /** กริยาเต็มของ "ปิดจบสำเร็จ" — ใช้ในประโยค ไม่ใช่ป้ายสั้น */
  verb: string
  /** ลักษณนามของสิ่งที่นับ */
  unitLabel: string
  /** คำเรียกของที่ขาย — ใช้เป็นชื่อแท็บ/หัวข้อกริด */
  itemNoun: string
}

/**
 * profileSoldLine — ประโยค "ยอดสะสม" ใต้ชื่อรายการบนการ์ดของหน้าร้านสาธารณะ
 * (feature 00053 TFR-005 · SSOT เดียวของถ้อยคำชุดนี้ ตาม Hard Rule 16)
 *
 * ทำไมเป็นประโยคเต็มไม่ใช่ verb+unit ให้ call site ต่อเอง: ลักษณนามผูกกับกริยาไม่ตายตัว
 * ("ขายแล้ว N **ชิ้น**" แต่ "ใช้บริการแล้ว N **ครั้ง**") การให้ call site ต่อเองคือการเปิดช่อง
 * ให้เกิด "ใช้บริการแล้ว 3 ชิ้น" โดยไม่มี tsc ตัวไหนฟ้อง
 *
 * 🛑 ตัวตัดสินคือ **การ์ดใบนี้เป็นอะไร** ไม่ใช่ **ร้านนี้ประเภทอะไร** อย่างเดียว — ร้านบ้านพัก
 * (LODGING) มีทั้งการ์ดห้องพักและการ์ดสินค้าอยู่บนหน้าเดียวกัน การ์ดสินค้าของร้านบ้านพักต้อง
 * อ่านว่า "ขายแล้ว N ชิ้น" ไม่ใช่ "เข้าพักแล้ว N ครั้ง"
 *
 * บรรทัดนี้ **ไม่ผูกกับสวิตช์ราคา** — เมื่อร้านซ่อนราคา นี่คือสิ่งเดียวที่ยังพูดแทนร้านได้บนการ์ด
 * (ผู้ใช้ระบุตรง ๆ 2026-08-23 ว่า "ยังต้องมีคำว่า ใช้บริการแล้ว 3 ครั้ง")
 */
export function profileSoldLine(
  opts: { itemKind: 'ROOM' | 'PRODUCT'; isServiceQueue?: boolean },
  formattedCount: string,
): string {
  if (opts.itemKind === 'ROOM') return `เข้าพักแล้ว ${formattedCount} ครั้ง`
  if (opts.isServiceQueue) return `ใช้บริการแล้ว ${formattedCount} ครั้ง`
  return `ขายแล้ว ${formattedCount} ชิ้น`
}

export function shopStatVocab(isLodging?: boolean, isServiceQueue?: boolean): ShopStatVocab {
  if (isLodging) {
    return {
      orders: 'การเข้าพัก',
      customers: 'ลูกค้า',
      repeat: 'พักซ้ำ',
      verb: 'เข้าพักสำเร็จ',
      unitLabel: 'ครั้ง',
      itemNoun: 'ห้องพัก',
    }
  }
  if (isServiceQueue) {
    return {
      orders: 'นัดหมาย',
      customers: 'ลูกค้า',
      repeat: 'ใช้ซ้ำ',
      verb: 'ปิดงานสำเร็จ',
      unitLabel: 'งาน',
      itemNoun: 'สินค้า',
    }
  }
  return {
    orders: 'ออเดอร์',
    customers: 'ลูกค้า',
    repeat: 'ซื้อซ้ำ',
    verb: 'ปิดออเดอร์สำเร็จ',
    unitLabel: 'ใบ',
    itemNoun: 'สินค้า',
  }
}
