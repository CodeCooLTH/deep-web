/**
 * StaffRolePicker — การ์ดที่ 5–6 ของร้านบริการ (00086 FR-004/006/017)
 * repo ไม่มี DOM (vitest environment node) ⇒ markup ใช้ renderToStaticMarkup ·
 * การกดใช้วิธีเรียก component เป็นฟังก์ชัน (mock useId) แล้วกด onToggle ของการ์ดในต้นไม้ element
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import StaffRolePicker from '../StaffRolePicker'
import { NO_STAFF_FLAGS, type StaffFlags, type StaffRole } from '@/lib/shop-role-picker'

vi.mock('@/components/wrappers/Icon', () => ({ default: () => null }))

type Props = Parameters<typeof StaffRolePicker>[0]
const base = (p: Partial<Props> = {}): Props => ({
  legend: 'เลือกบทบาท',
  selected: ['CHAT'],
  onChange: () => {},
  billingAvailable: true,
  serviceFlagsAvailable: true,
  flags: NO_STAFF_FLAGS,
  onFlagsChange: () => {},
  action: 'save',
  ...p,
})
const html = (p: Partial<Props> = {}) => renderToStaticMarkup(<StaffRolePicker {...base(p)} />)
const cardCount = (h: string) => (h.match(/type="checkbox"/g) ?? []).length
/** แท็ก <input> ของการ์ดที่ aria-describedby ชี้ไปที่คำอธิบายซึ่งมีข้อความนี้ */
const inputFor = (h: string, label: string) => {
  const i = h.indexOf(`>${label}</span>`)
  expect(i).toBeGreaterThan(-1)
  const start = h.lastIndexOf('<input', i)
  return h.slice(start, h.indexOf('>', start) + 1)
}

describe('StaffRolePicker — จำนวนการ์ดตามประเภทร้าน', () => {
  it('ร้านบริการ = 6 การ์ด (4 บทบาท + ปิดงานได้ + บันทึกค่าใช้จ่ายได้) เรียงต่อท้าย', () => {
    const h = html()
    expect(cardCount(h)).toBe(6)
    const order = ['ผู้ดูแล', 'ตอบแชท', 'เปิดบิล', 'ฝ่ายช่าง', 'ปิดงานได้', 'บันทึกค่าใช้จ่ายได้'].map((l) => h.indexOf(`>${l}</span>`))
    expect(order.every((x, i) => x > -1 && (i === 0 || x > order[i - 1]))).toBe(true)
    expect(h).toContain('เพิ่ม แก้ และลบค่าใช้จ่ายที่ตัวเองบันทึก · ไม่เห็นรายการคนอื่น ยอดรวม และกำไร')
  })
  it('ร้านขายของออนไลน์/ที่พัก (serviceFlagsAvailable=false) = 4 การ์ดเหมือนเดิม ไม่มีการ์ดธง', () => {
    const h = html({ serviceFlagsAvailable: false, billingAvailable: false, selected: ['MANAGER'] })
    expect(cardCount(h)).toBe(3) // ONLINE_SALES/LODGING: เปิดบิลซ่อนอยู่แล้ว (พฤติกรรมเดิม)
    expect(h).not.toContain('ปิดงานได้')
    expect(h).not.toContain('บันทึกค่าใช้จ่ายได้')
    // drift BILLING บนร้านไม่ใช่บริการ = 4 การ์ด (พฤติกรรมเดิม)
    expect(cardCount(html({ serviceFlagsAvailable: false, billingAvailable: false, selected: ['BILLING'] }))).toBe(4)
  })
})

describe('StaffRolePicker — การ์ดปิดงานได้', () => {
  it('มีผู้ดูแล → ติ๊กค้าง + disabled + "ผู้ดูแลปิดงานได้อยู่แล้ว"', () => {
    const h = html({ selected: ['MANAGER'] })
    const tag = inputFor(h, 'ปิดงานได้')
    expect(tag).toContain('checked=""')
    expect(tag).toContain('disabled=""')
    expect(tag).toContain('aria-describedby=')
    expect(h).toContain('ผู้ดูแลปิดงานได้อยู่แล้ว')
  })
  it('เปิดบิลอย่างเดียว → disabled ไม่ติ๊ก + ข้อความเตือนโทน warning-ink', () => {
    const h = html({ selected: ['BILLING'], flags: { canCloseJob: true, canRecordExpense: false } })
    const tag = inputFor(h, 'ปิดงานได้')
    expect(tag).not.toContain('checked=""')
    expect(tag).toContain('disabled=""')
    expect(h).toMatch(/text-warning-ink">ใช้คู่กับ ตอบแชท หรือ ฝ่ายช่าง \(บทบาทที่เริ่มงานได้\)</)
  })
  it('ตอบแชท → แก้ได้ ตามธง', () => {
    expect(inputFor(html({ selected: ['CHAT'] }), 'ปิดงานได้')).not.toMatch(/checked=""|disabled=""/)
    expect(inputFor(html({ selected: ['TECHNICIAN'], flags: { canCloseJob: true, canRecordExpense: false } }), 'ปิดงานได้')).toContain('checked=""')
  })
  it('บันทึกค่าใช้จ่ายได้ แก้ได้เสมอ ค่าตั้งต้นไม่ติ๊ก', () => {
    for (const selected of [['MANAGER'], ['BILLING'], []] as StaffRole[][]) {
      expect(inputFor(html({ selected }), 'บันทึกค่าใช้จ่ายได้')).not.toMatch(/checked=""|disabled=""/)
    }
  })
})

// ── การกด: เรียก component เป็นฟังก์ชันตรง ๆ (ต้อง mock useId เพราะไม่ได้อยู่ใน render ของ React) ──
vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>()
  let n = 0
  return { ...actual, useId: () => `uid${++n}` }
})

