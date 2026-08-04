/**
 * shortcut.service.ts — เมนูลัดที่ผู้ใช้ตั้งเอง ต่อ (ผู้ใช้ x ร้าน) — feature 00027
 *
 * SSOT ของเอกสาร: docs/20 - Features/00027 - Customizable Shortcuts/{SRS,SDS,API}.md
 *
 * หลักที่ยึดทั้งไฟล์:
 *   1. catalog คำนวณสดทุกครั้งจาก resolveVisibleSellerMenu (ตัวกรองชุดเดียวกับ sidebar เป๊ะ)
 *      ห้ามเขียนกฎสิทธิ์คู่ขนานที่นี่เด็ดขาด — วันที่กฎหนึ่งเปลี่ยนแล้วอีกชุดไม่เปลี่ยน
 *      เมนูลัดจะพาผู้ใช้ไปหน้าที่เขาไม่มีสิทธิ์
 *   2. ไม่เขียน DB จนกว่าผู้ใช้จะกดจริง (compute-on-read) — เปิดหน้าเฉย ๆ ไม่สร้างแถว
 *   3. เก็บแค่ "เซ็ตของ slug" ลำดับการแสดงผล derive จากตำแหน่งใน SSOT เสมอ
 */
import { prisma } from '@/lib/prisma'
import { requireActiveShop } from '@/lib/shop-context'
import { resolveExpenseAccess, type ExpenseAccessDecision } from '@/services/expense-access.service'
import { getEntitlementInfo } from '@/services/inventory-entitlement.service'
import { resolveVisibleSellerMenu, flattenSellerMenu, sellerMenuItems } from '@/lib/seller-menu'
import type { EntitlementStatus, InventoryPackage } from '@/lib/inventory-addon'

/** จำนวนช่องสูงสุดบนการ์ด — ตรงกับ CHECK ที่ DB และกริด 4x2 ของ CarouselGrid */
export const MAX_SHORTCUTS = 8
/** ต้องเหลือช่อง "ที่ใช้ได้จริง" อย่างน้อยเท่านี้ — ช่องที่หมดสิทธิ์แล้วไม่นับ (ดู unpinShortcut) */
export const MIN_SHORTCUTS = 1

/**
 * seller:dashboard ไม่อยู่ในแคตตาล็อก — การ์ดเมนูลัดอยู่บนหน้า /dashboard เอง
 * ปักหมุดทางลัดไปหน้าที่กำลังเปิดอยู่ไม่มีความหมาย
 */
// 'seller:profile-external' ไม่ใช่หน้าในคอนโซล — เป็นลิงก์ออกไปหน้าร้านบนโดเมนผู้ซื้อ
// ปักเป็นไทล์เมนูลัดแล้วจะพาผู้ใช้ออกจากระบบไปเลยโดยไม่ทันตั้งตัว (ไทล์ไม่มี affordance ↗)
const EXCLUDED_SLUGS = new Set(['seller:dashboard', 'seller:profile-external'])

export type ShortcutCatalogItem = {
  slug: string
  label: string
  icon: string
  url: string
  /** true = ปักหมุดอยู่ตอนนี้ */
  pinned: boolean
}

/** slug ที่ปักไว้แต่ตอนนี้ไม่อยู่ในแคตตาล็อกแล้ว (สิทธิ์เปลี่ยน / เมนูถูกถอด) */
export type ShortcutUnavailableItem = {
  slug: string
  /** หา label ไม่เจอใน SSOT แล้ว (เมนูถูกลบทิ้งจริง) -> ใช้ slug ดิบ ไม่ปล่อยว่าง */
  label: string
}

export type ShortcutState = {
  kind: 'OK'
  catalog: ShortcutCatalogItem[]
  pinnedSlugs: string[]
  unavailable: ShortcutUnavailableItem[]
  /** สิ่งที่การ์ดแสดงจริง = pinned ∩ catalog เรียงตามลำดับใน SSOT */
  tiles: ShortcutCatalogItem[]
  /** true = ยังไม่เคยตั้งค่า (ค่าที่เห็นคือค่าเริ่มต้นที่คำนวณสด ยังไม่มีแถวใน DB) */
  isDefault: boolean
}

export type ShortcutAccessResult = ShortcutState | { kind: 'NO_SHOP' }

type SessionLike = { user?: { id?: string | null; activeShopId?: string | null } | null } | null

// ─── error types ─────────────────────────────────────────────────────────────
// ทุกตัวต้องมี branch รับที่ route คู่กัน (ดูตาราง API.md §5) — error ที่ไม่มีคนรับ = 500
// ทั้งที่ควรเป็น 4xx (บทเรียน feature 00003, memory feedback_service_error_route_mapping)

export class ShortcutSlugNotInCatalogError extends Error {
  constructor(readonly slug: string) {
    super('SLUG_NOT_IN_CATALOG')
  }
}
export class ShortcutCapExceededError extends Error {
  constructor() {
    super('CAP_EXCEEDED')
  }
}
export class ShortcutMinRequiredError extends Error {
  constructor() {
    super('MIN_REQUIRED')
  }
}

