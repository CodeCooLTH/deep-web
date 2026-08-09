// หมวดร้าน seller (constant — ไม่ใช่ DB enum เพื่อปรับ label ง่าย). ใช้ทั้ง validation,
// signup dropdown, onboarding chips, public profile, filter. ปรับ label ได้ตามต้องการ.
export const SHOP_CATEGORY_LABELS = {
  // ── 10 key ดั้งเดิม (feature 00001) — ห้ามลบ/ห้ามเปลี่ยนคีย์ มีร้านจริงถืออยู่แล้ว ──
  general: 'ทั่วไป',
  fashion: 'แฟชั่น-เครื่องแต่งกาย',
  beauty_health: 'ความงาม-สุขภาพ',
  food_beverage: 'อาหาร-เครื่องดื่ม',
  electronics_it: 'อิเล็กทรอนิกส์-ไอที',
  home_living: 'บ้าน-เฟอร์นิเจอร์',
  mom_baby: 'แม่-เด็ก',
  agri_otop: 'เกษตร-OTOP',
  services_digital: 'บริการ-ดิจิทัล',
  // ── เพิ่ม 2026-08-04 (user: "น้อยไป") ──
  // ที่มา: 10 หมวดเดิมไม่มีที่ลงให้ธุรกิจจริงหลายแบบ — ตัวอย่างที่พิสูจน์ได้คือร้านของ user เอง
  // ("อะไหล่มอเตอร์ไซค์") ที่ไม่มีหมวดยานยนต์ให้เลือกเลย ต้องไปกอง "อื่นๆ"
  // และ vertical ใหม่ 2 ตัว (SERVICE_QUEUE/LODGING จาก feature 00028/00030) ไม่มีหมวดที่ตรงเลย
  automotive: 'ยานยนต์-อะไหล่',
  motorcycle: 'มอเตอร์ไซค์-อะไหล่',
  construction_tools: 'ก่อสร้าง-เครื่องมือช่าง',
  repair_install: 'ซ่อมบำรุง-ติดตั้ง',
  clinic_wellness: 'คลินิก-สปา-นวด',
  lodging_travel: 'ที่พัก-ท่องเที่ยว',
  education: 'การศึกษา-คอร์สเรียน',
  event_service: 'อีเวนต์-รับจัดงาน',
  pets: 'สัตว์เลี้ยง',
  sports_outdoor: 'กีฬา-กลางแจ้ง',
  books_stationery: 'หนังสือ-เครื่องเขียน',
  toys_hobby: 'ของเล่น-งานอดิเรก',
  jewelry_watch: 'เครื่องประดับ-นาฬิกา',
  gift_souvenir: 'ของขวัญ-ของฝาก',
  music_instrument: 'เครื่องดนตรี',
  // other ต้องอยู่ท้ายสุดเสมอ — เป็นตัวรับที่เหลือ ไม่ใช่หมวดหนึ่งในลิสต์
  other: 'อื่นๆ',
} as const

export type ShopCategoryKey = keyof typeof SHOP_CATEGORY_LABELS
export const SHOP_CATEGORY_KEYS = Object.keys(SHOP_CATEGORY_LABELS) as ShopCategoryKey[]

export function isShopCategory(value: string): value is ShopCategoryKey {
  return value in SHOP_CATEGORY_LABELS
}

/**
 * แปลงคีย์หมวดที่เก็บใน DB เป็นคำไทยที่ผู้ใช้อ่านออก
 *
 * ทำไมต้องมี helper กลาง: หน้าโปรไฟล์สาธารณะทั้งสองเส้น (/u/[username] และ /b/[slug]) ส่ง
 * `shop.category` เข้า UI ตรง ๆ มาตลอด ผู้ซื้อจึงเห็นคีย์ดิบ ("general", "motorcycle") อยู่ใน
 * บรรทัดเดียวกับชื่อผู้ใช้และวันเปิดร้าน — บนหน้าที่ทั้งหน้ามีไว้พิสูจน์ว่าร้านนี้เชื่อได้
 * ตัวหนังสือภาษาอังกฤษที่หลุดมาจากฐานข้อมูลอ่านเป็น "ระบบยังทำไม่เสร็จ"
 *
 * ที่อื่นในรีโปเขียนสำนวนนี้ซ้ำกันเองมาแล้วอย่างน้อย 3 แบบ (ShopsBrowse.tsx `catLabel`,
 * BusinessCreateModal.tsx, ShopForm.tsx) — ตัวนี้เป็นตัวเดียวที่ควรเรียกต่อจากนี้
 *
 * คีย์ที่ไม่รู้จัก (ข้อมูลเก่า/พิมพ์มือ) คืนค่าเดิม ไม่ใช่คืน null — ยังดีกว่าทำให้ข้อมูลหายเงียบ
 */
export function shopCategoryLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return isShopCategory(value) ? SHOP_CATEGORY_LABELS[value] : value
}
