/**
 * role-nav — เมนู/แถบล่าง/ทางลัดตามบทบาท (00071 P3 · S-16) · บริสุทธิ์ (client import ได้)
 *
 * ทำไมอ่านจากทะเบียน `ROUTE_CAPABILITIES` ตัวเดียวกับ gatePage: เมนูที่โชว์กับหน้าที่ยอมให้เข้าต้อง "ตัดสินจากแหล่งเดียว"
 * ไม่งั้นเมนูพาไปหน้าที่เจอการ์ดไม่มีสิทธิ์ (permission drift) · การซ่อนเมนูเป็นแค่ UX hint — ด่านจริงอยู่ที่หน้า/route
 *
 * 🛑 ตัวกรองบทบาท "ถอดอย่างเดียว" ไม่เพิ่มรายการกลับ และต้องรัน "หลัง" applyPaymentRestriction เสมอ
 * (ลำดับกลับ = รายการที่ App Store ซ่อนอาจถูกสร้างใหม่ — ดู skill app-store-surfaces)
 */
import type { MenuItemType } from '@/types'
import { ROUTE_CAPABILITIES, isClassEntry } from '@/lib/route-capabilities'
import { can, PRIMARY_OWNER_ONLY, type Capability, type ShopRole } from '@/lib/shop-permissions'
import { canUseAppointments } from '@/lib/appointments'
import { byVertical } from '@/i18n/vertical'
import type { Dictionary } from '@/i18n/dictionaries/th'
import type { OrderVocab } from '@/lib/seller-menu'

// ─── canSeePage ──────────────────────────────────────────────────────────────

type PageRule = { re: RegExp; caps: readonly Capability[] | null; staticPath: string | null }

/** url หน้า (ไม่มี /seller) จากคีย์ไฟล์ในทะเบียน — null = ไม่ใช่หน้า seller */
function urlOfKey(key: string): string | null {
  const m = /^src\/app\/\(paces\)\/seller\/\([^)]+\)\/(.*?)\/?page\.tsx$/.exec(key)
  return m ? '/' + m[1] : null
}

/** รวมจากทะเบียนครั้งเดียวตอนโหลดโมดูล — static ก่อน แล้วค่อยแพตเทิร์น `[param]` */
const PAGE_RULES: PageRule[] = (() => {
  const rules: PageRule[] = []
  for (const [key, entry] of Object.entries(ROUTE_CAPABILITIES)) {
    const url = urlOfKey(key)
    if (!url) continue
    let caps: readonly Capability[] | null
    if (isClassEntry(entry)) {
      // MEMBER/SELF = สมาชิกทุกบทบาทเข้าได้โดยตั้งใจ
      caps = null
    } else if (entry.page) {
      caps = Array.isArray(entry.page) ? (entry.page as readonly Capability[]) : [entry.page as Capability]
    } else continue
    const dynamic = url.includes('[')
    rules.push({
      re: new RegExp('^' + url.replace(/\[[^/]+\]/g, '[^/]+') + '$'),
      caps,
      staticPath: dynamic ? null : url,
    })
  }
  return rules.sort((a, b) => Number(b.staticPath !== null) - Number(a.staticPath !== null))
})()

export type PageShop = {
  /** เป็นเจ้าของหลัก (`Shop.userId`) — T4 ใช้ · ไม่ส่ง = ไม่ใช่ (fail-closed) */
  isPrimaryOwner?: boolean
}

function passes(roles: readonly ShopRole[], caps: readonly Capability[], shop: PageShop): boolean {
  return caps.every((c) => (PRIMARY_OWNER_ONLY.has(c) && !shop.isPrimaryOwner ? false : can(roles, c)))
}

/** ทะเบียนรู้จัก url นี้ไหม — เทสใช้ยืนยันว่าทุกเมนูมีกฎ (ไม่ตกไป fail-closed "เจ้าของเท่านั้น" เงียบ ๆ) */
export function isRegisteredPage(url: string): boolean {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  return PAGE_RULES.some((r) => r.re.test(path))
}

/**
 * บทบาทชุดนี้เปิด url นี้ได้ไหม (ตัดสินจากทะเบียนเดียวกับ gatePage)
 * `roles` ต้องเป็นบทบาทที่ "มีผลจริง" แล้ว (effectiveRoles) · url ที่ทะเบียนไม่รู้จัก = เจ้าของเท่านั้น (fail-closed แบบ `can`)
 */
export function canSeePage(url: string, roles: readonly ShopRole[], shop: PageShop = {}): boolean {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  const rule = PAGE_RULES.find((r) => r.re.test(path))
  if (!rule) return roles.includes('OWNER')
  return rule.caps === null ? true : passes(roles, rule.caps, shop)
}

// ─── applyCapabilityMenu ─────────────────────────────────────────────────────

