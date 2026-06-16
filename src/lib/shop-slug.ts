// slug ของร้าน = public URL /{slug}. รูปแบบ a-z0-9-, 3–30 char, ห้าม leading/trailing hyphen.
// reserved = path ระบบที่ slug ห้ามชน (กัน /{slug} ทับ route จริง).
const RESERVED = new Set([
  'admin', 'api', 'auth', 'seller', 'u', 'o', 'www', 'app',
  'dashboard', 'onboarding', 'settings', 'wallet', 'products',
  'orders', 'verification', 'badges', 'notifications', 'topups',
])

export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase()
}

export function isValidSlugFormat(slug: string): boolean {
  // 3–30 ตัว, ตัวแรก/ตัวท้ายเป็น a-z0-9, ตรงกลางมี hyphen ได้
  return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug)
}