// ─── catalog ─────────────────────────────────────────────────────────────────

type ActiveShop = NonNullable<Awaited<ReturnType<typeof requireActiveShop>>>

/**
 * buildEligibleCatalog — เมนูที่ผู้ใช้คนนี้เลือกปักหมุดได้ ณ ขณะนี้
 *
 * fail-closed แบบเดียวกับ layout.tsx/dashboard/page.tsx: ถ้า query สิทธิ์พัง ให้ตกไปที่ค่า
 * "ไม่มีสิทธิ์" ไม่ใช่ throw ทำหน้าพัง — ผลคือเมนูบางตัวหายไปชั่วคราว ซึ่งดีกว่าเปิดให้ปักหมุด
 * เมนูที่อาจไม่มีสิทธิ์จริง
 */
async function buildEligibleCatalog(active: ActiveShop): Promise<ShortcutCatalogItem[]> {
  const shop = active.shop

  let entitlement: { status: EntitlementStatus; package: InventoryPackage | null } = {
    status: 'NOT_SUBSCRIBED',
    package: null,
  }
  try {
    entitlement = await getEntitlementInfo(shop.id)
  } catch (e) {
    console.error('[shortcut] getEntitlementInfo failed, fallback NOT_SUBSCRIBED', e)
  }

  let expense: ExpenseAccessDecision = { kind: 'NO_SHOP' }
  try {
    // ส่ง activeShopId ไปด้วย ไม่งั้น resolveExpenseAccess จะ resolve ร้านใหม่จาก default ของ user
    // ซึ่งอาจเป็นคนละร้านกับที่กำลังเปิดอยู่ (สมาชิกที่มีหลายร้าน)
    expense = await resolveExpenseAccess({ user: { id: shop.userId, activeShopId: shop.id } })
  } catch (e) {
    console.error('[shortcut] resolveExpenseAccess failed, fallback NO_SHOP', e)
  }

  const visible = resolveVisibleSellerMenu(sellerMenuItems, {
    entitlement,
    staff: { kind: active.kind, role: active.role },
    expense,
    shop: { kind: active.kind, vertical: shop.vertical },
  })

  return flattenSellerMenu(visible)
    .filter((item) => item.slug && item.url && !EXCLUDED_SLUGS.has(item.slug))
    .map((item) => ({
      slug: item.slug!,
      label: item.label ?? item.slug!,
      icon: item.icon ?? 'point',
      url: item.url!,
      pinned: false,
    }))
}

/** ค่าเริ่มต้น = 8 รายการแรกตามลำดับ sidebar ของแคตตาล็อกที่ผู้ใช้คนนี้มองเห็นจริง */
function computeDefaultSlugs(catalog: ShortcutCatalogItem[]): string[] {
  return catalog.slice(0, MAX_SHORTCUTS).map((c) => c.slug)
}

/** ประกอบ state จาก catalog + เซ็ตที่ปักไว้ — ใช้ร่วมกันทุก mutation ให้ response หน้าตาเดียวกันเสมอ */
function buildState(
  catalog: ShortcutCatalogItem[],
  pinnedSlugs: string[],
  isDefault: boolean,
): ShortcutState {
  const pinnedSet = new Set(pinnedSlugs)
  const withPinned = catalog.map((c) => ({ ...c, pinned: pinnedSet.has(c.slug) }))
  const inCatalog = new Set(catalog.map((c) => c.slug))

  // หา label ของ slug ที่หลุด catalog จาก SSOT ดิบ (ไม่ผ่านตัวกรอง) — เมนูยังมีอยู่แค่ผู้ใช้ไม่มีสิทธิ์
  // ถ้าเมนูถูกถอดออกจาก SSOT ไปแล้วจริง ๆ จะหาไม่เจอ -> ใช้ slug ดิบแทน ไม่ปล่อยช่องว่าง
  const allBySlug = new Map(
    flattenSellerMenu(sellerMenuItems)
      .filter((i) => i.slug)
      .map((i) => [i.slug!, i.label ?? i.slug!]),
  )

  return {
    kind: 'OK',
    catalog: withPinned,
    pinnedSlugs,
    unavailable: pinnedSlugs
      .filter((s) => !inCatalog.has(s))
      .map((s) => ({ slug: s, label: allBySlug.get(s) ?? s })),
    tiles: withPinned.filter((c) => c.pinned),
    isDefault,
  }
}

// ─── read ────────────────────────────────────────────────────────────────────

export async function resolveShortcutState(session: SessionLike): Promise<ShortcutAccessResult> {
  const active = await requireActiveShop(session)
  if (!active) return { kind: 'NO_SHOP' }
  const userId = session!.user!.id!

  const [catalog, pref] = await Promise.all([
    buildEligibleCatalog(active),
    prisma.sellerShortcutPreference.findUnique({
      where: { userId_shopId: { userId, shopId: active.shop.id } },
    }),
  ])

  return buildState(catalog, pref?.slugs ?? computeDefaultSlugs(catalog), !pref)
}

// ─── mutations ───────────────────────────────────────────────────────────────

