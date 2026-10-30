import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dashboardMoney, redactCommandCenterData } from '../dashboard-money'

describe('dashboardMoney', () => {
  it('FULL: ทุกธงเปิด', () => {
    const f = dashboardMoney('FULL')
    expect(Object.keys(f)).toHaveLength(8)
    expect(Object.values(f).every((v) => v === true)).toBe(true)
  })
  it.each(['PER_ORDER', 'NONE'] as const)('%s: ทุกธงปิด', (lvl) => {
    expect(Object.values(dashboardMoney(lvl)).every((v) => v === false)).toBe(true)
  })
})

describe('redactCommandCenterData', () => {
  const data = {
    shopName: 'ร้าน',
    walletBalance: 500,
    salesSeries: { total: 1 },
    portfolio: { initial: {} },
    bestSellers: [{ id: 'a', name: 'x', price: 10, soldCount: 7 }],
    headline: { kind: 'NET_PROFIT', today: 100, month: 900, note: null },
  }
  it('PER_ORDER/NONE: ไม่เหลือคีย์เงินสักตัว (absent ไม่ใช่ null/0)', () => {
    for (const lvl of ['PER_ORDER', 'NONE'] as const) {
      const r = redactCommandCenterData(data, lvl) as Record<string, unknown>
      expect('walletBalance' in r).toBe(false)
      expect('salesSeries' in r).toBe(false)
      expect('portfolio' in r).toBe(false)
      expect('headline' in r).toBe(false) // ตัวเลขหลักบนการ์ด (00073 FR-010a) = เงินเต็ม เห็นเฉพาะ FULL
      expect(r.shopName).toBe('ร้าน')
      const b = (r.bestSellers as Record<string, unknown>[])[0]
      expect('soldCount' in b).toBe(false)
      expect(b.price).toBe(10)
    }
  })
  it('ไม่แก้ object ต้นทาง', () => {
    redactCommandCenterData(data, 'NONE')
    expect(data.walletBalance).toBe(500)
    expect(data.bestSellers[0].soldCount).toBe(7)
  })
  it('FULL: ข้อมูลครบเท่าเดิม', () => {
    expect(redactCommandCenterData(data, 'FULL')).toEqual(data)
  })
})

// ด่านซอร์ส: แหล่งเงินต้องถูกครอบด้วยธง dashboardMoney ไม่ใช่ query แล้วซ่อน
describe('dashboard/page.tsx: แหล่งเงินถูกครอบธง', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/app/(paces)/seller/(dashboard)/dashboard/page.tsx'),
    'utf8',
  )
  it.each([
    ['getBalance', 'money.walletHero'],
    ['getSalesSeries', 'money.salesChartCard'],
    ['getProvinceSales', 'money.provinceMap'],
  ])('%s() ถูกครอบด้วย %s', (fn, flag) => {
    const calls = [...src.matchAll(new RegExp(`(?<![\\w.])${fn}\\(`, 'g'))]
    expect(calls.length).toBeGreaterThan(0)
    for (const m of calls) {
      const before = src.slice(Math.max(0, m.index! - 140), m.index!)
      // รูปแบบ: `flag ? fn(...)` (หรือ `flag && ... ? fn(`)
      expect(before).toMatch(new RegExp(`${flag.replace('.', '\\.')}[^;]*\\?\\s*$`))
    }
  })
  it('ไม่เรียก resolveExpenseAccess ตัดสินเงินอีก', () => {
    expect(src).not.toMatch(/resolveExpenseAccess\(/)
  })
})

describe('ผู้เรียก getRecentActivity ผูก includeTopups กับธง topups (FULL)', () => {
  it.each([
    'src/app/(paces)/seller/(dashboard)/dashboard/page.tsx',
    'src/app/(paces)/seller/(dashboard)/notifications/page.tsx',
  ])('%s', (rel) => {
    const src = readFileSync(join(process.cwd(), rel), 'utf8')
    expect(src).toMatch(/includeTopups: (money|canSeeTopups)\.?\w*\s*&&|includeTopups: canSeeTopups &&/)
  })
})

// ─── homeBlocks (00071 P3 · S-15) — ตารางคาดหวังเขียนมือจาก spec §3 ─────────────
import { homeBlocks } from '../dashboard-money'
import { bottomNavHiddenPages } from '../role-nav'

