// ค่าคงที่ของ Lodging Vertical (feature 00017) — constant ไม่ใช่ DB enum เพื่อปรับ label ง่าย
// (มิเรอร์ pattern ของ src/lib/shop-categories.ts). ใช้ร่วมกันทั้ง validation, ฟอร์ม seller,
// โปรไฟล์สาธารณะ และ service layer — IMPORTANT: ห้าม hardcode ค่าเหล่านี้ซ้ำที่อื่น

// ---------------------------------------------------------------------------
// ประเภทกิจการ (Shop.vertical)
// ---------------------------------------------------------------------------
// IMPORTANT: คนละเรื่องกับ Shop.businessType (INDIVIDUAL|COMPANY — ป้ายนิติบุคคลสำหรับ L3 verification),
// Shop.kind (PERSONAL|BUSINESS — ระดับบัญชี feature 00008) และ Shop.category (หมวดสินค้า)
// ป้ายบนหน้าจอ: vertical = "ประเภทกิจการ", businessType = "ประเภทผู้ประกอบการ" (BR-LODG-04)
export const SHOP_VERTICALS = {
  GENERAL: 'สินค้าและบริการ',
  LODGING: 'บ้านพักตากอากาศ',
} as const

export type ShopVertical = keyof typeof SHOP_VERTICALS
export const SHOP_VERTICAL_KEYS = Object.keys(SHOP_VERTICALS) as ShopVertical[]
export const DEFAULT_SHOP_VERTICAL: ShopVertical = 'GENERAL'

export function isShopVertical(value: string): value is ShopVertical {
  return value in SHOP_VERTICALS
}

/** คำอธิบายใต้ตัวเลือกตอนสร้างธุรกิจ — บอกว่าเลือกแล้วได้ความสามารถอะไร */
export const SHOP_VERTICAL_HINTS: Record<ShopVertical, string> = {
  GENERAL: 'ขายสินค้าหรือบริการ มีระบบสินค้า สต็อก และออเดอร์',
  LODGING: 'ให้เช่าที่พักรายคืน มีระบบห้องพัก ปฏิทินว่าง และการจอง',
}

// ---------------------------------------------------------------------------
// สิ่งอำนวยความสะดวกของห้องพัก (Room.facilities)
// ---------------------------------------------------------------------------
// icon = ชื่อ tabler ที่มีจริงในชุดของ Paces (theme/paces/Admin/TS/src/app/(admin)/icons/)
// ใช้ผ่าน @iconify/react — IMPORTANT: ห้ามใช้ emoji แทน icon ทุกกรณี (Hard Rule 12)
//
// verified 2026-07-22 — ทั้ง 10 ตัวมีจริงในชุด tabler (ตาม convention ของ _seller-menu.ts
// ที่ verify ชื่อ icon ก่อนใช้เสมอ):
//   api.iconify.design/tabler.json?icons=pool,air-conditioning,car,tools-kitchen-2,
//   wash-machine,wifi,device-tv,bath,fridge,paw → found ครบ not_found = []
export const ROOM_FACILITIES = {
  pool: { label: 'สระว่ายน้ำ', icon: 'tabler:pool' },
  aircon: { label: 'เครื่องปรับอากาศ', icon: 'tabler:air-conditioning' },
  parking: { label: 'ที่จอดรถ', icon: 'tabler:car' },
  kitchen: { label: 'ครัว', icon: 'tabler:tools-kitchen-2' },
  washer: { label: 'เครื่องซักผ้า', icon: 'tabler:wash-machine' },
  wifi: { label: 'Wi-Fi', icon: 'tabler:wifi' },
  tv: { label: 'ทีวี', icon: 'tabler:device-tv' },
  waterHeater: { label: 'เครื่องทำน้ำอุ่น', icon: 'tabler:bath' },
  refrigerator: { label: 'ตู้เย็น', icon: 'tabler:fridge' },
  petFriendly: { label: 'นำสัตว์เลี้ยงได้', icon: 'tabler:paw' },
} as const

export type RoomFacilityKey = keyof typeof ROOM_FACILITIES
export const ROOM_FACILITY_KEYS = Object.keys(ROOM_FACILITIES) as RoomFacilityKey[]

export function isRoomFacility(value: string): value is RoomFacilityKey {
  return value in ROOM_FACILITIES
}

// ---------------------------------------------------------------------------
// มัดจำ (Room.depositMode / Room.depositValue)
// ---------------------------------------------------------------------------
export const DEPOSIT_MODES = {
  FIXED: 'จำนวนเงิน (บาท)',
  PERCENT: 'เปอร์เซ็นต์ของยอดรวม',
} as const

export type DepositMode = keyof typeof DEPOSIT_MODES

export function isDepositMode(value: string): value is DepositMode {
  return value in DEPOSIT_MODES
}

// ---------------------------------------------------------------------------
// เหตุผลการยกเลิกการจอง (Order.cancelReason) — ใช้ใน Phase 2
// ---------------------------------------------------------------------------
// IMPORTANT: `countsAgainstGuest` เป็นแหล่งความจริงเดียวที่ตัดสินว่าการยกเลิกครั้งนั้นเข้าประวัติผู้จองหรือไม่
// (BR-LODG-37) — ห้ามกระจายเงื่อนไขนี้ไปเขียนซ้ำที่ service/route/หน้าจอ ให้อ่านจากตรงนี้เสมอ
export const CANCEL_REASONS = {
  BUYER_NO_TRANSFER: { label: 'ผู้จองไม่โอน', countsAgainstGuest: true },
  BUYER_REQUESTED: { label: 'ผู้จองขอยกเลิก', countsAgainstGuest: true },
  SHOP_ISSUE: { label: 'ห้องมีปัญหา หรือเหตุผลของร้าน', countsAgainstGuest: false },
  MUTUAL: { label: 'ตกลงกันได้', countsAgainstGuest: false },
} as const

export type CancelReason = keyof typeof CANCEL_REASONS
export const CANCEL_REASON_KEYS = Object.keys(CANCEL_REASONS) as CancelReason[]

export function isCancelReason(value: string): value is CancelReason {
  return value in CANCEL_REASONS
}

/** เหตุผลนี้นับเข้าประวัติการยกเลิกของผู้จองหรือไม่ (BR-LODG-37) */
export function cancelReasonCountsAgainstGuest(reason: string): boolean {
  return isCancelReason(reason) && CANCEL_REASONS[reason].countsAgainstGuest
}

// ---------------------------------------------------------------------------
// ข้อจำกัดเชิงตัวเลข
// ---------------------------------------------------------------------------
export const MAX_ROOM_IMAGES = 10 // BR-LODG-34 (D-05)
export const MAX_ROOM_NAME_LENGTH = 100
export const MAX_ROOM_DESCRIPTION_LENGTH = 1000
export const MAX_ROOM_GUESTS = 50