/**
 * โหลดสถานะปัจจุบันเพื่อเตรียมเขียน — เซ็ตที่ใช้เป็นฐานคือ "ค่าที่ผู้ใช้เห็นอยู่จริง"
 * ซึ่งอาจเป็นค่าเริ่มต้นที่ยังไม่ได้ persist การกดครั้งแรกจึงบันทึกค่าเริ่มต้น + การแก้ไขไปพร้อมกัน
 */
async function loadForWrite(session: SessionLike) {
  const active = await requireActiveShop(session)
  if (!active) return null
  const userId = session!.user!.id!

  const [catalog, pref] = await Promise.all([
    buildEligibleCatalog(active),
    prisma.sellerShortcutPreference.findUnique({
      where: { userId_shopId: { userId, shopId: active.shop.id } },
    }),
  ])

  return {
    userId,
    shopId: active.shop.id,
    catalog,
    current: pref?.slugs ?? computeDefaultSlugs(catalog),
  }
}

async function persist(userId: string, shopId: string, slugs: string[], catalog: ShortcutCatalogItem[]) {
  await prisma.sellerShortcutPreference.upsert({
    where: { userId_shopId: { userId, shopId } },
    create: { userId, shopId, slugs },
    update: { slugs },
  })
  return buildState(catalog, slugs, false)
}

export async function pinShortcut(session: SessionLike, slug: string): Promise<ShortcutAccessResult> {
  const ctx = await loadForWrite(session)
  if (!ctx) return { kind: 'NO_SHOP' }

  // validate จาก catalog สดเสมอ ไม่ใช่จากรายการที่ client ส่งมา — client อาจถือ catalog เก่า
  // ที่ยังมีเมนูซึ่งเพิ่งหมดสิทธิ์ไปเมื่อครู่
  if (!ctx.catalog.some((c) => c.slug === slug)) throw new ShortcutSlugNotInCatalogError(slug)

  // ปักซ้ำ = ไม่ error คืนสถานะปัจจุบัน (มิเรอร์ pinProduct) — กดรัว ๆ บนมือถือไม่ควรได้ error
  if (ctx.current.includes(slug)) return buildState(ctx.catalog, ctx.current, false)

  // เต็มแล้วต้องให้ผู้ใช้เลือกเองว่าจะถอดตัวไหน — ห้ามถอดตัวเก่าสุดให้อัตโนมัติ
  if (ctx.current.length >= MAX_SHORTCUTS) throw new ShortcutCapExceededError()

  return persist(ctx.userId, ctx.shopId, [...ctx.current, slug], ctx.catalog)
}

export async function unpinShortcut(session: SessionLike, slug: string): Promise<ShortcutAccessResult> {
  const ctx = await loadForWrite(session)
  if (!ctx) return { kind: 'NO_SHOP' }

  if (!ctx.current.includes(slug)) return buildState(ctx.catalog, ctx.current, false)

  /**
   * MIN_REQUIRED นับเฉพาะช่องที่ "ยังใช้ได้จริง" — ช่องที่สิทธิ์หลุดไปแล้วไม่นับ
   * (คำตัดสิน user 2026-08-02 แทน Q5 ใน BRD §3.6 ที่เดิมระบุว่านับรวม)
   *
   * กฎนี้มีไว้กันการ์ดว่าง แต่ช่องที่ render ไม่ได้ก็ทำให้ว่างอยู่แล้ว การบล็อกจึงไม่ได้กันอะไร
   * แค่ขังผู้ใช้ไว้กับช่องที่มองไม่เห็นและถอดไม่ออก ต้องไปเพิ่มช่องใหม่ก่อนถึงจะถอดตัวนั้นได้
   */
  const inCatalog = new Set(ctx.catalog.map((c) => c.slug))
  const usable = ctx.current.filter((s) => inCatalog.has(s))
  if (usable.includes(slug) && usable.length <= MIN_SHORTCUTS) throw new ShortcutMinRequiredError()

  // เขียน next ตรง ๆ รวมถึงกรณีว่าง — ห้าม fallback เป็นค่าเดิมตอนว่าง ไม่งั้นการถอดช่อง
  // ที่หมดสิทธิ์ช่องสุดท้ายจะ "สำเร็จแบบเงียบ ๆ แต่ไม่มีอะไรเปลี่ยน"
  return persist(ctx.userId, ctx.shopId, ctx.current.filter((s) => s !== slug), ctx.catalog)
}

/**
 * รีเซ็ต — คำนวณค่าเริ่มต้นจาก catalog "สด ณ ขณะกด" ไม่ใช่ค่าที่คำนวณตอนเปิดหน้า
 * (ผู้ใช้อาจเปิดชีตแก้ไขค้างไว้ข้ามวันจนสิทธิ์เปลี่ยนไปแล้ว)
 */
export async function resetShortcuts(session: SessionLike): Promise<ShortcutAccessResult> {
  const ctx = await loadForWrite(session)
  if (!ctx) return { kind: 'NO_SHOP' }
  return persist(ctx.userId, ctx.shopId, computeDefaultSlugs(ctx.catalog), ctx.catalog)
}