function findCard(node: ReactNode, idSuffix: string): ReactElement<{ id: string; onToggle: () => void }> | null {
  if (Array.isArray(node)) {
    for (const c of node) {
      const f = findCard(c, idSuffix)
      if (f) return f
    }
    return null
  }
  if (!isValidElement(node)) return null
  const props = node.props as { id?: string; onToggle?: () => void; children?: ReactNode }
  if (typeof props.id === 'string' && props.id.endsWith(`-${idSuffix}`) && props.onToggle) {
    return node as ReactElement<{ id: string; onToggle: () => void }>
  }
  return findCard(props.children, idSuffix)
}

function press(p: Partial<Props>, idSuffix: string) {
  const onChange = vi.fn()
  const onFlagsChange = vi.fn()
  const tree = (StaffRolePicker as (x: Props) => ReactNode)(base({ ...p, onChange, onFlagsChange }))
  const card = findCard(tree, idSuffix)
  expect(card).not.toBeNull()
  card!.props.onToggle()
  return { onChange, onFlagsChange }
}

describe('StaffRolePicker — การกด', () => {
  const on: StaffFlags = { canCloseJob: true, canRecordExpense: true }

  it('[blocker] เอาตอบแชทออกจนเหลือเปิดบิลอย่างเดียว → ปลด canCloseJob ในธงที่ส่งออก (ค่าใช้จ่ายคงเดิม)', () => {
    const { onChange, onFlagsChange } = press({ selected: ['CHAT', 'BILLING'], flags: on }, 'CHAT')
    expect(onChange).toHaveBeenCalledWith(['BILLING'])
    expect(onFlagsChange).toHaveBeenCalledWith({ canCloseJob: false, canRecordExpense: true })
  })
  it('เปลี่ยนบทบาทแต่ยังมีบทบาทเริ่มงาน → ไม่แตะธง', () => {
    const { onFlagsChange } = press({ selected: ['CHAT'], flags: on }, 'TECHNICIAN')
    expect(onFlagsChange).not.toHaveBeenCalled()
  })
  it('[blocker] กดเลือกฝ่ายช่าง → ติ๊ก "ปิดงานได้" ให้อัตโนมัติ · ค่าใช้จ่ายคงเดิม (มติ 2026-10-30)', () => {
    const { onChange, onFlagsChange } = press({ selected: [], flags: { canCloseJob: false, canRecordExpense: false } }, 'TECHNICIAN')
    expect(onChange).toHaveBeenCalledWith(['TECHNICIAN'])
    expect(onFlagsChange).toHaveBeenCalledWith({ canCloseJob: true, canRecordExpense: false })
  })
  it('[blocker] ช่างที่ติ๊กปิดงานออกไว้ → กดการ์ดปิดงาน/บทบาทอื่น ไม่ถูกติ๊กกลับ', () => {
    const off = { canCloseJob: false, canRecordExpense: false }
    expect(press({ selected: ['TECHNICIAN'], flags: { canCloseJob: true, canRecordExpense: false } }, 'closeJob').onFlagsChange)
      .toHaveBeenCalledWith(off)
    expect(press({ selected: ['TECHNICIAN'], flags: off }, 'CHAT').onFlagsChange).not.toHaveBeenCalled()
  })
  it('ร้านไม่ใช่บริการ → ไม่ emit ธงเลย', () => {
    const { onFlagsChange } = press({ serviceFlagsAvailable: false, billingAvailable: false, selected: ['CHAT'], flags: on }, 'CHAT')
    expect(onFlagsChange).not.toHaveBeenCalled()
  })
  it('กดการ์ดธงสลับเฉพาะธงนั้น', () => {
    expect(press({ selected: ['CHAT'] }, 'closeJob').onFlagsChange).toHaveBeenCalledWith({ canCloseJob: true, canRecordExpense: false })
    expect(press({ selected: ['CHAT'] }, 'recordExpense').onFlagsChange).toHaveBeenCalledWith({ canCloseJob: false, canRecordExpense: true })
  })
})
