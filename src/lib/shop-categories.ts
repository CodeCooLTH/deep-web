// หมวดร้าน seller (constant — ไม่ใช่ DB enum เพื่อปรับ label ง่าย). ใช้ทั้ง validation,
// signup dropdown, onboarding chips, public profile, filter. ปรับ label ได้ตามต้องการ.
export const SHOP_CATEGORY_LABELS = {
  general: 'ทั่วไป',
  fashion: 'แฟชั่น-เครื่องแต่งกาย',
  beauty_health: 'ความงาม-สุขภาพ',
  food_beverage: 'อาหาร-เครื่องดื่ม',
  electronics_it: 'อิเล็กทรอนิกส์-ไอที',
  home_living: 'บ้าน-เฟอร์นิเจอร์',
  mom_baby: 'แม่-เด็ก',
  agri_otop: 'เกษตร-OTOP',
  services_digital: 'บริการ-ดิจิทัล',
  other: 'อื่นๆ',
} as const

export type ShopCategoryKey = keyof typeof SHOP_CATEGORY_LABELS
export const SHOP_CATEGORY_KEYS = Object.keys(SHOP_CATEGORY_LABELS) as ShopCategoryKey[]

export function isShopCategory(value: string): value is ShopCategoryKey {
  return value in SHOP_CATEGORY_LABELS
}
