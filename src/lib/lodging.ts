// ค่าคงที่ของ Lodging Vertical (feature 00017) — constant ไม่ใช่ DB enum เพื่อปรับ label ง่าย
// (มิเรอร์ pattern ของ src/lib/shop-categories.ts). ใช้ร่วมกันทั้ง validation, ฟอร์ม seller,
// โปรไฟล์สาธารณะ และ service layer — IMPORTANT: ห้าม hardcode ค่าเหล่านี้ซ้ำที่อื่น

// ---------------------------------------------------------------------------
// ประเภทกิจการ (Shop.vertical)
// ---------------------------------------------------------------------------
// IMPORTANT: คนละเรื่องกับ Shop.businessType (INDIVIDUAL|COMPANY — ป้ายนิติบุคคลสำหรับ L3 verification),
// Shop.kind (PERSONAL|BUSINESS — ระดับบัญชี feature 00008) และ Shop.category (หมวดสินค้า)
// ป้ายบนหน้าจอ: vertical = "ประเภทกิจการ", businessType = "ประเภทผู้ประกอบการ" (BR-LODG-04)
//
// feature 00028 — ขยายจาก 2 ทาง (GENERAL/LODGING) เป็น 3 ทาง: GENERAL เดิมแยกเป็น
// ONLINE_SALES (ขายของจริง มีจัดส่ง/สต็อก/ประมูล) กับ SERVICE_QUEUE (รับนัดคิว ไม่มีจัดส่ง)
// BR-SBT-05: ค่าเก่า GENERAL ห้ามเหลืออยู่ที่ไหนเลยหลัง migration — ไม่เก็บเป็น legacy alias
export const SHOP_VERTICALS = {
  ONLINE_SALES: 'ขายออนไลน์',
  SERVICE_QUEUE: 'สินค้าและบริการ',
  LODGING: 'บ้านพัก',
} as const

export type ShopVertical = keyof typeof SHOP_VERTICALS
export const SHOP_VERTICAL_KEYS = Object.keys(SHOP_VERTICALS) as ShopVertical[]
// BR-SBT-07: ค่าเริ่มต้นของร้านใหม่ที่ยังไม่เลือก = ONLINE_SALES (เดิม GENERAL)
export const DEFAULT_SHOP_VERTICAL: ShopVertical = 'ONLINE_SALES'

export function isShopVertical(value: string): value is ShopVertical {
  return value in SHOP_VERTICALS
}

/** คำอธิบายใต้ตัวเลือกตอนสร้างธุรกิจ — บอกว่าเลือกแล้วได้ความสามารถอะไร */
export const SHOP_VERTICAL_HINTS: Record<ShopVertical, string> = {
  ONLINE_SALES: 'ขายสินค้าที่ต้องจัดส่ง มีระบบสต็อก ประมูล และจัดส่งผ่าน iShip',
  SERVICE_QUEUE: 'รับนัดคิวลูกค้าเข้ารับบริการ ไม่มีการจัดส่งสินค้า ขายของเสริมได้',
  LODGING: 'ให้เช่าที่พักรายคืน มีระบบห้องพัก ปฏิทินว่าง และการจอง',
}

// ---------------------------------------------------------------------------
// สิ่งอำนวยความสะดวกของห้องพัก (Room.facilities)
// ---------------------------------------------------------------------------
// icon = ชื่อ tabler ที่มีจริงในชุดของ Paces (theme/paces/Admin/TS/src/app/(admin)/icons/)
// ใช้ผ่าน @iconify/react — IMPORTANT: ห้ามใช้ emoji แทน icon ทุกกรณี (Hard Rule 12)
//
// verified 2026-07-22 — ทุกชื่อ icon ด้านล่างมีจริงในชุด tabler (ตาม convention ของ
// _seller-menu.ts ที่ verify ก่อนใช้เสมอ) ตรวจผ่าน api.iconify.design/tabler.json?icons=...
// ตัวที่ตรวจแล้ว "ไม่มี" และถูกเปลี่ยนไปใช้ตัวอื่นแทน: `shower` (→ flame),
// `billiards`/`ball-8`/`cue` (→ circle-dot), `hot-tub` (→ bath)
//
// ที่มาของรายการ: research บ้านพัก/พูลวิลล่าไทยจริง (Agoda, chillpainai, poolvillacity,
// pattayapoolvillas) + amenity list มาตรฐานของ Airbnb — บ้านพักไทยมีของที่ list สากล
// ไม่ครอบ เช่น คาราโอเกะ เตาปิ้งย่าง โต๊ะพูล สระน้ำเกลือ สไลเดอร์ เคาน์เตอร์บาร์
// ซึ่งเป็นจุดขายหลักของพูลวิลล่าปาร์ตี้ในไทย
export const ROOM_FACILITY_GROUPS = {
  basics: 'พื้นฐาน',
  outdoor: 'สระและพื้นที่กลางแจ้ง',
  kitchen: 'ครัวและอาหาร',
  entertainment: 'ความบันเทิง',
  services: 'บริการและความปลอดภัย',
} as const

export type RoomFacilityGroup = keyof typeof ROOM_FACILITY_GROUPS

