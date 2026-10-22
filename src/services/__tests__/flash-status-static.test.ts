/**
 * 00084 T7a — เทสไม่ต้องใช้ DB: สแกนซอร์สห้ามแตะเงิน COD/สถานะออเดอร์ · parity ต้นทุน ISHIP vs FLASH · ตัวช่วย pure
 * mutation ที่ต้องแดง: ใส่คำต้องห้ามในไฟล์ flash*.ts · ทำให้ resolveOutboundShippingCost แยก provider
 */
import { describe, it, expect, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { chunkPnos } from '@/services/flash-status.service'
import { isFlashTrackingSettled, mapFlashState } from '@/lib/flash/status'
import { resolveOutboundShippingCost } from '@/lib/shipping-cost'

const root = join(__dirname, '../../..')
const files = [
  ...readdirSync(join(root, 'src/services')).filter((f) => /^flash.*\.ts$/.test(f)).map((f) => join(root, 'src/services', f)),
  ...readdirSync(join(root, 'src/lib/flash')).filter((f) => f.endsWith('.ts') && statSync(join(root, 'src/lib/flash', f)).isFile()).map((f) => join(root, 'src/lib/flash', f)),
]
// ตัด comment ออกก่อนสแกน (คำอธิบายกฎอาจเอ่ยชื่อคำต้องห้าม) — ตัด // เฉพาะที่ไม่ใช่ส่วนของ URL
const code = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1')

describe('[blocker] เส้นทาง Flash ห้ามแตะเงิน COD / สถานะออเดอร์ (BR-FLASH-40/44)', () => {
  it('พบไฟล์ที่ต้องสแกน (กันสแกนว่างเปล่า)', () => {
    expect(files.some((f) => f.endsWith('flash-status.service.ts'))).toBe(true)
    expect(files.some((f) => f.endsWith('lib/flash/status.ts'))).toBe(true)
  })
  it.each(['payment_success', 'codSettledAt', 'advanceOrderOnCarrierMove', 'settleCodFromCarrier'])('ไม่มี %s', (word) => {
    expect(files.filter((f) => code(f).includes(word)).map((f) => f.replace(root, ''))).toEqual([])
  })
  it('ไม่เขียนตาราง Order (มีแต่ orderShipment)', () => {
    const hits = files.filter((f) => /prisma\.order\.(update|updateMany|upsert|create)\b/.test(code(f)))
    expect(hits.map((f) => f.replace(root, ''))).toEqual([])
  })
})

describe('mapFlashState ไม่ผลิตสถานะเงิน', () => {
  it('ทุก state 0..99 ไม่ได้ payment_success', () => {
    for (let i = 0; i < 100; i++) expect(mapFlashState(i)).not.toBe('payment_success')
  })
})

describe('ชุด poll ตรงกับ isFlashTrackingSettled', () => {
  it('delivered/close/cancelled/return_success จบ · สถานะอื่นไม่จบ (ชุด SQL notIn ต้องเท่ากัน)', () => {
    const src = readFileSync(join(root, 'src/services/flash-status.service.ts'), 'utf8')
    const list = /SETTLED_CODES = \[([^\]]*)\]/.exec(src)![1].split(',').map((s) => s.trim().replace(/"/g, ''))
    expect(list.sort()).toEqual(['cancelled', 'close', 'delivered', 'return_success'])
    for (const c of list) expect(isFlashTrackingSettled(c)).toBe(true)
    for (const c of ['order_success', 'picked_up', 'in_transit', 'progress', 'issue', 'return', null]) expect(isFlashTrackingSettled(c)).toBe(false)
  })
})

describe('chunkPnos', () => {
  it('ทุกก้อนยาว (รวมจุลภาค) ≤500 และไม่ทำ pno หาย/ซ้ำ', () => {
    const pnos = Array.from({ length: 120 }, (_, i) => `TH${String(i).padStart(11, '0')}A`)
    const chunks = chunkPnos(pnos)
    for (const c of chunks) expect(c.join(',').length).toBeLessThanOrEqual(500)
    expect(chunks.flat()).toEqual(pnos)
    expect(chunks.length).toBeGreaterThan(1)
  })
  it('ว่าง = ไม่มีก้อน', () => expect(chunkPnos([])).toEqual([]))
})

describe('parity ต้นทุนค่าส่ง: แถว FLASH = แถว ISHIP เมื่อตัวเลขเท่ากัน', () => {
  // resolveOutboundShippingCost รับเฉพาะตัวเลข ไม่มี provider เข้ามาเลย — ทั้ง 3 พื้นผิว (pnl · dashboard · /sales) ผ่านฟังก์ชันนี้
  const cases = [
    { carrierPrice: 65, estimatedPrice: null, codFee: 7 },
    { carrierPrice: null, estimatedPrice: 50, codFee: 7 },
    { carrierPrice: null, estimatedPrice: null, codFee: null },
    { carrierPrice: 0, estimatedPrice: 40, codFee: null },
  ]
  it.each(cases)('ผลเท่ากัน %o', (f) => {
    const ishipRow = { provider: 'ISHIP', ...f }
    const flashRow = { provider: 'FLASH', ...f }
    expect(resolveOutboundShippingCost({ forward: flashRow, manual: null })).toEqual(resolveOutboundShippingCost({ forward: ishipRow, manual: null }))
    expect(resolveOutboundShippingCost({ forward: flashRow, manual: 30 })).toEqual(resolveOutboundShippingCost({ forward: ishipRow, manual: 30 }))
  })
  it('Flash ยังไม่มีราคาจริง = pending (ไม่บวม 0 เงียบ ๆ)', () => {
    expect(resolveOutboundShippingCost({ forward: { carrierPrice: null, estimatedPrice: null, codFee: null }, manual: null })).toMatchObject({ amount: 0, pending: true })
  })
  it('ผู้เรียกทั้ง 3 พื้นผิวยังเรียกฟังก์ชันกลางเดียวกัน', () => {
    for (const f of ['src/services/pnl.service.ts', 'src/services/dashboard.service.ts', 'src/app/(paces)/seller/(dashboard)/sales/page.tsx']) {
      const text = readFileSync(join(root, f), 'utf8')
      expect(text, f).toContain('resolveOutboundShippingCost')
      expect(text, f).not.toMatch(/provider\s*===?\s*['"]FLASH['"]/)
    }
  })
})
