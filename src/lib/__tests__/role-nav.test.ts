/**
 * role-nav (00071 P3 · S-16) — เมนู/แถบล่าง/ทางลัด/ทางลัดหน้าร้านตามบทบาท
 * ตารางคาดหวังเขียนมือจาก spec §2/§6 (ไม่ derive จากโค้ด) — เซลล์ไหนเปลี่ยนต้องมีคนตั้งใจแก้ที่นี่
 */
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/dictionaries/th'
import {
  applyCapabilityMenu,
  bottomNavHiddenPages,
  buildFabActions,
  canSeePage,
  isRegisteredPage,
  queuesCreateBarRenders,
  resolveMobileNav,
  shopQuickLinks,
  slugsHiddenByRole,
} from '@/lib/role-nav'
import {
  flattenSellerMenu,
  resolveOrderVocab,
  resolveVisibleSellerMenu,
  sellerMenuItems,
} from '@/lib/seller-menu'
import { effectiveRoles, type ShopRole } from '@/lib/shop-permissions'

const SERVICE = { kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' }
const ONLINE = { kind: 'BUSINESS', vertical: 'ONLINE_SALES' }
const LODGING = { kind: 'BUSINESS', vertical: 'LODGING' }
const PERSONAL = { kind: 'PERSONAL', vertical: 'ONLINE_SALES' }

/** บทบาทที่มีผลจริงของ ADMIN ที่ถือ roles ชุดนี้ (ผ่านกฎ BILLING เดียวกับ production) */
const eff = (shop: typeof SERVICE, roles: string[]) => effectiveRoles(shop, 'ADMIN', roles)
const nav = (roles: ShopRole[], shop = SERVICE) => resolveMobileNav(roles, shop, resolveOrderVocab(shop.vertical), th)
const keys = (n: ReturnType<typeof nav>) => n.tabs.map((t) => t.key)

describe('resolveMobileNav — spec §2 ทีละเซลล์', () => {
  const cases: [string, ShopRole[], string[], string, string, number][] = [
    // ชื่อ, roles, แท็บ, ชนิด FAB, grid, fabAfter
    ['OWNER', ['OWNER'], ['home', 'orders', 'chat', 'shop'], 'speedDial', 'grid grid-cols-5', 2],
    ['MANAGER', ['MANAGER'], ['home', 'orders', 'chat', 'shop'], 'speedDial', 'grid grid-cols-5', 2],
    // 00086 FR-016: ร้านบริการ บทบาทที่มีปุ่ม + เติมแท็บจนครบ 4 (แชท → ร้านค้า → ตารางงาน → ลูกค้า ตามสิทธิ์)
    ['CHAT', ['CHAT'], ['home', 'orders', 'chat', 'queues'], 'direct', 'grid grid-cols-5', 2],
    ['BILLING', ['BILLING'], ['home', 'orders', 'queues', 'customers'], 'direct', 'grid grid-cols-5', 2],
    // 00086 P3 (FR-008): ช่างล้วนร้านบริการ = หน้าหลัก · งานของฉัน · ตารางงาน · ไม่มีปุ่ม +
    ['TECHNICIAN', ['TECHNICIAN'], ['home', 'mine', 'queues'], 'none', 'grid grid-cols-3', 1],
    ['CHAT+TECH = CHAT', ['CHAT', 'TECHNICIAN'], ['home', 'orders', 'chat', 'queues'], 'direct', 'grid grid-cols-5', 2],
    ['BILLING+TECH = BILLING', ['BILLING', 'TECHNICIAN'], ['home', 'orders', 'queues', 'customers'], 'direct', 'grid grid-cols-5', 2],
    ['CHAT+BILLING = CHAT', ['CHAT', 'BILLING'], ['home', 'orders', 'chat', 'queues'], 'direct', 'grid grid-cols-5', 2],
    ['MANAGER+TECH = MANAGER', ['MANAGER', 'TECHNICIAN'], ['home', 'orders', 'chat', 'shop'], 'speedDial', 'grid grid-cols-5', 2],
    ['MANAGER+CHAT+BILLING = MANAGER', ['MANAGER', 'CHAT', 'BILLING'], ['home', 'orders', 'chat', 'shop'], 'speedDial', 'grid grid-cols-5', 2],
  ]
  it.each(cases)('%s', (_n, roles, tabs, fab, grid, after) => {
    const n = nav(roles)
    expect(keys(n)).toEqual(tabs)
    expect(n.fab?.kind ?? 'none').toBe(fab)
    expect(n.gridClass).toBe(grid)
    if (n.fab) expect(n.fabAfter).toBe(after)
  })

  // ร้านประเภทอื่น: แถบเดิมทุกตัวอักษร (ค่าก่อน 00086)
  const otherVerticals: [string, ShopRole[], { kind: string; vertical: string }, string[], string, string, number][] = [
    ['ONLINE OWNER', ['OWNER'], ONLINE, ['home', 'orders', 'chat', 'shop'], 'speedDial', 'grid grid-cols-5', 2],
    ['ONLINE MANAGER', ['MANAGER'], ONLINE, ['home', 'orders', 'chat', 'shop'], 'speedDial', 'grid grid-cols-5', 2],
    ['ONLINE CHAT', ['CHAT'], ONLINE, ['home', 'orders', 'chat'], 'direct', 'grid grid-cols-4', 2],
    ['ONLINE BILLING (ไม่ผ่าน effectiveRoles)', ['BILLING'], ONLINE, ['home', 'orders'], 'direct', 'grid grid-cols-3', 1],
    ['ONLINE TECHNICIAN', ['TECHNICIAN'], ONLINE, ['home', 'work'], 'none', 'grid grid-cols-2', 1],
    ['LODGING TECHNICIAN', ['TECHNICIAN'], LODGING, ['home', 'work'], 'none', 'grid grid-cols-2', 1],
    ['PERSONAL ONLINE TECHNICIAN', ['TECHNICIAN'], PERSONAL, ['home', 'work'], 'none', 'grid grid-cols-2', 1],
    ['LODGING OWNER', ['OWNER'], LODGING, ['home', 'orders', 'chat', 'shop'], 'speedDial', 'grid grid-cols-5', 2],
    ['LODGING CHAT', ['CHAT'], LODGING, ['home', 'orders', 'chat'], 'direct', 'grid grid-cols-4', 2],
    ['LODGING BILLING (ไม่ผ่าน effectiveRoles)', ['BILLING'], LODGING, ['home', 'orders'], 'direct', 'grid grid-cols-3', 1],
    ['PERSONAL ONLINE CHAT', ['CHAT'], PERSONAL, ['home', 'orders', 'chat'], 'direct', 'grid grid-cols-4', 2],
  ]
  it.each(otherVerticals)('ร้านประเภทอื่นไม่เปลี่ยน: %s', (_n, roles, shop, tabs, fab, grid, after) => {
    const n = resolveMobileNav(roles, shop, resolveOrderVocab(shop.vertical), th)
    expect(keys(n)).toEqual(tabs)
    expect(n.fab?.kind ?? 'none').toBe(fab)
    expect(n.gridClass).toBe(grid)
    if (n.fab) expect(n.fabAfter).toBe(after)
    expect(keys(n)).not.toContain('queues')
    expect(keys(n)).not.toContain('customers')
  })

  it('00086 FR-016: แท็บเติมของร้านบริการ — href/icon/ป้าย/ไม่มี badge · ปุ่ม + อยู่กลาง (2 ซ้าย 2 ขวา)', () => {
    const chat = nav(['CHAT'])
    expect(chat.tabs.map((t) => t.label)).toEqual(['หน้าหลัก', 'บริการ', 'แชท', 'ตารางงาน'])
    const billing = nav(['BILLING'])
    expect(billing.tabs.map((t) => t.label)).toEqual(['หน้าหลัก', 'บริการ', 'ตารางงาน', 'ลูกค้า'])
    expect(billing.tabs.slice(2).map((t) => [t.href, t.icon, t.exactMatch, t.badge])).toEqual([
      ['/queues', 'calendar-event', false, null],
      ['/customers', 'users', false, null],
    ])
    for (const n of [chat, billing]) expect([n.tabs.length, n.fabAfter]).toEqual([4, 2])
    // เจ้าของ/ผู้ดูแล = หน้าหลัก · บริการ · + · แชท · ร้านค้า เหมือนเดิม
    expect(nav(['OWNER']).tabs.map((t) => t.label)).toEqual(['หน้าหลัก', 'บริการ', 'แชท', 'ร้านค้า'])
    expect(nav(['MANAGER']).tabs.map((t) => t.label)).toEqual(['หน้าหลัก', 'บริการ', 'แชท', 'ร้านค้า'])
    // ช่างล้วนไม่มีปุ่ม + → ไม่เข้ากติกาเติมแท็บ (แถบของช่างมาจาก P3 — ดูเทสถัดไป)
    expect(keys(nav(['TECHNICIAN']))).toEqual(['home', 'mine', 'queues'])
  })

  it('[blocker] 00086 P3 ช่างล้วนร้านบริการ: งานของฉัน → /my-jobs · ตารางงาน → /queues · ไม่มี badge/FAB', () => {
    const n = nav(['TECHNICIAN'], SERVICE)
    expect(n.tabs.map((t) => [t.href, t.icon, t.label, t.badge])).toEqual([
      ['/dashboard', 'home-2', 'หน้าหลัก', null],
      ['/my-jobs', 'user-check', 'งานของฉัน', null],
      ['/queues', 'calendar-event', 'ตารางงาน', null],
    ])
    expect(n.fab).toBeNull()
  })

  it('ช่างล้วนร้านอื่น: "งาน" ไป /orders · แถบเดิม (ไม่มี /my-jobs)', () => {
    for (const shop of [ONLINE, LODGING, PERSONAL]) {
      const n = nav(['TECHNICIAN'], shop)
      expect(n.tabs[1]).toMatchObject({ key: 'work', href: '/orders', icon: 'clipboard-list', label: 'งาน', badge: null })
      expect(n.tabs.map((t) => t.href)).not.toContain('/my-jobs')
    }
  })

  it('[blocker] ช่างที่ถือบทบาทอื่นด้วย (ไม่ใช่ช่างล้วน) ร้านบริการ: ไม่มีแท็บ "งานของฉัน" — แถบเท่า P1', () => {
    for (const roles of [['CHAT', 'TECHNICIAN'], ['BILLING', 'TECHNICIAN'], ['MANAGER', 'TECHNICIAN'], ['OWNER'], ['CHAT'], ['BILLING']] as ShopRole[][]) {
      expect(keys(nav(roles)), roles.join('+')).not.toContain('mine')
    }
  })

  it('/my-jobs อยู่ในทะเบียน (Q1) — ช่างเปิดได้ · ไม่ตก fail-closed เจ้าของเท่านั้น', () => {
    expect(isRegisteredPage('/my-jobs')).toBe(true)
    expect(canSeePage('/my-jobs', ['TECHNICIAN'])).toBe(true)
  })

  it('FAB ตรง: /orders/new · ป้ายอ่านจอ = vocab.createLabel · ป้ายใต้ปุ่ม = navCreate', () => {
    const f = nav(['BILLING']).fab
    expect(f).toMatchObject({ kind: 'direct', href: '/orders/new', icon: 'plus', ariaLabel: resolveOrderVocab('SERVICE_QUEUE').createLabel, label: th.dashboard.navCreate })
  })

  it('เจ้าของ = DOM เดิม: ช่อง href/icon/exactMatch/badge เท่าเดิม', () => {
    expect(nav(['OWNER'], ONLINE).tabs.map((t) => [t.href, t.icon, t.exactMatch, t.badge])).toEqual([
      ['/dashboard', 'home-2', true, null],
      ['/orders', 'clipboard-list', false, 'pending'],
      ['/inbox', 'message-circle', false, 'unread'],
      ['/shop', 'building-store', false, 'shopAlert'],
    ])
  })

  it('[blocker] FAB speed-dial ร้านบริการ = 2 ปุ่ม (ไม่มีหมวดหมู่) · ร้านขายออนไลน์ = 3 ปุ่ม เริ่มที่หมวดหมู่', () => {
    const svc = buildFabActions(resolveOrderVocab('SERVICE_QUEUE'), th, 'SERVICE_QUEUE', 'BUSINESS')
    expect(svc.map((a) => a.href)).toEqual(['/products/new', '/orders/new'])
    const on = buildFabActions(resolveOrderVocab('ONLINE_SALES'), th, 'ONLINE_SALES', 'BUSINESS')
    expect(on.map((a) => a.href)).toEqual(['/categories', '/products/new', '/orders/new'])
    const f = nav(['MANAGER'], ONLINE).fab
    expect(f?.kind === 'speedDial' && f.actions.map((a) => a.href)).toEqual(on.map((a) => a.href))
  })

  it('BILLING ในร้านที่ขายบริการไม่ได้ถูกตัดบทบาท → เหลือแต่หน้าหลัก ไม่มี FAB', () => {
    const n = nav(eff(ONLINE, ['BILLING']), ONLINE)
    expect(keys(n)).toEqual(['home'])
    expect(n.fab).toBeNull()
  })
})

describe('canSeePage — ตามทะเบียนเดียวกับ gatePage', () => {
  const ALL: ShopRole[] = ['OWNER', 'MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN']
  // หน้า → บทบาทที่เห็น (ตาม BRD §8.3 / registry page cap)
  const table: [string, ShopRole[]][] = [
    ['/dashboard', ALL],
    ['/badges', ALL],
    ['/inbox', ['OWNER', 'MANAGER', 'CHAT']],
    ['/orders', ['OWNER', 'MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN']],
    ['/queues', ALL],
    ['/products', ['OWNER', 'MANAGER', 'CHAT', 'BILLING']],
    ['/customers', ['OWNER', 'MANAGER', 'CHAT', 'BILLING']],
    ['/sales', ['OWNER']],
    ['/sales?tab=expense', ['OWNER']],
    ['/wallet', ['OWNER']],
    ['/settings', ['OWNER', 'MANAGER']],
    ['/settings/channels', ['OWNER', 'MANAGER']],
    ['/settings/job-types', ['OWNER', 'MANAGER']],
    ['/reviews', ['OWNER', 'MANAGER']],
    ['/reports/agents', ['OWNER', 'MANAGER', 'CHAT']],
    ['/admins', ['OWNER']],
  ]
  it.each(table)('%s', (url, can) => {
    for (const r of ALL) expect(canSeePage(url, [r], { isPrimaryOwner: true }), `${url} × ${r}`).toBe(can.includes(r))
  })

  it('url แบบ dynamic ตามแพตเทิร์น + ท้าย / + query', () => {
    expect(canSeePage('/orders/abc123', ['TECHNICIAN'])).toBe(true)
    expect(canSeePage('/products/p1/', ['TECHNICIAN'])).toBe(false)
  })

  it('url ที่ทะเบียนไม่รู้จัก = เจ้าของเท่านั้น (fail-closed)', () => {
    expect(canSeePage('/no-such-page', ['MANAGER'])).toBe(false)
    expect(canSeePage('/no-such-page', ['OWNER'])).toBe(true)
  })

  it('T4 (/subscriptions): เจ้าของร่วมไม่ผ่าน · เจ้าของหลักผ่าน · ไม่ส่งธง = ไม่ผ่าน', () => {
    expect(canSeePage('/subscriptions', ['OWNER'], { isPrimaryOwner: true })).toBe(true)
    expect(canSeePage('/subscriptions', ['OWNER'], { isPrimaryOwner: false })).toBe(false)
    expect(canSeePage('/subscriptions', ['OWNER'])).toBe(false)
  })

  it('X6 (/inspection ดูแผนตรวจสอบ): MANAGER เห็นแม้ไม่ใช่เจ้าของหลัก · CHAT/BILLING/TECHNICIAN ไม่เห็น', () => {
    for (const r of ALL) expect(canSeePage('/inspection', [r], { isPrimaryOwner: false }), r).toBe(r === 'OWNER' || r === 'MANAGER')
  })

  it('[blocker] ทุก url ในเมนูมีกฎในทะเบียน (ไม่ตกไป fail-closed เงียบ ๆ จนผู้ดูแลเสียเมนู)', () => {
    const missing = flattenSellerMenu(sellerMenuItems).filter((i) => i.url && !isRegisteredPage(i.url)).map((i) => i.url)
    expect(missing).toEqual([])
  })
})

describe('เมนู sidebar ตามบทบาท (resolveVisibleSellerMenu)', () => {
  const slugs = (staff: { role: 'OWNER' | 'ADMIN'; roles: string[] }, shop = SERVICE) =>
    flattenSellerMenu(
      resolveVisibleSellerMenu(sellerMenuItems, {
        entitlement: { status: 'ACTIVE', package: 'PRO' },
        staff: { kind: 'BUSINESS', ...staff },
        ownsShop: true,
        shop: { ...shop, isPrimaryOwner: staff.role === 'OWNER' },
      }),
    ).map((i) => i.slug)

  it('TECHNICIAN เห็นแค่หน้าที่ช่างใช้ (ไม่มีแชท/สินค้า/ลูกค้า/การเงิน/ตั้งค่า)', () => {
    const s = slugs({ role: 'ADMIN', roles: ['TECHNICIAN'] })
    expect(s).toEqual(expect.arrayContaining(['seller:dashboard', 'seller:orders', 'seller:queues', 'seller:badges']))
    for (const bad of ['seller:inbox', 'seller:products', 'seller:customers', 'seller:sales', 'seller:wallet', 'seller:admins', 'seller:verification', 'seller:settings-channels'])
      expect(s, bad).not.toContain(bad)
  })

  it('CHAT เห็นแชท/ออเดอร์/ลูกค้า/รายงานตอบแชท แต่ไม่เห็นตั้งค่าแชท/การเงิน/ระดับร้าน', () => {
    const s = slugs({ role: 'ADMIN', roles: ['CHAT'] })
    expect(s).toEqual(expect.arrayContaining(['seller:inbox', 'seller:orders', 'seller:customers', 'seller:reports-agents']))
    for (const bad of ['seller:settings-auto-reply', 'seller:sales', 'seller:wallet', 'seller:verification', 'seller:admins', 'seller:subscriptions'])
      expect(s, bad).not.toContain(bad)
  })

  it('BILLING (ร้านบริการ) เห็นออเดอร์/ลูกค้า ไม่เห็นแชท', () => {
    const s = slugs({ role: 'ADMIN', roles: ['BILLING'] })
    expect(s).toEqual(expect.arrayContaining(['seller:orders', 'seller:customers']))
    expect(s).not.toContain('seller:inbox')
  })

  it('MANAGER เห็นตั้งค่า/ระดับร้าน แต่ไม่เห็นการเงินเจ้าของ/พนักงาน/แพ็กเกจ', () => {
    const s = slugs({ role: 'ADMIN', roles: ['MANAGER'] })
    expect(s).toEqual(expect.arrayContaining(['seller:inbox', 'seller:verification', 'seller:settings-channels']))
    for (const bad of ['seller:sales', 'seller:expenses', 'seller:wallet', 'seller:admins', 'seller:subscriptions'])
      expect(s, bad).not.toContain(bad)
  })

  it('เจ้าของหลักเห็นครบ (admins + subscriptions + การเงิน) · เจ้าของร่วมไม่เห็น subscriptions', () => {
    const own = slugs({ role: 'OWNER', roles: [] })
    expect(own).toEqual(expect.arrayContaining(['seller:admins', 'seller:subscriptions', 'seller:sales', 'seller:wallet']))
    const co = flattenSellerMenu(
      resolveVisibleSellerMenu(sellerMenuItems, {
        entitlement: { status: 'ACTIVE', package: 'PRO' },
        staff: { kind: 'BUSINESS', role: 'OWNER', roles: [] },
        ownsShop: true,
        shop: { ...SERVICE, isPrimaryOwner: false },
      }),
    ).map((i) => i.slug)
    expect(co).not.toContain('seller:subscriptions')
    expect(co).toContain('seller:admins')
  })

  it('ร้านส่วนตัว: เห็นทุกอย่างของเจ้าของ แต่ไม่มีเมนูพนักงาน', () => {
    const s = flattenSellerMenu(
      resolveVisibleSellerMenu(sellerMenuItems, {
        entitlement: { status: 'ACTIVE', package: 'PRO' },
        staff: { kind: 'PERSONAL', role: 'OWNER', roles: [] },
        ownsShop: true,
        shop: { kind: 'PERSONAL', vertical: 'ONLINE_SALES', isPrimaryOwner: true },
      }),
    ).map((i) => i.slug)
    expect(s).toContain('seller:sales')
    expect(s).not.toContain('seller:admins')
  })

  it('กลุ่มที่ลูกหมดถูกถอดทั้งกลุ่ม (ไม่ทิ้งหัวข้อเปล่า)', () => {
    const out = applyCapabilityMenu(sellerMenuItems, ['TECHNICIAN'], { kind: 'BUSINESS' })
    expect(out.every((g) => !g.children || g.children.length > 0)).toBe(true)
    expect(out.find((g) => g.slug === 'seller-chat')).toBeUndefined()
  })

  it('ถอดอย่างเดียว: ผลลัพธ์เป็นเซตย่อยของอินพุตเสมอ', () => {
    const input = flattenSellerMenu(sellerMenuItems).map((i) => i.slug)
    for (const r of [['CHAT'], ['BILLING'], ['TECHNICIAN'], ['MANAGER']] as ShopRole[][]) {
      const out = flattenSellerMenu(applyCapabilityMenu(sellerMenuItems, r, { kind: 'BUSINESS' })).map((i) => i.slug)
      for (const s of out) expect(input).toContain(s)
    }
  })

  it('slugsHiddenByRole = SSOT ที่บทบาทถอด (ใช้แยก unavailableByRole)', () => {
    const h = slugsHiddenByRole(sellerMenuItems, ['TECHNICIAN'], { kind: 'BUSINESS' })
    expect(h.has('seller:inbox')).toBe(true)
    expect(h.has('seller:orders')).toBe(false)
  })
})

describe('App Store × บทบาท (ลำดับ applyPaymentRestriction ก่อนตัวกรองบทบาท)', () => {
  const run = (role: 'OWNER' | 'ADMIN', roles: string[], shell: { hidePayments: boolean; hidePaidFeatures: boolean; offerIap: boolean }) =>
    flattenSellerMenu(
      resolveVisibleSellerMenu(sellerMenuItems, {
        entitlement: { status: 'NOT_SUBSCRIBED', package: null },
        staff: { kind: 'BUSINESS', role, roles },
        ownsShop: true,
        shop: { ...ONLINE, isPrimaryOwner: role === 'OWNER' },
        ...shell,
      }),
    )
  const IOS = { hidePayments: true, hidePaidFeatures: true, offerIap: true }
  const ANDROID = { hidePayments: true, hidePaidFeatures: true, offerIap: false }
  const WEB = { hidePayments: false, hidePaidFeatures: false, offerIap: true }

  it('[blocker] เจ้าของ iOS = ทาง /subscriptions เดียว (ปลายทางซื้อผ่าน Apple) · Android = ไม่มี', () => {
    expect(run('OWNER', [], IOS).filter((i) => i.url === '/subscriptions')).toHaveLength(1)
    expect(run('OWNER', [], ANDROID).filter((i) => i.url === '/subscriptions')).toHaveLength(0)
    expect(run('OWNER', [], WEB).filter((i) => i.url === '/subscriptions')).toHaveLength(1)
  })

  it('[blocker] MANAGER ทั้ง 3 เปลือก = ไม่มี /subscriptions (T4)', () => {
    for (const shell of [IOS, ANDROID, WEB]) {
      expect(run('ADMIN', ['MANAGER'], shell).filter((i) => i.url === '/subscriptions')).toHaveLength(0)
    }
  })

  it('บทบาทไม่เพิ่มรายการที่เปลือกซ่อนกลับมา: ผลของ MANAGER ใน iOS ⊆ ผลของ MANAGER บนเว็บ', () => {
    const web = new Set(run('ADMIN', ['MANAGER'], WEB).map((i) => i.slug))
    for (const i of run('ADMIN', ['MANAGER'], IOS)) expect(web.has(i.slug)).toBe(true)
  })

  it('[blocker] ลำดับ: seller-menu.ts เรียก applyCapabilityMenu "หลัง" applyPaymentRestriction (อยู่ชั้นนอกกว่า)', () => {
    const src = require('node:fs').readFileSync('src/lib/seller-menu.ts', 'utf8') as string
    const body = src.slice(src.indexOf('export function resolveVisibleSellerMenu'))
    expect(body.indexOf('applyCapabilityMenu(')).toBeGreaterThan(-1)
    // นิพจน์ซ้อน: ตัวที่อยู่ "ในสุด" คือที่เรียกก่อน → applyCapabilityMenu( ต้องขึ้นก่อน applyPaymentRestriction( ในข้อความ
    expect(body.indexOf('applyCapabilityMenu(')).toBeLessThan(body.indexOf('applyPaymentRestriction('))
  })
})

describe('shopQuickLinks — spec §6', () => {
  const urls = (...u: string[]) => new Set(['/account', ...u])
  it('เจ้าของหลักธุรกิจ ออนไลน์ เว็บ: ครบตามลำดับ', () => {
    const all = urls('/verification', '/public-profile', '/subscriptions', '/business/line-reports', '/settings', '/admins')
    expect(shopQuickLinks(all)).toEqual(['/verification', '/public-profile', '/subscriptions', '/business/line-reports', '/settings', '/admins'])
  })
  it('ผู้ดูแล (ไม่ได้เป็นเจ้าของร้านใดเลย): ระดับร้าน + หน้าร้าน + จัดส่ง (ร้านออนไลน์) เท่านั้น', () => {
    const vis = flattenSellerMenu(
      resolveVisibleSellerMenu(sellerMenuItems, {
        entitlement: { status: 'ACTIVE', package: 'PRO' },
        staff: { kind: 'BUSINESS', role: 'ADMIN', roles: ['MANAGER'] },
        ownsShop: false,
        shop: { ...ONLINE, isPrimaryOwner: false },
      }),
    ).flatMap((i) => (i.url ? [i.url] : []))
    expect(shopQuickLinks(new Set(vis))).toEqual(['/verification', '/public-profile', '/settings'])
  })
  it('ผู้ดูแลร้านนี้ที่เป็นเจ้าของร้านอื่น เห็นรายงาน LINE (ระดับบัญชี มติ 00070)', () => {
    const vis = flattenSellerMenu(
      resolveVisibleSellerMenu(sellerMenuItems, {
        entitlement: { status: 'ACTIVE', package: 'PRO' },
        staff: { kind: 'BUSINESS', role: 'ADMIN', roles: ['MANAGER'] },
        ownsShop: true,
        shop: { ...ONLINE, isPrimaryOwner: false },
      }),
    ).flatMap((i) => (i.url ? [i.url] : []))
    expect(shopQuickLinks(new Set(vis))).toEqual(['/verification', '/public-profile', '/business/line-reports', '/settings'])
  })
  it('ไม่มีในเมนู = ไม่มีแถว (iOS ซ่อนจ่ายเงิน ฯลฯ ตามเมนูอัตโนมัติ)', () => {
    expect(shopQuickLinks(urls())).toEqual([])
  })
})

describe('/queues แถบล่าง × แถบสร้างงานของบอร์ด (00086 · user เคาะ 2026-10-27)', () => {
  const ALL: ShopRole[] = ['OWNER', 'MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN']

  it('ร้านบริการ: แถบล่างไม่ซ่อนทุกบทบาท · บอร์ดไม่วาดแถบสร้างงาน (ไม่มีปุ่มสร้างสองปุ่ม)', () => {
    for (const r of ALL) {
      expect(bottomNavHiddenPages([r], SERVICE).queues, r).toBe(false)
      expect(queuesCreateBarRenders([r], SERVICE), r).toBe(false)
    }
  })
  it('ร้านบริการ: บทบาทที่สร้างงานได้ (O2s) มี FAB ในแถบล่างเสมอ — ทางสร้างไม่หายตอนถอดแถบของบอร์ด', () => {
    for (const r of ['OWNER', 'MANAGER', 'CHAT', 'BILLING'] as ShopRole[]) {
      expect(nav([r]).fab, r).not.toBeNull()
      expect(keys(nav([r])), r).toContain(r === 'OWNER' || r === 'MANAGER' ? 'orders' : 'queues')
    }
  })
  it('ร้านขายออนไลน์/บ้านพัก: คงเดิม — ซ่อนเมื่อ can(O2s) · บอร์ดวาดแถบแทน FAB', () => {
    for (const shop of [ONLINE, LODGING]) {
      expect(bottomNavHiddenPages(['OWNER'], shop).queues).toBe(true)
      expect(bottomNavHiddenPages(['CHAT'], shop).queues).toBe(true)
      expect(bottomNavHiddenPages(['TECHNICIAN'], shop).queues).toBe(false)
      expect(queuesCreateBarRenders(['OWNER'], shop)).toBe(true)
      expect(queuesCreateBarRenders(['TECHNICIAN'], shop)).toBe(false)
    }
  })
  it('orderDetail ไม่ขึ้นกับประเภทร้าน', () => {
    expect(bottomNavHiddenPages(['OWNER'], SERVICE).orderDetail).toBe(true)
    expect(bottomNavHiddenPages(['TECHNICIAN'], SERVICE).orderDetail).toBe(false)
  })
})
