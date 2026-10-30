/**
 * ฟอร์มสร้างงานร้านบริการ — "ผู้รับผิดชอบ" (00086 P3-T8 · S-6 · prototype v13 `screenCreate`)
 *
 * รายชื่อช่างโหลดใน useEffect ซึ่ง renderToStaticMarkup ไม่รัน ⇒ แยกเทสเป็น 2 ชั้น:
 *  1) ตำแหน่ง/การกั้นของส่วนนี้ในฟอร์มจริง (มือถือ + เดสก์ท็อป) — mock `showsAssigneePicker` ให้ตอบตาม serviceLayout
 *     ล้วน (เหมือนรายชื่อโหลดมาแล้ว) จึงจับได้ว่า OrderCreateForm ส่งตัวกั้นถูกตัว · ตัวกั้นจริง (รายชื่อว่าง/null) เทสที่
 *     src/lib/__tests__/order-form-assignee.test.ts
 *  2) AssigneePicker ตรง ๆ พร้อมรายชื่อ — ชิป "ยังไม่มีคนรับ" ค่าตั้งต้น · ชื่อเปล่า · aria
 *
 * mutation ที่ต้องแดง (ทำแล้วตอนเขียน):
 *  - OrderCreateForm ส่ง `true` แทน serviceLayout เข้า showsAssigneePicker → [blocker] ONLINE_SALES/หน้าแก้ไขแดง
 *  - QuickForm ย้าย {assigneeBlock} ไปก่อน appointmentBlock → ลำดับมือถือแดง
 *  - CartPanel ไม่ render {assigneeBlock} → เดสก์ท็อปแดง
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h, type ReactElement } from 'react'
import { useForm } from 'react-hook-form'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/orders/new',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/order-form-assignee', async (orig) => ({
  ...(await orig<object>()),
  showsAssigneePicker: (serviceLayout: boolean) => serviceLayout,
}))

import OrderCreateForm, { type FormValues } from '../components/OrderCreateForm'
import AssigneePicker from '../components/AssigneePicker'
import type { ServiceResourceOption } from '../components/AppointmentBlock'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { ORDER_VOCAB } from '@/lib/seller-menu'
import type { ServiceStaffOption } from '@/lib/order-form-assignee'

const RESOURCES: ServiceResourceOption[] = [
  { id: 'r1', name: 'ช่างเอ', durationMinutes: 60, capacity: 2, depositMode: 'FIXED', depositValue: '100' },
]

type Vertical = 'SERVICE_QUEUE' | 'ONLINE_SALES' | 'LODGING'
function renderForm(vertical: Vertical, extra: Record<string, unknown> = {}): { mobile: string; desktop: string } {
  const html = renderToStaticMarkup(
    h(LocaleProvider, {
      locale: 'th',
      children: h(OrderCreateForm, {
        vocab: ORDER_VOCAB[vertical],
        shopVertical: vertical,
        shopId: 's1',
        catalog: [],
        serviceResourcesEnabled: vertical === 'SERVICE_QUEUE',
        serviceResources: vertical === 'SERVICE_QUEUE' ? RESOURCES : [],
        appointmentGranularity: 'TIME',
        ...extra,
      } as never),
    }) as ReactElement,
  )
  const cut = html.indexOf('hidden lg:grid')
  expect(cut).toBeGreaterThan(0)
  return { mobile: html.slice(0, cut), desktop: html.slice(cut) }
}

function expectAscending(html: string, labels: string[]) {
  const pos = labels.map((l) => html.indexOf(l))
  for (const p of pos) expect(p).toBeGreaterThanOrEqual(0)
  for (let i = 1; i < pos.length; i++) expect(pos[i]).toBeGreaterThan(pos[i - 1])
}

describe('ร้านบริการ — สร้าง: ส่วน "ผู้รับผิดชอบ"', () => {
  const { mobile, desktop } = renderForm('SERVICE_QUEUE')

  it('มือถือ: หลังบล็อกนัด/คิว ก่อน "เพิ่มเติม" + คำอธิบายไม่บังคับ', () => {
    expectAscending(mobile, ['id="order-items-section"', '>วันเข้าใช้บริการ</h4>', '>ผู้รับผิดชอบ</h2>', '>เพิ่มเติม</h2>'])
    expect(mobile).toContain('ไม่บังคับ — ถ้าไม่เลือก ฝ่ายช่างกด &quot;รับงานนี้&quot; เองได้')
    // critique P1-6 — lexicon lock: ไม่มีคำ "พนักงาน"
    expect(mobile).not.toContain('พนักงาน')
  })

  it('เดสก์ท็อป: หลังหัวบล็อกนัด/คิว ก่อน accordion "เพิ่มเติม"', () => {
    expectAscending(desktop, ['>วันเข้าใช้บริการ</h5>', '>ผู้รับผิดชอบ</h5>'])
    const a = desktop.indexOf('>ผู้รับผิดชอบ</h5>')
    expect(desktop.indexOf('</span> เพิ่มเติม<', a)).toBeGreaterThan(a)
  })

  // critique P1-5 — คำเดียวกับการ์ด "งานนี้"/ชีตมอบงาน
  it('ค่าตั้งต้น = "ยังไม่มีคนรับ" (aria-pressed) ทั้งสองแผง', () => {
    for (const html of [mobile, desktop]) {
      expect(html).toMatch(/role="group" aria-label="ผู้รับผิดชอบ"[^>]*><button type="button" aria-pressed="true"[^>]*><span class="truncate">ยังไม่มีคนรับ<\/span>/)
    }
  })
})

describe('[blocker] ฟอร์มเดิมไม่มี "ผู้รับผิดชอบ"', () => {
  it.each(['ONLINE_SALES', 'LODGING'] as const)('ร้าน %s', (v) => {
    const { mobile, desktop } = renderForm(v)
    expect(mobile + desktop).not.toContain('ผู้รับผิดชอบ')
  })
  it('ร้านบริการ หน้าแก้ไข', () => {
    const { mobile, desktop } = renderForm('SERVICE_QUEUE', { editOrderToken: 'tok-1' })
    expect(mobile + desktop).not.toContain('ผู้รับผิดชอบ')
  })
})

// ── AssigneePicker ตรง ๆ พร้อมรายชื่อ ──
const STAFF: ServiceStaffOption[] = [
  { userId: 'u-nid', displayName: 'นิด' },
  { userId: 'u-long', displayName: 'ชื่อยาวมากมากมากมากมากมากมากมากมากมาก' },
]
function Harness(props: { value?: string | null; variant: 'section' | 'panel'; staff?: ServiceStaffOption[] }) {
  const { control } = useForm<FormValues>({ defaultValues: { assignedUserId: props.value } })
  return h(AssigneePicker, { control, staff: props.staff ?? STAFF, variant: props.variant, shopId: 's1', loadWindow: null })
}
const renderPicker = (variant: 'section' | 'panel', value?: string | null, staff?: ServiceStaffOption[]) =>
  renderToStaticMarkup(h(Harness, { variant, value, staff }))

describe('AssigneePicker', () => {
  it('ชิป: "ยังไม่มีคนรับ" ก่อน แล้วชื่อเปล่า (ไม่เติม "ช่าง") · ชื่อยาว truncate · เป้าแตะ 44px', () => {
    const html = renderPicker('section')
    expectAscending(html, ['>ยังไม่มีคนรับ<', '>นิด<', '>ชื่อยาวมาก'])
    expect(html).not.toContain('ช่างนิด')
    expect(html.match(/class="btn btn-sm min-h-11 max-w-full rounded-full/g)).toHaveLength(3)
    expect(html.match(/<span class="truncate">/g)).toHaveLength(3)
  })

  it('ค่าที่เลือก = aria-pressed + สีเลือก (text-primary-ink) · ตัวอื่นไม่เลือก', () => {
    const html = renderPicker('section', 'u-nid')
    expect(html).toMatch(/aria-pressed="true" class="[^"]*bg-primary\/15 text-primary-ink font-semibold"><span class="truncate">นิด/)
    expect(html).toMatch(/aria-pressed="false" class="[^"]*bg-light text-dark"><span class="truncate">ยังไม่มีคนรับ/)
  })

  it('panel (เดสก์ท็อป): หัวแบบบล็อกนัด + "ไม่บังคับ" สั้น', () => {
    const html = renderPicker('panel')
    expect(html).toContain('>ผู้รับผิดชอบ</h5>')
    expect(html).toContain('>ไม่บังคับ</span>')
    expect(html).not.toContain('<h2')
  })
})

// ── มติ 2026-10-30 (prototype v14) — ร้านช่างเยอะ: เกิน 6 คน = ช่องเดียว + ชีตค้นชื่อ ──
const TEN: ServiceStaffOption[] = ['บอย', 'ต้น', 'แบงค์', 'ปุ้ย', 'โอ๊ต', 'เจ', 'ฟ้า', 'กอล์ฟ', 'นิด', 'เอ'].map((n, i) => ({
  userId: `u${i}`,
  displayName: n,
}))

describe('AssigneePicker — ช่างเกิน 6 คน', () => {
  it('6 คน = ชิปแบบเดิม (7 ปุ่มรวม "ยังไม่มีคนรับ") ไม่มีช่องเลือก', () => {
    const html = renderPicker('section', null, TEN.slice(0, 6))
    expect(html).toContain('role="group" aria-label="ผู้รับผิดชอบ"')
    expect(html.match(/rounded-full/g)).toHaveLength(7)
    expect(html).not.toContain('aria-haspopup="dialog"')
  })

  it.each(['section', 'panel'] as const)('10 คน (%s) = ช่องเดียว "ยังไม่มีคนรับ" + จำนวนคน · ไม่มีชิปชื่อ · ชีตยังไม่เปิด', (variant) => {
    const html = renderPicker(variant, null, TEN)
    expect(html).toMatch(/<button type="button" aria-haspopup="dialog"[^>]*>[\s\S]*ยังไม่มีคนรับ[\s\S]*แตะเพื่อเลือกจาก 10 คน · ค้นชื่อได้/)
    expect(html).not.toContain('role="group" aria-label="ผู้รับผิดชอบ"')
    expect(html).not.toContain('>แบงค์<')
    expect(html).not.toContain('role="dialog"')
  })

  it('เลือกไว้แล้ว = ชื่อเปล่า (ไม่เติม "ช่าง") + "แตะเพื่อเปลี่ยน" · ตัวย่อข้ามสระหน้า', () => {
    const html = renderPicker('section', 'u5', TEN)
    expect(html).toContain('>เจ</span>')
    expect(html).toContain('แตะเพื่อเปลี่ยน')
    expect(html).toMatch(/aria-hidden="true">จ<\/span>/)
    expect(html).not.toContain('ช่างเจ')
  })

  it('ค่าที่เลือกไม่อยู่ในรายชื่อแล้ว (ถูกถอดช่าง) = แสดง "ยังไม่มีคนรับ"', () => {
    expect(renderPicker('section', 'gone', TEN)).toContain('ยังไม่มีคนรับ')
  })
})

// ── prototype v16 — ช่องที่เลือก + แถวในชีตใช้ป้ายชุดเดียวกัน (StaffLoadLine) ──
import StaffLoadLine from '@/components/safepay/service-job/StaffLoadLine'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('StaffLoadLine — ป้ายว่าง/ติดงาน', () => {
  it('ว่าง = "ว่างช่วงนี้" สีเขียว + "วันนี้ N งาน"', () => {
    const html = renderToStaticMarkup(h(StaffLoadLine, { load: { dayJobs: 0, clash: null }, sameDay: true }))
    expect(html).toMatch(/bg-success\/15 text-success-ink[^>]*>[\s\S]*ว่างช่วงนี้/)
    expect(html).toContain('วันนี้ 0 งาน')
  })
  it('ติดงาน = เวลาไทยของงานที่ชน สีส้ม · วันอื่น = "วันนั้น"', () => {
    const html = renderToStaticMarkup(
      h(StaffLoadLine, { load: { dayJobs: 2, clash: { start: '2031-03-05T06:00:00.000Z', end: '2031-03-05T08:00:00.000Z' } }, sameDay: false }),
    )
    expect(html).toMatch(/bg-warning\/15 text-warning-ink[^>]*>[\s\S]*ติดงาน 13:00–15:00/)
    expect(html).toContain('วันนั้น 2 งาน')
  })
  it('[blocker] ช่องที่เลือกของ AssigneePicker และแถวของ AssigneeSheet ใช้ StaffLoadLine ตัวเดียวกัน', () => {
    const picker = readFileSync(path.resolve(__dirname, '../components/AssigneePicker.tsx'), 'utf8')
    const sheet = readFileSync(path.resolve(process.cwd(), 'src/components/safepay/service-job/AssigneeSheet.tsx'), 'utf8')
    expect(picker).toContain('<StaffLoadLine load={shownLoad}')
    expect(sheet).toContain('<StaffLoadLine load={load}')
    // ค่าค้างจากคน/ช่วงก่อนหน้าห้ามโชว์
    expect(picker).toMatch(/shownLoad = pickedLoad\?\.key === loadKey/)
  })
})
