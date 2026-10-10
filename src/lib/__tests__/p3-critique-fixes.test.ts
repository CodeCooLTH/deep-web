/**
 * 00071 P3 — แก้ตาม /impeccable critique (27/40): ตัวสแกนซอร์สกัดการถอยกลับ
 * ทุกข้อรับซอร์สเป็นพารามิเตอร์ → เทส mutation ฉีดของเสียเข้าไปแล้วต้องแดง
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
const FS = 'src/app/(paces)/seller/(fullscreen)'
const FULLSCREEN_PAGES = [
  'orders/new', 'orders/[token]/edit', 'orders/[token]/receipt', 'products/new', 'products/[id]/edit',
  'auctions/new', 'auctions/[id]/edit', 'public-profile/builder',
]
const CARD_ONLY = /<NoPermissionCard\b/
const usesScreen = (src: string) => /<NoPermissionScreen\b/.test(src) && !CARD_ONLY.test(src)

describe('P1-1 หน้า fullscreen ต้องมีทางกลับ', () => {
  it.each(FULLSCREEN_PAGES)('%s ใช้ NoPermissionScreen ไม่ใช่ NoPermissionCard เปล่า', (f) => {
    expect(usesScreen(read(`${FS}/${f}/page.tsx`))).toBe(true)
  })
  it('edit/receipt กลับไปหน้าออเดอร์', () => {
    for (const f of ['orders/[token]/edit', 'orders/[token]/receipt'])
      expect(read(`${FS}/${f}/page.tsx`)).toMatch(/<NoPermissionScreen[^>]*backTo=\{`\/orders\/\$\{token\}`\}[^>]*backLabel=/)
  })
  it('Screen: Link ธรรมดา (ไม่ใช่ปุ่ม history.back) + แตะได้ 44px + ค่าตั้งต้นกลับหน้าหลัก', () => {
    const src = read('src/app/(paces)/seller/(dashboard)/_shared/NoPermissionScreen.tsx')
    expect(src).toMatch(/<Link\s+href=\{backTo\}/)
    expect(src).toContain('min-h-11')
    expect(src).toContain("backTo = '/dashboard'")
    expect(src).not.toMatch(/history\.back|router\.back/)
  })
  it('ChatNoPermission ยัง import ได้ (ชื่อเดิมชี้ตัวกลาง)', () => {
    expect(read('src/app/(paces)/seller/(chat)/_components/ChatNoPermission.tsx')).toContain('NoPermissionScreen')
  })
  it('mutation: หน้าที่ถอยกลับไปใช้การ์ดเปล่า → ตัวสแกนแดง', () => {
    expect(usesScreen('return <NoPermissionCard capability="O3" />')).toBe(false)
  })
})

describe('P1-2 ป้ายบทบาทตัวสลับบัญชี', () => {
  const FILES = [
    'src/app/(paces)/seller/(dashboard)/dashboard/components/AccountSwitcherSheet.tsx',
    'src/app/(paces)/seller/(chat)/_components/ChatShopSwitcher.tsx',
    'src/layouts/components/TopBar/components/UserDropdownDetailed.tsx',
  ]
  it.each(FILES)('%s ไม่ใช้ roleAdmin ให้สมาชิกทุกคน และใช้ shopRoleBadgeLabel', (f) => {
    const src = read(f)
    expect(src).not.toContain('accountSwitcher.roleAdmin')
    expect(src).toContain('shopRoleBadgeLabel(')
  })
  it('context API ส่ง roles จาก query เดิม (ไม่เพิ่ม query)', () => {
    const src = read('src/app/api/business/context/route.ts')
    expect(src).toMatch(/role: true,\s*roles: true/)
    expect(src).toContain('rolesFromMembership(')
    expect((src.match(/shopMember\.findMany/g) ?? []).length).toBe(1)
  })
})

describe('P1-3 ช่างเจอคำขอเลื่อนนัดต้องรู้ว่าไปขอใคร', () => {
  const HINT = 'ลูกค้าขอเลื่อนนัด ให้เจ้าของร้านหรือผู้ดูแลเลือกเวลาใหม่'
  it('DayCard: แทนที่ span ว่างด้วยข้อความ', () => {
    const src = read('src/components/safepay/appointment-board/AppointmentDayCard.tsx')
    expect(src).toContain(HINT)
    expect(src).not.toMatch(/<span className="flex-1" aria-hidden="true" \/>/)
  })
  it('AppointmentCard: ข้อความเมื่อรอเลื่อนและเลื่อนไม่ได้ · ไม่ render เส้นประเมื่อไม่มีปุ่ม', () => {
    const src = read('src/app/(paces)/seller/(dashboard)/orders/[token]/components/AppointmentCard.tsx')
    expect(src).toContain(HINT)
    expect(src).toMatch(/awaitingReschedule && !canReschedule && !terminal/)
    expect(src).toMatch(/!terminal && \(canSendSummary \|\| canReschedule \|\| canOutcome\)/)
  })
})

describe('P1-4 เหตุผลล็อกแก้บิล', () => {
  it('หน้า edit และฟอร์มใช้ฟังก์ชันกลาง ไม่ฝังข้อความ "รับชำระแล้ว"', () => {
    const page = read(`${FS}/orders/[token]/edit/page.tsx`)
    const form = read('src/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm.tsx')
    expect(page).toContain('orderEditLockReason(')
    expect(page).toContain('orderEditLockMessage(lockReason')
    expect(page).not.toContain('บิลนี้รับชำระแล้ว')
    expect(form).toContain("orderEditLockMessage('PAID'")
    expect(form).not.toContain('บิลนี้รับชำระแล้ว')
  })
})

describe('P2 ข้อความ/เลย์เอาต์เล็ก', () => {
  it('ProductGrid บอกเจ้าของร้านหรือผู้ดูแล', () => {
    expect(read('src/app/(paces)/seller/(dashboard)/orders/new/components/ProductGrid.tsx')).toContain('ขอให้เจ้าของร้านหรือผู้ดูแลเพิ่มบริการให้')
  })
  it('OrdersTable: เส้นคั่นอยู่ใต้ canCreate', () => {
    const src = read('src/app/(paces)/seller/(dashboard)/orders/components/OrdersTable.tsx')
    expect(src).toMatch(/\{canCreate && \(\s*<>\s*(\{\/\*[^]*?\*\/\}\s*)?<span className="bg-default-200 h-6 w-px"/)
  })
  it('ProductsListing: ปุ่ม + และ CTA ว่างผูก canCreate (P2)', () => {
    const src = read('src/app/(paces)/seller/(dashboard)/products/components/ProductsListing.tsx')
    expect(src).toMatch(/\{canCreate && \(\s*<Link\s+href="\/products\/new"/)
    expect(src).toContain('emptyState.showCta && canCreate')
    expect(src).toMatch(/canCreate = false/) // ค่าตั้งต้นต้องปิด (fail-closed)
    expect(read('src/app/(paces)/seller/(dashboard)/products/page.tsx')).toMatch(/canCreate=\{can\([^)]*\)[^}]*'P2'\)\}/)
  })
  it('TodayJobs: หัวการ์ดไม่ขึ้น "· 0 งาน" และข้อความว่างใช้คำว่า "งาน"', async () => {
    expect(read('src/app/(paces)/seller/(dashboard)/dashboard/components/TodayJobs.tsx')).toContain('items && total > 0 ?')
    const { th } = await import('@/i18n/dictionaries/th')
    const { en } = await import('@/i18n/dictionaries/en')
    expect(th.dashboard.todayJobsEmpty).toBe('วันนี้ยังไม่มีงาน')
    expect(en.dashboard.todayJobsEmpty).toBe('No jobs today')
  })
  it('class ที่สคริปต์แทรกกลางคำ (min-h-11 lg:min-h-0 ติดกับ "enter"/"ext") ไม่เหลือ', () => {
    for (const f of [
      'src/app/(paces)/seller/(dashboard)/products/components/ProductCapabilityCardV2.tsx',
      'src/app/(paces)/seller/(dashboard)/settings/auto-reply/AutoReplyListing.tsx',
    ])
      expect(read(f)).not.toMatch(/lg:min-h-0[a-z]/)
  })
})