/** เมนู "พนักงาน" ไม่มีความหมายในร้านส่วนตัว (ไม่มีสมาชิกให้จัดการ) — กฎเดิมของ applyStaffMenu */
const BUSINESS_ONLY_SLUGS = new Set(['seller:admins'])

/**
 * ถอดเมนูที่บทบาทเปิดไม่ได้ (แทน applyStaffMenu + ส่วนบทบาทของ applyOwnerOnlyFinanceMenu)
 * กลุ่มที่ลูกหมดแล้วถอดทั้งกลุ่ม ไม่ทิ้งหัวข้อเปล่า · ไม่เพิ่ม/ไม่แก้รายการที่เหลือ
 */
export function applyCapabilityMenu(
  items: MenuItemType[],
  roles: readonly ShopRole[],
  shop: PageShop & { kind: string },
): MenuItemType[] {
  const keep = (i: MenuItemType): boolean => {
    if (i.slug && BUSINESS_ONLY_SLUGS.has(i.slug) && shop.kind !== 'BUSINESS') return false
    return !i.url || canSeePage(i.url, roles, shop)
  }
  const walk = (list: MenuItemType[]): MenuItemType[] =>
    list.flatMap((item) => {
      if (!item.children) return keep(item) ? [item] : []
      const children = walk(item.children)
      return children.length === 0 && item.children.length > 0 ? [] : [{ ...item, children }]
    })
  return walk(items)
}

// ─── ทางลัด: ถอดด้วยบทบาท ─────────────────────────────────────────────────────

/** slug ที่ "บทบาทนี้ถอด" (ยังมีใน SSOT แต่ผู้ใช้เปิดไม่ได้) — ใช้แยกออกจาก unavailable ของทางลัด */
export function slugsHiddenByRole(
  items: MenuItemType[],
  roles: readonly ShopRole[],
  shop: PageShop & { kind: string },
): Set<string> {
  const all = new Set<string>()
  const kept = new Set<string>()
  const collect = (list: MenuItemType[], into: Set<string>) => {
    for (const i of list) {
      if (i.slug) into.add(i.slug)
      if (i.children) collect(i.children, into)
    }
  }
  collect(items, all)
  collect(applyCapabilityMenu(items, roles, shop), kept)
  return new Set([...all].filter((s) => !kept.has(s)))
}

// ─── FAB (ย้ายมาจาก SellerBottomNav ตัวอักษรเดิม) ─────────────────────────────

export type FabAction = { label: string; href: string; icon: string }

// ─── FAB_ACTIONS — reuse ตรงจาก CreateFab (href verified จากไฟล์นั้น) ────────
// ลำดับ array: pills render ผ่าน flex-col → index 0 อยู่บนสุด, index สุดท้ายใกล้ปุ่ม FAB ที่สุด
// 'สร้างออเดอร์' เป็นล่างสุด/ใกล้นิ้วสุด (ห้ามสลับลำดับโดยไม่ดูทิศ flex-col)
export const buildFabActions = (
  vocab: OrderVocab,
  t: Dictionary,
  vertical: string | null | undefined,
  kind: string | null | undefined,
): FabAction[] => {
  /**
   * ร้านที่รับนัด (บริการ) — เหลือ 2 ปุ่ม: สร้างสินค้าหรือบริการ · สร้างงานบริการ (user เคาะ 2026-10-10)
   * ใช้ createLabel เต็ม ("สร้างงานบริการ") ไม่ใช่ createLabelShort
   */
  if (canUseAppointments({ kind: kind ?? '', vertical: vertical ?? '' })) {
    return [
      { label: byVertical(t.vocab.createProductLabel, vertical), href: '/products/new', icon: 'package-plus' },
      { label: vocab.createLabel, href: '/orders/new', icon: 'shopping-cart-plus' },
    ]
  }
  return [
    // ร้านที่ไม่รับนัด: หมวดหมู่สินค้า (ประเภทงาน = 404 ของร้านขายออนไลน์ — ห้ามเปลี่ยน)
    { label: t.dashboard.navCreateCategory, href: '/categories', icon: 'category-plus' },
    { label: byVertical(t.vocab.createProductLabel, vertical), href: '/products/new', icon: 'package-plus' },
    // createLabelShort ไม่ใช่ createLabel — pill ลอยกลางจอ คำเต็มของร้านบริการยาวเกินสวย
    { label: byVertical(t.vocab.createLabelShort, vertical), href: '/orders/new', icon: 'shopping-cart-plus' },
  ]
}

// ─── resolveMobileNav (spec §2) ──────────────────────────────────────────────

export type NavTab = {
  key: 'home' | 'orders' | 'work' | 'chat' | 'shop'
  href: string
  icon: string
  /** true = active เฉพาะ path ตรงตัว (/dashboard) */
  exactMatch: boolean
  label: string
  /** ฐานของ aria-label (ช่องออเดอร์ใช้ orderNoun เต็ม) */
  ariaLabel: string
  /** ชนิดจุด/ตัวเลขที่ช่องนี้แสดง — ตัวเลขจริงมาจาก layout */
  badge: 'pending' | 'unread' | 'shopAlert' | null
}

