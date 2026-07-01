export type EntitlementStatus = 'NOT_SUBSCRIBED' | 'ACTIVE' | 'LOCKED'

export const INVENTORY_ADDON_PRICE = 199
export const INVENTORY_RENEWAL_PERIOD_DAYS = 30
export const INVENTORY_ADVANCE_WARNING_DAYS = 3

export const WALLET_REASON = {
  INVENTORY_SUBSCRIPTION: 'INVENTORY_SUBSCRIPTION',
  SMS_ORDER_LINK: 'SMS_ORDER_LINK',
} as const

export const WALLET_DESC = {
  SUBSCRIBE: 'สมัคร Inventory Add-on',
  RENEW: 'ต่ออายุ Inventory Add-on (รายเดือน)',
  REACTIVATE: 'เปิดใช้ Inventory Add-on อีกครั้ง',
} as const

// label ไทยสำหรับ admin sidebar (FR-INV-13) — ใช้คู่กับ WALLET_REASON
export const WALLET_REASON_LABEL_TH: Record<string, string> = {
  INVENTORY_SUBSCRIPTION: 'Inventory Add-on',
  SMS_ORDER_LINK: 'SMS Order Link',
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}