describe('homeBlocks — spec §3 ทีละบทบาท', () => {
  const SERVICE = { kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' }
  const ONLINE = { kind: 'BUSINESS', vertical: 'ONLINE_SALES' }

  it('BestSellerStrip: เฉพาะ OWNER/MANAGER/CHAT — เปิดบิลและช่างไม่เห็น', () => {
    expect(homeBlocks(['OWNER'], ONLINE).bestSellerStrip).toBe(true)
    expect(homeBlocks(['MANAGER'], ONLINE).bestSellerStrip).toBe(true)
    expect(homeBlocks(['CHAT'], ONLINE).bestSellerStrip).toBe(true)
    expect(homeBlocks(['BILLING'], SERVICE).bestSellerStrip).toBe(false)
    expect(homeBlocks(['TECHNICIAN'], SERVICE).bestSellerStrip).toBe(false)
  })

  it('TodayJobs: ช่างล้วน + ร้านรับนัดเท่านั้น (ห้ามบทบาทอื่น — endpoint คืนเบอร์ลูกค้า)', () => {
    expect(homeBlocks(['TECHNICIAN'], SERVICE).todayJobs).toBe(true)
    expect(homeBlocks(['TECHNICIAN'], ONLINE).todayJobs).toBe(false) // ร้านไม่รับนัด
    for (const r of ['OWNER', 'MANAGER', 'CHAT', 'BILLING'] as const) {
      expect(homeBlocks([r], SERVICE).todayJobs).toBe(false)
    }
    // ช่าง + บทบาทอื่น = ผังของบทบาทอื่น (ตรงกับแท็บ "งาน" ที่ resolveMobileNav ให้ช่างล้วนเท่านั้น)
    expect(homeBlocks(['TECHNICIAN', 'CHAT'], SERVICE).todayJobs).toBe(false)
    expect(homeBlocks([], SERVICE).todayJobs).toBe(false)
  })

  it('RecentOrder: ยอดรายใบ + ปุ่มส่งออก/นำเข้า ซ่อนเฉพาะระดับเงิน NONE (ช่าง) · PER_ORDER คงยอดรายใบไว้', () => {
    for (const r of ['OWNER', 'MANAGER', 'CHAT', 'BILLING'] as const) {
      const b = homeBlocks([r], SERVICE)
      expect(b.recentOrderAmount).toBe(true)
      expect(b.recentOrderTools).toBe(true)
    }
    const t = homeBlocks(['TECHNICIAN'], SERVICE)
    expect(t.recentOrderAmount).toBe(false)
    expect(t.recentOrderTools).toBe(false)
    expect(homeBlocks(['TECHNICIAN', 'CHAT'], SERVICE).recentOrderAmount).toBe(true)
  })

  it('โดนัทช่องทางขายหายเฉพาะช่างล้วน (การ์ดงานวันนี้แทน)', () => {
    expect(homeBlocks(['TECHNICIAN'], SERVICE).salesChannelDonut).toBe(false)
    expect(homeBlocks(['TECHNICIAN'], ONLINE).salesChannelDonut).toBe(false)
    expect(homeBlocks(['BILLING'], SERVICE).salesChannelDonut).toBe(true)
    expect(homeBlocks(['OWNER'], ONLINE).salesChannelDonut).toBe(true)
  })

  it('ไม่มีบทบาทเลย (fail-closed): ไม่มีสินค้าขายดี/งานวันนี้/ยอดรายใบ', () => {
    const b = homeBlocks([], SERVICE)
    expect(b.bestSellerStrip).toBe(false)
    expect(b.todayJobs).toBe(false)
    expect(b.recentOrderAmount).toBe(false)
  })
})

describe('bottomNavHiddenPages — ซ่อนแถบล่างเฉพาะบทบาทที่หน้านั้นวาดแถบเอง', () => {
  const SERVICE = { kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' }
  const ONLINE = { kind: 'BUSINESS', vertical: 'ONLINE_SALES' }
  it('ช่างล้วนไม่ซ่อนทั้งสองหน้า · เจ้าของ/ตอบแชท/เปิดบิลซ่อน (ร้านที่ไม่ใช่ร้านบริการ)', () => {
    expect(bottomNavHiddenPages(['TECHNICIAN'], ONLINE)).toEqual({ orderDetail: false, queues: false })
    for (const r of ['OWNER', 'MANAGER', 'CHAT', 'BILLING'] as const) {
      expect(bottomNavHiddenPages([r], ONLINE)).toEqual({ orderDetail: true, queues: true })
    }
  })
  it('ร้านบริการ (00086 · 2026-10-27): /queues ไม่ซ่อนทุกบทบาท · /orders/<token> คงเดิม', () => {
    expect(bottomNavHiddenPages(['TECHNICIAN'], SERVICE)).toEqual({ orderDetail: false, queues: false })
    for (const r of ['OWNER', 'MANAGER', 'CHAT', 'BILLING'] as const) {
      expect(bottomNavHiddenPages([r], SERVICE)).toEqual({ orderDetail: true, queues: false })
    }
  })
})

// ─── ด่านซอร์ส: ของที่บทบาทไม่เห็นต้องไม่ถูก query/mount ───────────────────────
describe('layout/page: ตัดที่ต้นทาง ไม่ใช่ซ่อนปลายทาง', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), 'src/app/(paces)/seller/(dashboard)', rel), 'utf8')
  const layout = read('layout.tsx')
  const page = read('dashboard/page.tsx')
  const cc = read('dashboard/components/CommandCenter.tsx')

  it('unread แชทนับเฉพาะ can(H1) และ ChatToastListener mount เฉพาะ H1', () => {
    expect(layout).toMatch(/const canChat = can\(roles, 'H1'\)/)
    expect(layout).toMatch(/if \(shop\?\.id && canChat\) \{\s*try \{\s*unreadChatCount = await getUnreadCountForShop/)
    // แอปมือถือไม่ mount (toast เฉพาะเว็บ — user 2026-10-18) · H1 ยังเป็นเงื่อนไขแรก
    expect(layout).toMatch(/\{canChat && \(await getAppShell\(\)\) === 'web' && <ChatToastListener/)
  })
  it('isPrimaryOwner มาจากแถวร้านที่ requireActiveShop อ่านแล้ว ไม่ใช่ query เพิ่ม', () => {
    expect(layout).toMatch(/isPrimaryOwner: active\.shop\.userId === user\.id/)
  })
  it('page: สินค้าขายดี/โดนัท query ตามธง · TodayJobs mount ตามธงทั้งสองที่', () => {
    expect(page).toMatch(/blocks\.bestSellerStrip \|\| money\.topSelling \? getBestSellerProducts/)
    expect(page).toMatch(/blocks\.salesChannelDonut \? getSalesChannelBreakdown/)
    expect(page).toMatch(/\{blocks\.todayJobs && \(\s*<div className="xl:col-span-7">\s*(\{\/\*[^*]*\*\/\}\s*)?<TodayJobs/)
    expect(cc).toMatch(/\{blocks\.todayJobs && <TodayJobs viewerUserId=\{viewerUserId\} \/>\}/)
    expect(cc).toMatch(/\{blocks\.bestSellerStrip && <BestSellerStrip/)
  })
  it('page: ยอดรายใบข้ามเส้น RSC เฉพาะเมื่อ recentOrderAmount', () => {
    expect(page).toMatch(/\.\.\.\(blocks\.recentOrderAmount \? \{ totalAmount: Number\(o\.totalAmount\) \} : \{\}\)/)
  })
  it('ฟีดกิจกรรมที่ช่างเห็น: รายการเงิน (เติมเงิน) ถูกกันด้วย money.topups (FULL) เท่านั้น', () => {
    expect(page).toMatch(/includeTopups: money\.topups &&/)
  })
})

// ─── showsStaffExpenseCard (00086 · FR-018) — การ์ด "ค่าใช้จ่ายที่ฉันบันทึก" + ด่านหน้า /expenses/mine ─────────────
import { showsStaffExpenseCard } from '../dashboard-money'

describe('showsStaffExpenseCard — ร้านบริการ ∧ ADMIN ∧ ธง ∧ ไม่มี F1', () => {
  const SVC = { kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' }
  const ON = { canRecordExpense: true }

  it.each(['CHAT', 'BILLING', 'TECHNICIAN', 'MANAGER'] as const)('พนักงาน %s + ธงเปิด ในร้านบริการ = เห็น', (r) => {
    expect(showsStaffExpenseCard(SVC, 'ADMIN', [r], ON)).toBe(true)
  })
  it('ธงปิด / ไม่ส่งธง / ธงไม่ใช่ true = ไม่เห็น (ไม่มีค่าตั้งต้นที่เปิด)', () => {
    expect(showsStaffExpenseCard(SVC, 'ADMIN', ['CHAT'], { canRecordExpense: false })).toBe(false)
    expect(showsStaffExpenseCard(SVC, 'ADMIN', ['CHAT'])).toBe(false)
    expect(showsStaffExpenseCard(SVC, 'ADMIN', ['CHAT'], {})).toBe(false)
  })
  it('เจ้าของ (OWNER / มี F1) = ไม่เห็น แม้ธงค้างเป็น true', () => {
    expect(showsStaffExpenseCard(SVC, 'OWNER', ['OWNER'], ON)).toBe(false)
    expect(showsStaffExpenseCard(SVC, 'ADMIN', ['OWNER'], ON)).toBe(false)
  })
  it('ร้านไม่ใช่บริการ = ไม่เห็น แม้ธงค้าง (stored-flag-vs-owner-truth)', () => {
    for (const vertical of ['ONLINE_SALES', 'LODGING']) {
      expect(showsStaffExpenseCard({ kind: 'BUSINESS', vertical }, 'ADMIN', ['CHAT'], ON)).toBe(false)
    }
  })
  it('ร้านส่วนตัว = ไม่เห็น', () => {
    expect(showsStaffExpenseCard({ kind: 'PERSONAL', vertical: 'SERVICE_QUEUE' }, 'OWNER', ['OWNER'], ON)).toBe(false)
  })
})

describe('dashboard/page.tsx: การ์ดค่าใช้จ่ายพนักงานผูกกับ showsStaffExpenseCard', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/(paces)/seller/(dashboard)/dashboard/page.tsx'), 'utf8')
  it('นับรายการเฉพาะเมื่อผ่านด่าน และ render ทั้งมือถือ/คอมจากค่าเดียว', () => {
    expect(src).toMatch(/showsStaffExpenseCard\([\s\S]*?\)\s*\)\s*\{\s*\/\/[^\n]*\n\s*staffExpenseCount = await countOwnExpenses/)
    expect(src).toContain('staffExpenseCount={staffExpenseCount}')
    expect(src).toContain('{staffExpenseCount !== null && (')
  })
})
