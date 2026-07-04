export type EntitlementStatus = 'NOT_SUBSCRIBED' | 'ACTIVE' | 'LOCKED'

// InventoryPackage: Deep Stock Pro (feature 00009) — 2 แพ็กเกจที่ stack กัน
export type InventoryPackage = 'BASIC' | 'PRO'

// คง INVENTORY_ADDON_PRICE เดิมไว้ (backward-compat — call-site เก่าใช้ชื่อนี้อยู่)
// อ้างถึงราคา BASIC โดยนัย — ไม่ rename เพื่อกัน breaking import ทั่วโปรเจกต์
export const INVENTORY_ADDON_PRICE = 199 // = BASIC price
export const INVENTORY_PRO_PRICE = 599
export const INVENTORY_RENEWAL_PERIOD_DAYS = 30
export const INVENTORY_ADVANCE_WARNING_DAYS = 3

export const PACKAGE_PRICE: Record<InventoryPackage, number> = {
  BASIC: INVENTORY_ADDON_PRICE,
  PRO: INVENTORY_PRO_PRICE,
}

export const PACKAGE_LABEL_TH: Record<InventoryPackage, string> = {
  BASIC: 'Deep Stock',
  PRO: 'Deep Stock Pro',
}

export const WALLET_REASON = {
  INVENTORY_SUBSCRIPTION: 'INVENTORY_SUBSCRIPTION', // legacy 00003 — ห้ามเขียนใหม่, ไม่ backfill
  INVENTORY_SUBSCRIPTION_BASIC: 'INVENTORY_SUBSCRIPTION_BASIC',
  INVENTORY_SUBSCRIPTION_PRO: 'INVENTORY_SUBSCRIPTION_PRO',
  INVENTORY_SUBSCRIPTION_PRO_UPGRADE: 'INVENTORY_SUBSCRIPTION_PRO_UPGRADE',
  SMS_ORDER_LINK: 'SMS_ORDER_LINK', // เดิม ไม่แตะ
  PIN_SLOT: 'PIN_SLOT', // Pin Products (feature 00013) — ซื้อ pin slot ฿99 ถาวร
} as const

// label ไทยสำหรับ admin sidebar (FR-INV-13) — ใช้คู่กับ WALLET_REASON
export const WALLET_REASON_LABEL_TH: Record<string, string> = {
  INVENTORY_SUBSCRIPTION: 'Inventory Add-on', // legacy, คงไว้ (ไม่ relabel ย้อนหลัง — FR-DSP-11-AC-03)
  INVENTORY_SUBSCRIPTION_BASIC: 'Deep Stock',
  INVENTORY_SUBSCRIPTION_PRO: 'Deep Stock Pro',
  INVENTORY_SUBSCRIPTION_PRO_UPGRADE: 'อัพเกรดเป็น Deep Stock Pro',
  SMS_ORDER_LINK: 'SMS Order Link',
  PIN_SLOT: 'ปักหมุดสินค้า',
}

// ⚠️ BREAKING — เดิมเป็น const string object (WALLET_DESC.SUBSCRIBE ฯลฯ) เปลี่ยนเป็น function
// ทุก call-site ใน inventory-entitlement.service.ts ต้องแก้พร้อมกัน (SDS §3.2)
export const WALLET_DESC = {
  subscribe: (pkg: InventoryPackage) => `สมัคร ${PACKAGE_LABEL_TH[pkg]}`,
  renew: (pkg: InventoryPackage) => `ต่ออายุ ${PACKAGE_LABEL_TH[pkg]} (รายเดือน)`,
  reactivate: (pkg: InventoryPackage) => `เปิดใช้ ${PACKAGE_LABEL_TH[pkg]} อีกครั้ง`,
  UPGRADE: 'อัพเกรดเป็น Deep Stock Pro',
} as const

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}
