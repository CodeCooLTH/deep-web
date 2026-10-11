/**
 * profile-tab-keys — SSOT ของ "แท็บไหนโผล่บนหน้าร้านสาธารณะ และเรียงยังไง"
 *
 * feature 00035 (ตัวจัดหน้าร้าน) — SRS TFR-002/TFR-003
 *
 * ทำไมต้องมีไฟล์นี้: ตรรกะ "แท็บไหนมีข้อมูลจริง" เคยฝังอยู่ใน JSX ของ ShopProfile.tsx อย่างเดียว
 * พอ builder ต้องรู้ชุดแท็บเดียวกันเพื่อเอาไปให้ผู้ขายจัดลำดับ ถ้าไม่ดึงออกมาจะกลายเป็นตรรกะ
 * ซ้ำสองที่ที่เดินแยกกันทีละนิดจนไม่ตรงกัน (ผู้ขายจัดลำดับแท็บที่หน้าร้านจริงไม่มี หรือกลับกัน)
 *
 * ไม่มี 'use client' โดยตั้งใจ — ต้อง import ได้ทั้งจาก Server Component (หน้า builder ที่ SSR
 * ชุดแท็บไปให้ library panel) และ Client Component (ShopProfile.tsx)
 */

/**
 * ลำดับ default ของระบบ — ใช้เป็นทั้งรายการคีย์ที่ถูกต้องทั้งหมด และลำดับตั้งต้นเมื่อร้านยังไม่เคยจัด
 *
 * ลำดับนี้ตรงกับที่ ShopProfile.tsx เคย hardcode ไว้เป๊ะ ๆ (ปักหมุดมาก่อนเสมอเมื่อร้านปักคลิปไว้
 * ตามที่ user กำหนด 2026-07-26 — คลิปคือสิ่งที่ร้านตั้งใจให้เห็นก่อนสิ่งอื่น)
 *
 * [สำคัญ]คีย์ต้องตรงกับ TAB_ICON ใน src/views/pages/user-profile/v2/ProfileTabs.tsx เสมอ
 * เพิ่มคีย์ที่นี่แล้วลืมที่นั่น = แท็บใหม่ไม่มีไอคอน (ไม่พังเสียงดัง)
 */
export const PROFILE_TAB_KEYS = [
  'pinned',
  'rooms',
  'calendar',
  'services',
  'items',
  'reviews',
  'about',
] as const

export type ProfileTabKey = (typeof PROFILE_TAB_KEYS)[number]

/**
 * แท็บที่ร้านสั่งซ่อนได้ (CR 00053 2026-10-10 hide-tabs) — เฉพาะ "เนื้อหาที่ร้านเสนอขาย"
 *
 * 🛑 ไม่มี 'reviews' โดยตั้งใจ — รีวิวคือสัญญาณความน่าเชื่อถือ ห้ามซ่อน (00035 D-9) · ไม่มี 'about'
 * เพราะเป็นแท็บเดียวที่รับประกันว่าแถบแท็บไม่ว่าง · เพิ่มคีย์ในนี้ = เปิดให้ร้านซ่อนได้ ต้องคุยก่อน
 */
export const HIDEABLE_TAB_KEYS = ['pinned', 'rooms', 'calendar', 'services', 'items'] as const

export type HideableTabKey = (typeof HIDEABLE_TAB_KEYS)[number]

export function isHideableTabKey(key: string): key is HideableTabKey {
  return (HIDEABLE_TAB_KEYS as readonly string[]).includes(key)
}

/** ข้อมูลที่ใช้ตัดสินว่าแท็บไหน "มีของจริง" พอจะ render — สะท้อนเงื่อนไขเดิมใน ShopProfile.tsx ทีละข้อ */
export type VisibleTabInput = {
  hasVideos: boolean
  isLodging: boolean
  hasRooms: boolean
  hasAvailability: boolean
  /** feature 00028 — Shop.vertical === 'SERVICE_QUEUE' */
  isServiceQueue: boolean
  hasServices: boolean
  /** !isLodging && (pinnedProducts + otherProducts) > 0 */
  hasItems: boolean
  /** ratingDistribution != null && avgRating != null */
  hasReviews: boolean
  /** ShopPageLayout.hiddenTabs — คีย์ที่ไม่อยู่ใน HIDEABLE_TAB_KEYS ถูกเมินเสมอ (D-9) */
  hiddenTabs?: readonly string[]
}

/**
 * คืนคีย์แท็บที่จะ render จริง เรียงตามลำดับ default ของระบบ
 *
 * กติกาเดิมที่ยกมาทั้งหมด ไม่เปลี่ยนพฤติกรรม:
 * - แท็บที่ไม่มีข้อมูลจะไม่ถูกสร้างเป็นตัวเลือกเลย ไม่ใช่สร้างแล้วโชว์หน้าเปล่า
 * - ห้องพัก/ปฏิทิน เฉพาะร้านบ้านพัก · บริการ เฉพาะร้านสินค้าและบริการ · สินค้า เฉพาะร้านที่ไม่ใช่บ้านพัก
 * - 'about' ไม่มีเงื่อนไข render เสมอ → ผลลัพธ์จึงไม่มีทางเป็น array ว่าง
 */
