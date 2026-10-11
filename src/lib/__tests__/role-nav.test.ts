/**
 * role-nav (00071 P3 · S-16) — เมนู/แถบล่าง/ทางลัด/ทางลัดหน้าร้านตามบทบาท
 * ตารางคาดหวังเขียนมือจาก spec §2/§6 (ไม่ derive จากโค้ด) — เซลล์ไหนเปลี่ยนต้องมีคนตั้งใจแก้ที่นี่
 */
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/dictionaries/th'
import {
  applyCapabilityMenu,
  buildFabActions,
  canSeePage,
  isRegisteredPage,
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

/** บทบาทที่มีผลจริงของ ADMIN ที่ถือ roles ชุดนี้ (ผ่านกฎ BILLING เดียวกับ production) */
const eff = (shop: typeof SERVICE, roles: string[]) => effectiveRoles(shop, 'ADMIN', roles)
const nav = (roles: ShopRole[], shop = SERVICE) => resolveMobileNav(roles, shop, resolveOrderVocab(shop.vertical), th)
const keys = (n: ReturnType<typeof nav>) => n.tabs.map((t) => t.key)

describe('resolveMobileNav — spec §2 ทีละเซลล์', () => {
  const cases: [string, ShopRole[], string[], string, string, number][] = [
    // ชื่อ, roles, แท็บ, ชนิด FAB, grid, fabAfter
    ['OWNER', ['OWNER'], ['home', 'orders', 'chat', 'shop'], 'speedDial', 'grid grid-cols-5', 2],
    ['MANAGER', ['MANAGER'], ['home', 'orders', 'chat', 'shop'], 'speedDial', 'grid grid-cols-5', 2],
    ['CHAT', ['CHAT'], ['home', 'orders', 'chat'], 'direct', 'grid grid-cols-4', 2],
    ['BILLING', ['BILLING'], ['home', 'orders'], 'direct', 'grid grid-cols-3', 1],
    ['TECHNICIAN', ['TECHNICIAN'], ['home', 'work'], 'none', 'grid grid-cols-2', 1],
    ['CHAT+TECH = CHAT', ['CHAT', 'TECHNICIAN'], ['home', 'orders', 'chat'], 'direct', 'grid grid-cols-4', 2],
    ['BILLING+TECH = BILLING', ['BILLING', 'TECHNICIAN'], ['home', 'orders'], 'direct', 'grid grid-cols-3', 1],
    ['CHAT+BILLING = CHAT', ['CHAT', 'BILLING'], ['home', 'orders', 'chat'], 'direct', 'grid grid-cols-4', 2],
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

  it('ช่าง: "งาน" ไป /queues (ร้านรับนัด) หรือ /orders (ร้านอื่น) · ไม่มี badge', () => {
    const svc = nav(['TECHNICIAN'], SERVICE).tabs[1]
    expect([svc.href, svc.icon, svc.label, svc.badge]).toEqual(['/queues', 'calendar-event', 'งาน', null])
    const on = nav(['TECHNICIAN'], ONLINE).tabs[1]
    expect([on.href, on.icon]).toEqual(['/orders', 'clipboard-list'])
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
    ['/sales', ['OWNER', 'MANAGER']],
    ['/sales?tab=expense', ['OWNER', 'MANAGER']],
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

  it('MANAGER เห็นตั้งค่า/ระดับร้าน + ยอดขาย/ค่าใช้จ่าย (F1) แต่ไม่เห็นกระเป๋าเงิน/พนักงาน/แพ็กเกจ', () => {
    const s = slugs({ role: 'ADMIN', roles: ['MANAGER'] })
    expect(s).toEqual(expect.arrayContaining(['seller:inbox', 'seller:verification', 'seller:settings-channels', 'seller:sales', 'seller:expenses']))
    for (const bad of ['seller:wallet', 'seller:admins', 'seller:subscriptions'])
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
