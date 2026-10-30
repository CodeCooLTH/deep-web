/**
 * 00086 FR-018/019 — UI ค่าใช้จ่ายพนักงาน + ป้าย "บันทึกโดย" ของเจ้าของ
 *
 * โปรเจกต์ไม่มี DOM environment (vitest node) ⇒ render ด้วย renderToStaticMarkup + ตรวจเส้นทาง API
 * ผ่านฟังก์ชันบริสุทธิ์ expenseApi (ตัวที่ ExpenseFormModal ใช้จริง) และตรวจซอร์สว่าผู้เรียกส่ง scope="mine"
 */
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
vi.mock('@/components/wrappers/Icon', () => ({
  default: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}))
vi.mock('@/lib/paces-swal', () => ({ pacesConfirm: { danger: async () => true } }))
vi.mock('@/lib/paces-toast', () => ({ pacesToast: { success: () => {}, error: () => {} } }))

import MyExpenses from '../MyExpenses'
import ExpenseList from '../../../components/ExpenseList'
import StaffExpenseCard from '../../../../dashboard/components/StaffExpenseCard'
import { expenseApi, expenseDeleteOutcome, expenseRecordedByLabel, expenseRecordedByViewer } from '@/lib/expense'
import type { SerializedExpense } from '@/services/expense.service'

const row = (over: Partial<SerializedExpense>): SerializedExpense => ({
  id: 'e1',
  shopId: 's1',
  category: 'OTHER',
  amount: 120,
  expenseDate: '2026-10-20',
  note: null,
  createdByUserId: 'staff-1',
  createdByName: 'สมชาย',
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
  ...over,
})

const DIR = join(process.cwd(), 'src/app/(paces)/seller/(dashboard)')
const read = (p: string) => readFileSync(join(DIR, p), 'utf8')

describe('expenseApi — เส้นทางตาม scope', () => {
  it("'mine' ยิง /api/expenses/mine ทุกการกระทำ", () => {
    const api = expenseApi('mine')
    expect(api.collection).toBe('/api/expenses/mine')
    expect(api.item('abc')).toBe('/api/expenses/mine/abc')
  })
  it("ค่าตั้งต้น / 'shop' = เส้นทางเจ้าของเดิม", () => {
    expect(expenseApi().collection).toBe('/api/expenses')
    expect(expenseApi('shop').item('abc')).toBe('/api/expenses/abc')
  })
})

describe('expenseDeleteOutcome — 404 = "ลบไปแล้ว" ต้องเป็น Not found จริงเท่านั้น (MINOR-4)', () => {
  it("'mine': 404 Not found = ลบไปแล้ว · 409 NO_SHOP / 403 / 404 อื่น = error", () => {
    expect(expenseDeleteOutcome('mine', 200, null)).toBe('deleted')
    expect(expenseDeleteOutcome('mine', 404, { error: 'Not found' })).toBe('already-gone')
    expect(expenseDeleteOutcome('mine', 409, { error: 'NO_SHOP' })).toBe('error')
    expect(expenseDeleteOutcome('mine', 404, { error: 'NO_SHOP' })).toBe('error')
    expect(expenseDeleteOutcome('mine', 404, null)).toBe('error')
    expect(expenseDeleteOutcome('mine', 403, { error: 'FORBIDDEN_ROLE' })).toBe('error')
    expect(expenseDeleteOutcome('mine', 500, null)).toBe('error')
  })
  it("'shop' (เจ้าของ): พฤติกรรมเดิม — 2xx ลบแล้ว · 404 ใด ๆ ลบไปแล้ว · อื่น error", () => {
    expect(expenseDeleteOutcome('shop', 200, null)).toBe('deleted')
    expect(expenseDeleteOutcome('shop', 404, null)).toBe('already-gone')
    expect(expenseDeleteOutcome('shop', 404, { error: 'NO_SHOP' })).toBe('already-gone')
    expect(expenseDeleteOutcome('shop', 403, null)).toBe('error')
  })
  it('ExpenseFormModal ใช้ expenseDeleteOutcome ตัดสินผลการลบ', () => {
    const src = read('expenses/components/ExpenseFormModal.tsx')
    expect(src).toMatch(/expenseDeleteOutcome\(scope, res\.status, body\)/)
    expect(src).not.toMatch(/res\.status !== 404/)
  })
})