export const ROOM_FACILITIES = {
  // — พื้นฐาน —
  wifi: { label: 'Wi-Fi', icon: 'tabler:wifi', group: 'basics' },
  aircon: { label: 'เครื่องปรับอากาศ', icon: 'tabler:air-conditioning', group: 'basics' },
  waterHeater: { label: 'เครื่องทำน้ำอุ่น', icon: 'tabler:flame', group: 'basics' },
  tv: { label: 'สมาร์ททีวี', icon: 'tabler:device-tv', group: 'basics' },
  washer: { label: 'เครื่องซักผ้า', icon: 'tabler:wash-machine', group: 'basics' },
  ceilingFan: { label: 'พัดลมเพดาน', icon: 'tabler:propeller', group: 'basics' },
  workspace: { label: 'โต๊ะทำงาน', icon: 'tabler:desk', group: 'basics' },

  // — สระและพื้นที่กลางแจ้ง —
  privatePool: { label: 'สระว่ายน้ำส่วนตัว', icon: 'tabler:pool', group: 'outdoor' },
  saltWaterPool: { label: 'สระน้ำเกลือ', icon: 'tabler:salt', group: 'outdoor' },
  poolSlide: { label: 'สไลเดอร์ลงสระ', icon: 'tabler:ripple', group: 'outdoor' },
  jacuzzi: { label: 'อ่างจากุซซี่', icon: 'tabler:bath', group: 'outdoor' },
  garden: { label: 'สวนและสนามหญ้า', icon: 'tabler:trees', group: 'outdoor' },
  bbq: { label: 'เตาปิ้งย่าง บาร์บีคิว', icon: 'tabler:grill', group: 'outdoor' },
  outdoorDining: { label: 'โต๊ะกินข้าวกลางแจ้ง', icon: 'tabler:umbrella', group: 'outdoor' },
  campfire: { label: 'จุดก่อกองไฟ', icon: 'tabler:campfire', group: 'outdoor' },

  // — ครัวและอาหาร —
  kitchen: { label: 'ครัวพร้อมอุปกรณ์', icon: 'tabler:tools-kitchen-2', group: 'kitchen' },
  refrigerator: { label: 'ตู้เย็น', icon: 'tabler:fridge', group: 'kitchen' },
  microwave: { label: 'ไมโครเวฟ', icon: 'tabler:microwave', group: 'kitchen' },
  riceCooker: { label: 'หม้อหุงข้าว', icon: 'tabler:soup', group: 'kitchen' },
  waterDispenser: { label: 'เครื่องกดน้ำและถังน้ำแข็ง', icon: 'tabler:glass-full', group: 'kitchen' },
  coffeeMaker: { label: 'เครื่องชงกาแฟ', icon: 'tabler:coffee', group: 'kitchen' },
  bar: { label: 'เคาน์เตอร์บาร์', icon: 'tabler:glass-cocktail', group: 'kitchen' },

  // — ความบันเทิง (จุดขายหลักของพูลวิลล่าปาร์ตี้ไทย) —
  karaoke: { label: 'คาราโอเกะ', icon: 'tabler:microphone-2', group: 'entertainment' },
  bluetoothSpeaker: { label: 'ลำโพงบลูทูธ', icon: 'tabler:device-speaker', group: 'entertainment' },
  poolTable: { label: 'โต๊ะพูล สนุกเกอร์', icon: 'tabler:circle-dot', group: 'entertainment' },
  boardGames: { label: 'บอร์ดเกม', icon: 'tabler:dice', group: 'entertainment' },
  projector: { label: 'โปรเจกเตอร์', icon: 'tabler:device-projector', group: 'entertainment' },

  // — บริการและความปลอดภัย —
  parking: { label: 'ที่จอดรถ', icon: 'tabler:parking', group: 'services' },
  petFriendly: { label: 'นำสัตว์เลี้ยงได้', icon: 'tabler:paw', group: 'services' },
  securityCamera: { label: 'กล้องวงจรปิด', icon: 'tabler:device-cctv', group: 'services' },
  firstAid: { label: 'ชุดปฐมพยาบาล', icon: 'tabler:first-aid-kit', group: 'services' },
  extraBed: { label: 'เตียงเสริม', icon: 'tabler:bed', group: 'services' },
} as const satisfies Record<string, { label: string; icon: string; group: RoomFacilityGroup }>

export type RoomFacilityKey = keyof typeof ROOM_FACILITIES
export const ROOM_FACILITY_KEYS = Object.keys(ROOM_FACILITIES) as RoomFacilityKey[]

export function isRoomFacility(value: string): value is RoomFacilityKey {
  return value in ROOM_FACILITIES
}

/** จัดกลุ่มสำหรับ chip selector — 32 รายการเรียงแบน ๆ ใช้งานยาก ต้องมีหัวข้อคั่น */
export function facilitiesByGroup(): Array<{
  group: RoomFacilityGroup
  label: string
  items: Array<{ key: RoomFacilityKey; label: string; icon: string }>
}> {
  return (Object.keys(ROOM_FACILITY_GROUPS) as RoomFacilityGroup[]).map((group) => ({
    group,
    label: ROOM_FACILITY_GROUPS[group],
    items: ROOM_FACILITY_KEYS.filter((k) => ROOM_FACILITIES[k].group === group).map((key) => ({
      key,
      label: ROOM_FACILITIES[key].label,
      icon: ROOM_FACILITIES[key].icon,
    })),
  }))
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

// ---------------------------------------------------------------------------
// สถานะงานแม่บ้าน (Order.housekeepingStatus) — feature 00017 Phase 3
// ---------------------------------------------------------------------------
export const HOUSEKEEPING_STATUS = {
  PENDING: 'รอทำ',
  DONE: 'เสร็จแล้ว',
} as const

export type HousekeepingStatus = keyof typeof HOUSEKEEPING_STATUS

export function isHousekeepingStatus(value: string): value is HousekeepingStatus {
  return value in HOUSEKEEPING_STATUS
}
