/**
 * shop-notification.ts — การแสดงผลของแจ้งเตือน "ของร้าน" (Notification ที่มี shopId · 00086 FR-020)
 *
 * ที่เดียวที่ map kind → ไอคอน/ลิงก์ ใช้ร่วมทั้งกระดิ่ง TopBar (tabler ผ่าน Paces Icon wrapper)
 * และหน้า /notifications (Solar duotone ตาม spec ของหน้านั้น) — เพิ่ม kind ใหม่ (เช่น service_job ของ FR-014)
 * = เพิ่มแถวในตารางนี้แถวเดียว
 *
 * ลิงก์เป็น path สั้นของ seller (ไม่มี /seller prefix — proxy rewrite ให้) และ "ไม่ผูกร้าน" —
 * หน้าเหล่านี้อ่านร้านจาก activeShopId ของ session ⇒ ถ้าแจ้งเตือนเป็นของอีกร้าน ต้องสลับร้านก่อนเปิด
 */

type ShopNotificationStyle = {
  /** tabler bare name (Paces `@/components/wrappers/Icon` เติม prefix ให้) — กระดิ่ง TopBar */
  icon: string
  /** Solar duotone — หน้า /notifications (NotificationFeed ใช้ชุด Solar ทั้งหน้า) */
  feedIcon: string
  /** สีไอคอน — full class string (Tailwind purge-safe) */
  colorClass: string
  /** ลิงก์คงที่ของ kind นี้ (ไม่ขึ้นกับแถว) */
  href: string | null
  /** ลิงก์รายแถว = prefix + refId (เช่น service_job_* → /orders/{publicToken}) — มีค่านี้แล้ว href ไม่ถูกใช้ */
  refPath?: string
  /** ตัวต่อ title กับ body ในหน้า /notifications — ค่าตั้งต้นช่องว่าง (ของเดิม) */
  joiner?: string
}

// งานบริการ (00086 FR-014 · UX spec T11) — ข้อความ "{ชื่อช่าง} {สิ่งที่ทำ} · {บริการ} · {ลูกค้า}" ต้องคั่นด้วย " · "
// ไอคอน/สีตามตาราง T11: closed เท่ากับ activity SERVICE_CLOSED เดิม (NotificationFeed ICON_MAP) ⇒ ตัดซ้ำแล้วหน้าตาไม่กระโดด
const serviceJob = (icon: string, feedIcon: string, colorClass: string): ShopNotificationStyle => ({
  icon, feedIcon, colorClass, href: null, refPath: '/orders/', joiner: ' · ',
})

const STYLES: Record<string, ShopNotificationStyle> = {
  staff_expense: {
    icon: 'receipt',
    feedIcon: 'solar:bill-list-bold-duotone',
    colorClass: 'text-warning',
    href: '/expenses',
  },
  service_job_claimed: serviceJob('user-check', 'solar:user-check-rounded-bold-duotone', 'text-info'),
  service_job_started: serviceJob('player-play', 'solar:play-circle-bold-duotone', 'text-primary'),
  service_job_finished: serviceJob('clock', 'solar:clock-circle-bold-duotone', 'text-warning'),
  service_job_closed: serviceJob('clipboard-check', 'solar:check-circle-bold-duotone', 'text-primary'),
}

const FALLBACK: ShopNotificationStyle = {
  icon: 'bell',
  feedIcon: 'solar:bell-bold-duotone',
  colorClass: 'text-default-500',
  href: null,
}

export function shopNotificationStyle(kind: string): ShopNotificationStyle {
  return STYLES[kind] ?? FALLBACK
}

/** ลิงก์ของแถวแจ้งเตือนนี้ — รายแถว (refPath + refId) หรือคงที่ตาม kind · refPath แต่ไม่มี refId = ไม่มีลิงก์ (ไม่เดา) */
export function shopNotificationHref(kind: string, refId: string | null | undefined): string | null {
  const st = shopNotificationStyle(kind)
  if (st.refPath) return refId ? `${st.refPath}${refId}` : null
  return st.href
}

/** ข้อความแถวในหน้า /notifications — kind ที่ไม่ได้กำหนด joiner ต่อด้วยช่องว่างแบบเดิม · body ว่าง = title ล้วน */
export function shopNotificationLabel(kind: string, title: string, body: string): string {
  const joiner = shopNotificationStyle(kind).joiner
  if (joiner === undefined) return `${title} ${body}`.trim()
  return [title.trim(), body.trim()].filter(Boolean).join(joiner)
}

/**
 * แจ้งเตือนนี้เป็นของ "ร้านอื่น" ที่ไม่ใช่ร้านที่เปิดอยู่ไหม — ใช้ตัดสินทั้ง "โชว์ชื่อร้าน" และ "ต้องสลับร้านก่อนเปิด"
 * shopId null = แจ้งเตือนระดับบัญชี (badge/แชท) ไม่ผูกร้าน ⇒ false เสมอ
 * activeShopId ว่าง (session ยังไม่ resolve) ⇒ ถือว่าเป็นอีกร้าน — สลับก่อนดีกว่าเปิดหน้าผิดร้าน
 */
export function isOtherShopNotification(
  notificationShopId: string | null | undefined,
  activeShopId: string | null | undefined,
): boolean {
  if (!notificationShopId) return false
  return notificationShopId !== activeShopId
}