describe('expenseRecordedByLabel', () => {
  it('แถวของคนอื่น = บันทึกโดย {ชื่อ}', () => {
    expect(expenseRecordedByLabel(row({}), 'owner-1')).toBe('บันทึกโดย สมชาย')
  })
  it('แถวของผู้ดูเอง / ไม่รู้ผู้ดู / ไม่มีชื่อ = null', () => {
    expect(expenseRecordedByLabel(row({ createdByUserId: 'owner-1' }), 'owner-1')).toBeNull()
    expect(expenseRecordedByLabel(row({}), null)).toBeNull()
    expect(expenseRecordedByLabel(row({ createdByName: null }), 'owner-1')).toBeNull()
    expect(expenseRecordedByLabel(row({ createdByName: '  ' }), 'owner-1')).toBeNull()
  })
})

describe('expenseRecordedByViewer — ป้าย "บันทึกโดย" ร้านบริการเท่านั้น (ไม่รั่วข้าม vertical)', () => {
  const service = { kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' }
  const label = (shop: { kind: string; vertical: string }, r: SerializedExpense) =>
    expenseRecordedByLabel(r, expenseRecordedByViewer(shop, 'owner-1'))

  it('ร้านขายของ/ที่พัก (มีเจ้าของร่วม) = ไม่มีป้ายเลย แม้แถวคนอื่นบันทึก', () => {
    for (const vertical of ['ONLINE_SALES', 'LODGING']) {
      const shop = { kind: 'BUSINESS', vertical }
      expect(expenseRecordedByViewer(shop, 'owner-1')).toBeNull()
      expect(label(shop, row({ createdByUserId: 'co-owner', createdByName: 'หุ้นส่วน' }))).toBeNull()
    }
  })
  it('ร้านบริการ = ป้ายเฉพาะแถวของคนอื่น', () => {
    expect(label(service, row({}))).toBe('บันทึกโดย สมชาย')
    expect(label(service, row({ createdByUserId: 'owner-1' }))).toBeNull()
  })
  it('ไม่มีร้าน / ไม่รู้ผู้ดู = null', () => {
    expect(expenseRecordedByViewer(null, 'owner-1')).toBeNull()
    expect(expenseRecordedByViewer(service, null)).toBeNull()
  })
  it('หน้า /expenses ส่ง viewerUserId ผ่าน expenseRecordedByViewer (ไม่ส่ง session ตรง ๆ)', () => {
    const src = read('expenses/page.tsx')
    expect(src).toMatch(/viewerUserId=\{expenseRecordedByViewer\(decision\.shop, sessionLike\.user\.id\)\}/)
    expect(src).not.toMatch(/viewerUserId=\{sessionLike\.user\.id\}/)
  })
})

describe('ExpenseList (เจ้าของ) — "บันทึกโดย" เฉพาะแถวของคนอื่น', () => {
  const html = renderToStaticMarkup(
    <ExpenseList
      expenses={[
        row({ id: 'a', createdByUserId: 'owner-1', createdByName: 'เจ้าของ' }),
        row({ id: 'b', createdByUserId: 'staff-1', createdByName: 'สมชาย' }),
      ]}
      hasAnyExpenseEver
      onEdit={() => {}}
      onAdd={() => {}}
      onMutated={() => {}}
      viewerUserId="owner-1"
    />,
  )
  it('ขึ้นชื่อพนักงาน ไม่ขึ้นชื่อเจ้าของ', () => {
    expect(html).toContain('บันทึกโดย สมชาย')
    expect(html).not.toContain('บันทึกโดย เจ้าของ')
    expect(html.match(/บันทึกโดย/g)).toHaveLength(1)
  })
  it('ไม่ส่ง viewerUserId = ไม่มีป้ายเลย (พฤติกรรมเดิม)', () => {
    const plain = renderToStaticMarkup(
      <ExpenseList expenses={[row({})]} hasAnyExpenseEver onEdit={() => {}} onAdd={() => {}} onMutated={() => {}} />,
    )
    expect(plain).not.toContain('บันทึกโดย')
  })
})

describe('MyExpenses (พนักงาน) — แสดงเฉพาะแถวที่ได้รับ ไม่มียอดรวม', () => {
  it('แสดงทุกแถวที่ให้มา ไม่มีคำว่า รวม/กำไร และไม่มีป้ายบันทึกโดย', () => {
    const html = renderToStaticMarkup(
      <MyExpenses
        initialExpenses={[
          row({ id: 'a', category: 'SHIPPING', amount: 150, note: 'ค่ารถไปหน้างาน' }),
          row({ id: 'b', category: 'OTHER', amount: 80 }),
        ]}
      />,
    )
    expect(html).toContain('ที่ฉันบันทึก')
    expect(html).toContain('ค่าขนส่ง')
    expect(html).toContain('ค่ารถไปหน้างาน')
    expect(html).toContain('เห็นเฉพาะรายการที่คุณบันทึก')
    expect(html.match(/aria-label="แก้ไข /g)).toHaveLength(2)
    // ไม่มียอดรวม 230 / กำไร / แยกหมวด
    // (ข้อความ "ยอดรวม กำไร ... เห็นได้เฉพาะเจ้าของร้าน" เป็นคำอธิบาย ไม่ใช่ตัวเลข — ตรวจที่ตัวเลข/ป้ายสรุปแทน)
    expect(html).not.toMatch(/230/)
    expect(html).not.toMatch(/รวม\s*<b|รวม ฿/)
    expect(html.match(/฿/g)).toHaveLength(4) // 2 แถว × (aria-label + จำนวนเงิน) — ไม่มียอดเงินอื่น
    expect(html).not.toContain('บันทึกโดย')
  })
  it('ไม่มีแถว = ยังไม่มีรายการ', () => {
    const html = renderToStaticMarkup(<MyExpenses initialExpenses={[]} />)
    expect(html).toContain('ยังไม่มีรายการ')
  })
  it('ทุกการเขียน/โหลดใหม่ผ่าน scope mine (ไม่มีเส้นทางเจ้าของในไฟล์)', () => {
    const src = read('expenses/mine/components/MyExpenses.tsx')
    expect(src).toContain('scope="mine"')
    expect(src).toContain("expenseApi('mine').collection")
    expect(src).not.toMatch(/['"`]\/api\/expenses/)
  })
})

describe('ExpenseFormModal — ทุก fetch ผ่าน expenseApi(scope)', () => {
  const src = read('expenses/components/ExpenseFormModal.tsx')
  it('ไม่มี URL /api/expenses ฝังตายตัว (แก้/ลบของพนักงานจึงไม่หลุดไปเส้นทางเจ้าของ)', () => {
    expect(src).not.toMatch(/['"`]\/api\/expenses/)
    expect(src).toContain('api.item(editing.id)')
    expect(src).toContain("scope = 'shop'")
  })
})

describe('StaffExpenseCard (หน้าแรก)', () => {
  const html = renderToStaticMarkup(<StaffExpenseCard count={3} />)
  it('หัวการ์ด + ปุ่มเพิ่ม + ลิงก์ดูทั้งหมด + จำนวนของตัวเอง ไม่มียอดเงิน', () => {
    expect(html).toContain('ค่าใช้จ่ายที่ฉันบันทึก')
    expect(html).toContain('เพิ่มค่าใช้จ่าย')
    expect(html).toContain('href="/expenses/mine"')
    expect(html).toContain('3 รายการ · เห็นเฉพาะของคุณ')
    expect(html).not.toContain('฿')
  })
  it('โมดัลของการ์ดยิงทาง mine', () => {
    expect(read('dashboard/components/StaffExpenseCard.tsx')).toContain('scope="mine"')
  })
})
