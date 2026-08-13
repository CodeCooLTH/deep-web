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