export type MobileNavFab =
  | { kind: 'speedDial'; actions: FabAction[] }
  | { kind: 'direct'; href: string; icon: string; ariaLabel: string; label: string }
  | null

export type MobileNav = {
  tabs: NavTab[]
  fab: MobileNavFab
  /** จำนวนแท็บที่อยู่ซ้ายของ FAB (⌈n/2⌉) — fab null = ไม่ใช้ */
  fabAfter: number
  /** คลาส grid ของ <nav> (สตริงตรงตัว ให้ Tailwind สแกนเจอ) */
  gridClass: string
}

const GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
}

const ORDER_TAB_ROLES: readonly ShopRole[] = ['OWNER', 'MANAGER', 'CHAT', 'BILLING']

/**
 * แท็บ + FAB ของแถบล่างมือถือตามบทบาท (union ของทุกบทบาทที่ถือ)
 * `roles` = บทบาทที่มีผลจริง · เจ้าของ/ผู้ดูแลได้ 4 แท็บ + FAB speed-dial เหมือนเดิมทุกประการ
 */
export function resolveMobileNav(
  roles: readonly ShopRole[],
  shop: { kind: string; vertical: string },
  vocab: OrderVocab,
  t: Dictionary,
): MobileNav {
  const tabs: NavTab[] = [
    { key: 'home', href: '/dashboard', icon: 'home-2', exactMatch: true, label: t.dashboard.navHome, ariaLabel: t.dashboard.navHome, badge: null },
  ]
  if (roles.some((r) => ORDER_TAB_ROLES.includes(r))) {
    tabs.push({
      key: 'orders', href: '/orders', icon: 'clipboard-list', exactMatch: false,
      label: byVertical(t.vocab.orderNounShort, shop.vertical),
      ariaLabel: byVertical(t.vocab.orderNoun, shop.vertical),
      badge: 'pending',
    })
  } else if (roles.length > 0 && roles.every((r) => r === 'TECHNICIAN')) {
    // ช่างล้วน: "งาน" → ตารางงานถ้าร้านรับนัด ไม่งั้นรายการออเดอร์ (มติ 6)
    const queues = canUseAppointments(shop)
    tabs.push({
      key: 'work', href: queues ? '/queues' : '/orders', icon: queues ? 'calendar-event' : 'clipboard-list',
      exactMatch: false, label: 'งาน', ariaLabel: 'งาน', badge: null,
    })
  }
  if (can(roles, 'H1')) {
    tabs.push({ key: 'chat', href: '/inbox', icon: 'message-circle', exactMatch: false, label: t.dashboard.navChat, ariaLabel: t.dashboard.navChat, badge: 'unread' })
  }
  if (can(roles, 'T1')) {
    tabs.push({ key: 'shop', href: '/shop', icon: 'building-store', exactMatch: false, label: t.dashboard.navShop, ariaLabel: t.dashboard.navShop, badge: 'shopAlert' })
  }

  let fab: MobileNavFab = null
  if (can(roles, 'P2')) {
    fab = { kind: 'speedDial', actions: buildFabActions(vocab, t, shop.vertical, shop.kind) }
  } else if (can(roles, 'O2') || can(roles, 'O2s')) {
    fab = { kind: 'direct', href: '/orders/new', icon: 'plus', ariaLabel: vocab.createLabel, label: t.dashboard.navCreate }
  }

  return {
    tabs,
    fab,
    fabAfter: Math.ceil(tabs.length / 2),
    gridClass: 'grid ' + GRID_COLS[tabs.length + (fab ? 1 : 0)],
  }
}

// ─── ShopQuickLinks (spec §6) ────────────────────────────────────────────────

/**
 * แถวที่หน้า "ร้านค้า" แสดงจากเมนูที่ผ่านตัวกรองทุกชั้นแล้ว (`visibleUrls`) — ไม่ตัดสินสิทธิ์ซ้ำ
 * `/account` แสดงเสมอ (ไม่อยู่ในนี้) · ทุกแถวต้องอยู่ในเมนูที่ผู้ใช้เห็นจริง ⇒ iOS/ผู้ดูแล/บทบาทอื่นหายตามอัตโนมัติ
 * ลำดับ = ลำดับแสดงผล (ระดับร้าน · หน้าร้าน · แพ็กเกจ · รายงาน LINE · จัดส่ง · พนักงาน)
 */
const QUICK_LINK_URLS = [
  '/verification',
  '/public-profile',
  '/subscriptions',
  '/business/line-reports',
  '/settings',
  '/admins',
] as const

export function shopQuickLinks(visibleUrls: ReadonlySet<string>): string[] {
  return QUICK_LINK_URLS.filter((u) => visibleUrls.has(u))
}
