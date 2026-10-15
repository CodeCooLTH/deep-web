import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TemplateV1 } from '@/lib/line-report/template'

const warning = vi.fn()
vi.mock('@/lib/paces-swal', () => ({ pacesConfirm: { warning: (...a: unknown[]) => warning(...a) } }))
import { confirmExpenseExposure } from '../confirm-expense'

const t = (...types: string[]): TemplateV1 => ({ v: 1, button: { show: true, label: 'เปิด Deep' }, blocks: [{ id: 'o', type: 'orders' }, ...types.map((x, i) => ({ id: `x${i}`, type: x }))] }) as unknown as TemplateV1
beforeEach(() => warning.mockReset())

describe('confirmExpenseExposure', () => {
  it('เพิ่ม expense/net_sales ครั้งแรก = ถาม · ยกเลิก = false · ยืนยัน = true', async () => {
    warning.mockResolvedValueOnce(false)
    expect(await confirmExpenseExposure(t(), t('expense'), false)).toBe(false)
    warning.mockResolvedValueOnce(true)
    expect(await confirmExpenseExposure(t(), t('net_sales'), false)).toBe(true)
    expect(warning).toHaveBeenCalledTimes(2)
  })
  it('ยืนยันแล้วในเซสชัน / มีอยู่แล้ว / ไม่เกี่ยวกับค่าใช้จ่าย = ไม่ถาม', async () => {
    expect(await confirmExpenseExposure(t(), t('expense'), true)).toBe(true)
    expect(await confirmExpenseExposure(t('expense'), t('expense', 'net_sales'), false)).toBe(true)
    expect(await confirmExpenseExposure(t(), t('profit'), false)).toBe(true)
    expect(warning).not.toHaveBeenCalled()
  })
  it('ปุ่มชี้หน้าสรุป: ข้อความต่อท้ายเรื่องโน้ตขึ้นหน้าสาธารณะ · ไม่ชี้ = ไม่มี', async () => {
    warning.mockResolvedValue(true)
    const d = { ...t('expense'), button: { show: true, label: 'x', target: 'DETAIL' } } as unknown as TemplateV1
    await confirmExpenseExposure(t(), d, false)
    await confirmExpenseExposure(t(), t('expense'), false)
    expect(warning.mock.calls[0][1]).toContain('โน้ตของแต่ละรายการ')
    expect(warning.mock.calls[1][1]).not.toContain('โน้ต')
  })
})