export function computeVisibleTabKeys(input: VisibleTabInput): ProfileTabKey[] {
  const visible: ProfileTabKey[] = []
  // ซ่อนได้เฉพาะคีย์ที่ร้านสั่งไว้ "และ" อยู่ใน HIDEABLE_TAB_KEYS — รีวิว/เกี่ยวกับร้านถูก push
  // ข้างล่างโดยไม่ผ่านตัวนี้เลย จึงไม่มีทางหายแม้ hiddenTabs จะมีคีย์นั้นหลุดเข้ามา
  const hidden = new Set((input.hiddenTabs ?? []).filter(isHideableTabKey))

  if (input.hasVideos && !hidden.has('pinned')) visible.push('pinned')
  if (input.isLodging && input.hasRooms && !hidden.has('rooms')) visible.push('rooms')
  if (input.isLodging && input.hasAvailability && !hidden.has('calendar')) visible.push('calendar')
  if (input.isServiceQueue && input.hasServices && !hidden.has('services')) visible.push('services')
  if (!input.isLodging && input.hasItems && !hidden.has('items')) visible.push('items')

  /* 🛑 รีวิวอยู่ "ก่อนเกี่ยวกับร้าน" ไม่ใช่แท็บแรก (user 2026-08-11 สั่งแก้ในวันเดียวกับที่สั่ง
     ให้ย้ายมาข้างหน้า — "เอา tab review ไว้ข้างหน้า เกี่ยวกับร้านครับ ไม่ใช่ tab แรก")

     เหตุผลที่ตำแหน่งนี้ถูก: แท็บแรกคือแท็บที่เปิดอยู่ตอนโหลดหน้า ถ้ารีวิวอยู่หน้าสุด ผู้ชมจะเห็น
     รีวิวก่อนเห็นของที่ร้านขาย ซึ่งสวนทางกับโจทย์ "จอแรกต้องเห็นสินค้า" ที่เป็นที่มาของการยุบ
     หัวโปรไฟล์ทั้งหมด — ตรงนี้รีวิวยังอยู่ก่อนแท็บที่คนเปิดน้อยสุด (เกี่ยวกับร้าน) จึงยังไม่ต้อง
     เลื่อนแถบแท็บไปหา แต่ไม่แย่งจอแรกไปจากสินค้า */
  if (input.hasReviews) visible.push('reviews')
  visible.push('about')

  return visible
}

/**
 * เรียง visible tab keys ตามลำดับที่ร้านจัดไว้
 *
 * [สำคัญ]`tabOrder` เป็น "ลำดับ" ไม่ใช่ allow-list — ฟังก์ชันนี้ต้องคืนคีย์ครบเท่าที่รับเข้ามาเสมอ
 * ไม่ว่า tabOrder จะมีอะไรหรือไม่มีอะไร นี่คือ guardrail ระดับโค้ดของกฎที่ว่า "แท็บปิดไม่ได้"
 * (feature 00035 D-9) — ถ้ามีใครยิง tabOrder ที่ตัดคีย์ออก แท็บนั้นต้องยังอยู่ แค่ไปต่อท้าย
 *
 * กติกา (SRS TFR-003):
 *   1. คีย์ใน tabOrder ที่อยู่ใน visible → มาก่อนตามลำดับที่ระบุ
 *   2. คีย์ใน visible ที่ไม่ได้ถูกระบุใน tabOrder → ต่อท้ายด้วยลำดับ default เดิม
 *   3. คีย์ใน tabOrder ที่ไม่อยู่ใน visible (คีย์แปลกปลอม/แท็บที่ข้อมูลหายไปแล้ว) → ข้ามเงียบ ๆ
 *   4. คีย์ซ้ำใน tabOrder → นับครั้งแรกครั้งเดียว
 */
export function applyTabOrder(visible: ProfileTabKey[], tabOrder: readonly string[]): ProfileTabKey[] {
  const remaining = new Set<ProfileTabKey>(visible)
  const ordered: ProfileTabKey[] = []

  for (const key of tabOrder) {
    // ตัดคีย์แปลกปลอมและคีย์ซ้ำทิ้งด้วยเงื่อนไขเดียวกัน — remaining ถูกลบทันทีที่หยิบไปแล้ว
    if (remaining.delete(key as ProfileTabKey)) ordered.push(key as ProfileTabKey)
  }

  // ที่เหลือต่อท้ายด้วยลำดับเดิมของ visible (ซึ่งเรียงตาม PROFILE_TAB_KEYS อยู่แล้ว)
  for (const key of visible) {
    if (remaining.delete(key)) ordered.push(key)
  }

  return ordered
}
