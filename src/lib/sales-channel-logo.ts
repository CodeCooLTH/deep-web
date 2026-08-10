/**
 * โลโก้แบรนด์ของ "ช่องทางการขาย" (self-host ใน public/images/logos) — SSOT ที่เดียว
 *
 * ทำไมต้องมีไฟล์นี้: แมปชุดเดียวกันเคยถูกก็อปไว้ 2 ที่ (`PLATFORM_LOGO` ใน OrderSourceLogo.tsx และ
 * `CHANNEL_LOGO` ใน OrderCard.tsx) โดยคอมเมนต์ของทั้งคู่เขียนกำกับกันเองว่า "ตัวเดียวกับอีกไฟล์" —
 * ซึ่งเป็นสัญญาว่าคนเพิ่มช่องทางใหม่ต้องจำได้เองว่ามี 2 ที่ (HR16). พอเพิ่ม Instagram 2026-08-10
 * ต้องไปแก้ทั้งคู่พร้อมกันจริง ๆ ถึงจะไม่เพี้ยน
 *
 * ช่องทางที่ไม่มีไฟล์โลโก้ (STOREFRONT/TIKTOK/OTHER) ไม่ต้องมีคีย์ที่นี่ — ผู้เรียกถอยไปใช้ tabler
 * icon จาก SALES_CHANNEL_ICONS เอง
 *
 * 🛑 ไฟล์ทรงกลม (`*-circle.svg`) สำหรับจุดที่ถูก CSS clip เป็นวงกลม — ไอคอนแอปทรงสี่เหลี่ยมมนของ
 * Instagram จะโดนตัดมุมจนเสียรูป (เหตุผลเต็มอยู่ที่ ChannelBadge.tsx ซึ่งเจอก่อนตั้งแต่ 2026-07-23)
 *
 * 🛑 โลโก้แบรนด์คือ "สี = ตัวตน" — ห้ามย้อมเทา/ทับสีตามสถานะของ UI รอบข้าง
 * (docs/conventions/contrast-fix-keeps-hue.md: ไอคอนกลุ่มนี้ไม่อยู่ใต้กฎคอนทราสต์ของข้อความ)
 */
export const SALES_CHANNEL_LOGO: Record<string, string> = {
  FACEBOOK: '/images/logos/facebook.svg',
  INSTAGRAM: '/images/logos/instagram-circle.svg',
  LINE: '/images/logos/line.svg',
}
