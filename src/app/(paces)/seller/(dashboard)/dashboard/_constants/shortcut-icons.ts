/**
 * shortcut-icons.ts — ไอคอนของช่อง "เมนูลัด" บนหน้าแรก (feature 00027)
 *
 * ทำไมต้องมีไฟล์นี้ (user 2026-08-05 "ทำไม logo ตรงออเดอร์กับเมนูลัดไม่เข้าพวกกัน ผมชอบตรง
 * คำสั่งซื้อนะ"): การ์ด "สถานะคำสั่งซื้อ" กับ "เมนูลัด" วางติดกันในจอเดียว แต่ใช้ไอคอนคนละชุด —
 * ใบบนเป็น Solar bold-duotone (ทึบ สองโทน) ใบล่างเป็น Tabler outline (เส้นบาง) ขนาด 30px เท่ากัน
 * แต่น้ำหนักสายตาต่างกันจนอ่านเป็นของคนละระบบ. ที่นี่คือ mapping slug → ไอคอน Solar duotone
 * ให้ใบล่างเข้าชุดกับใบบน
 *
 * สำคัญ: ทำไมไม่แก้ `icon` ใน src/lib/seller-menu.ts ตรง ๆ: ค่านั้นคือไอคอน **sidebar** ด้วย
 * (SSOT เดียวกัน) — แก้ที่นั่น = เมนูข้างเปลี่ยนตามทั้งแถบโดยไม่มีใครสั่ง. เมนูลัดกับ sidebar
 * เป็นคนละ surface ที่ตั้งใจให้ต่างกัน: sidebar เป็นแถบ chrome เส้นบางอ่านเป็นลิสต์,
 * เมนูลัดเป็นกริดไอคอนใหญ่ที่ต้องแยกออกจากกันด้วยรูปทรงในพริบตา
 *
 * pure data module — ไม่มี hook/state/prisma จึง import ได้ทั้งจาก client component
 * (CarouselGrid / ShortcutEditSheet เป็น 'use client') โดยไม่ลาก server code เข้า bundle
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 *   (ผ่าน OrderStatusBand.tsx ซึ่งเป็นต้นแบบสไตล์ไอคอนที่ user ชี้ว่าชอบ — solar:*-bold-duotone)
 * Design Spec: safepay-ux 2026-08-05 (เมนูลัด icon parity) — spec เสนอทาง (ก) duotone สีน้ำเงิน
 *   ล้วน แต่ **user ตีกลับทันทีที่เห็น** ("ไม่เห็นมีสีสันเลย" / "ทำไมใช้สีน้ำเงินล้วน" 2026-08-05)
 *   จึงใช้ทาง (ค) = duotone + สีต่อช่อง ตามที่ spec เปิดทางไว้เป็น fallback
 *
 * กติกาสีที่ยึด (ไม่ใช่สุ่มสีให้ครบ ๆ):
 *   1. ใช้เฉพาะ semantic token ของธีม — primary/info/warning/success — ห้าม hex ห้าม arbitrary (HR7)
 *   2. **ไม่ใช้ danger (แดง) เลย** — แดงในระบบนี้แปลว่า "มีปัญหา" (การ์ดบนใช้กับ "พัสดุมีปัญหา")
 *      เอามาแปะช่องนำทางเฉย ๆ = โกหกว่ามีอะไรเสีย
 *   3. **เขียว (success) สงวนไว้ 2 ช่องที่แปลว่า "ผ่าน/สำเร็จ" จริง** — ระดับร้าน (ยืนยันตัวตน)
 *      กับ ความสำเร็จ (badge) ตาม Verified-Means-Green ของ Impeccable; ช่องอื่นห้ามเขียว
 *      แม้แต่ช่องเรื่องเงิน (เขียว=เงิน เป็นคนละภาษากับเขียว=ยืนยันแล้วในระบบนี้)
 *   4. ไม่ใช้ secondary (ม่วง) — ม่วงเป็นภาษาของฝั่ง buyer/Vuexy ไม่ใช่ Paces
 *
 * ทุกชื่อในไฟล์นี้ verify กับ node_modules/@iconify/json/json/solar.json แล้วว่ามีจริง
 * (ชื่อที่ไม่มีอยู่จริงจะ render เป็นกล่องว่าง ไม่ throw — grep ไม่เจอ tsc ไม่จับ)
 */

/**
 * สำคัญ: ห้ามใช้ไอคอนที่ซ้ำกับ OrderStatusBand — การ์ดสองใบนี้อยู่ในสายตาเดียวกันเสมอ
 * ไอคอนที่การ์ดบนจองไว้แล้ว: clipboard-list (รอเลขพัสดุ) · box (รอรับเข้า) ·
 * delivery (กำลังจัดส่ง) · danger-triangle (พัสดุมีปัญหา) · clock-circle · check-circle · close-circle
 * จึงเลือก bag-4 ให้ "สินค้า" (ไม่ใช่ box) และ scooter ให้ "การจัดส่ง" (ไม่ใช่ delivery)
 */
export type ShortcutTileIcon = {
  /** ชื่อไอคอน Solar duotone (มี namespace แล้ว — wrapper Icon จะไม่ prefix tabler: ซ้ำ) */
  icon: string
  /** คลาสสีของธีม — ใช้ token เท่านั้น (ดูกติกาสีข้อ 1-4 ด้านบน) */
  tone: 'text-primary' | 'text-info' | 'text-warning' | 'text-success'
}

const SHORTCUT_ICON_MAP: Record<string, ShortcutTileIcon> = {
  // ANALYTICS
  'seller:sales': { icon: 'solar:chart-2-bold-duotone', tone: 'text-info' },

  // MANAGE
  'seller:orders': { icon: 'solar:bill-list-bold-duotone', tone: 'text-primary' },
  // Solar ไม่มี "gavel" — sledgehammer คือค้อนที่ใกล้ค้อนประมูลที่สุดในชุดนี้
  'seller:auctions': { icon: 'solar:sledgehammer-bold-duotone', tone: 'text-warning' },
  // bag ไม่ใช่ box: box ถูกการ์ด "รอรับเข้า" ด้านบนใช้ไปแล้ว (ดูหมายเหตุด้านบน)
  'seller:products': { icon: 'solar:bag-4-bold-duotone', tone: 'text-primary' },
  'seller:inventory': { icon: 'solar:archive-bold-duotone', tone: 'text-info' },
  'seller:queues': { icon: 'solar:armchair-2-bold-duotone', tone: 'text-warning' },
  'seller:rooms': { icon: 'solar:bed-bold-duotone', tone: 'text-info' },
  'seller:calendar': { icon: 'solar:calendar-bold-duotone', tone: 'text-primary' },
  // ต้องต่างจาก seller:calendar ด้านบน — mark = ปฏิทินที่มีหมายจองแล้ว
  'seller:bookings': { icon: 'solar:calendar-mark-bold-duotone', tone: 'text-info' },
  // ไม้กวาด — ตรงกว่า users ทั่วไป และไม่ชนกับ seller:customers/seller:admins
  'seller:housekeepers': { icon: 'solar:broom-bold-duotone', tone: 'text-warning' },
  'seller:customers': { icon: 'solar:user-circle-bold-duotone', tone: 'text-primary' },
  // ส้มไม่ใช่เขียว: เขียวสงวนให้ "ผ่าน/ยืนยันแล้ว" เท่านั้น (กติกาข้อ 3)
  'seller:expenses': { icon: 'solar:banknote-2-bold-duotone', tone: 'text-warning' },

  // CHAT
  'seller:inbox': { icon: 'solar:chat-round-dots-bold-duotone', tone: 'text-primary' },
  // arrow = การตอบกลับ; ทรงเหลี่ยมเพื่อแยกจาก inbox ที่เป็นทรงกลม
  'seller:settings-auto-reply': { icon: 'solar:chat-square-arrow-bold-duotone', tone: 'text-info' },
  // Solar ไม่มี "robot" ทั้งชุด — cpu-bolt (ชิป+สายฟ้า) สื่อ "ทำงานอัตโนมัติ"
  // หมายเหตุ: ที่อื่นในแอป (AutoReplyTag/ChatbotClient/BotPausedBanner) ยังใช้ tabler robot อยู่
  'seller:settings-chatbot': { icon: 'solar:cpu-bolt-bold-duotone', tone: 'text-warning' },

  // SHOPS
  // ดาวสีเหลือง = ภาษาสากลของเรตติ้ง (สีเดียวกับดาวในหน้ารีวิว)
  'seller:reviews': { icon: 'solar:star-bold-duotone', tone: 'text-warning' },
  // เขียว 1 ใน 2 ช่องที่ได้ใช้ — "ยืนยันตัวตนผ่านแล้ว" คือความหมายต้นทางของเขียวในระบบนี้
  'seller:verification': { icon: 'solar:shield-check-bold-duotone', tone: 'text-success' },
  'seller:badges': { icon: 'solar:medal-star-bold-duotone', tone: 'text-success' },
  'seller:wallet': { icon: 'solar:wallet-bold-duotone', tone: 'text-warning' },
  'seller:subscriptions': { icon: 'solar:crown-bold-duotone', tone: 'text-warning' },
  'seller:admins': { icon: 'solar:users-group-rounded-bold-duotone', tone: 'text-primary' },

  // SETTING
  'seller:shop': { icon: 'solar:shop-bold-duotone', tone: 'text-primary' },
  'seller:public-profile': { icon: 'solar:global-bold-duotone', tone: 'text-info' },
  // scooter ไม่ใช่ delivery: delivery ถูกการ์ด "กำลังจัดส่ง" ด้านบนใช้ไปแล้ว
  'seller:settings': { icon: 'solar:scooter-bold-duotone', tone: 'text-info' },
  'seller:settings-channels': { icon: 'solar:plug-circle-bold-duotone', tone: 'text-primary' },
}

/**
 * ช่องสำรองสำหรับ slug ที่ยังไม่ได้ map (เมนูใหม่ในอนาคต) — ต้องเป็น duotone เหมือนกัน
 * ไม่ใช่ตกกลับไปเป็น tabler outline ซึ่งจะพาความ "ไม่เข้าพวก" กลับมาทีละช่องอย่างเงียบ ๆ
 */
const FALLBACK_TILE: ShortcutTileIcon = {
  icon: 'solar:widget-6-bold-duotone',
  tone: 'text-primary',
}

export function getShortcutTileIcon(slug: string): ShortcutTileIcon {
  return SHORTCUT_ICON_MAP[slug] ?? FALLBACK_TILE
}
