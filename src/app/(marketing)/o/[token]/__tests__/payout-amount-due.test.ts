/**
 * [blocker] 00068 TD-004/B3 — QR/ยอดของ PayoutAccountCard ต้องใช้ `amountDue` (ร้านบริการ = ยอดค้าง, D-4)
 * ไม่ใช่ totalAmount และผู้เรียกทุกจุดต้องส่งผ่าน `resolveTransferAmount` (ห้ามเขียนสูตรซ้ำ/ส่งยอดเต็มตรง ๆ)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBuyerOrderFile, stripComments, BUYER_ORDER_DIR } from '@/lib/__tests__/helpers/buyer-order-sources'

describe('PayoutAccountCard amountDue [blocker]', () => {
  const card = readBuyerOrderFile('PayoutAccountCard.tsx', { stripComments: true })

  it('การ์ดไม่มี totalAmount เหลือเลย และ QR/ข้อความใช้ amountDue', () => {
    expect(card).not.toMatch(/totalAmount/)
    expect(card).toMatch(/buildPromptPayPayload\(\{[^}]*amount: amountDue/)
    expect(card).toMatch(/baht\.format\(amountDue\)/)
  })

  it('amountDue เป็น prop บังคับ (ไม่มี ? และไม่มี default)', () => {
    expect(card).toMatch(/\n\s*amountDue: number\n/)
    expect(card).not.toMatch(/amountDue\s*=/)
  })

  it.each([
    ['OrderDetailMobile.tsx', readBuyerOrderFile('OrderDetailMobile.tsx', { stripComments: true })],
    ['GuestOrderView.tsx', stripComments(readFileSync(join(BUYER_ORDER_DIR, 'GuestOrderView.tsx'), 'utf8'))],
  ])('%s ส่ง amountDue ผ่าน resolveTransferAmount', (_f, src) => {
    const m = src.match(/<PayoutAccountCard[\s\S]{0,400}?contactShopAction=/)
    expect(m).not.toBeNull()
    expect(m![0]).toMatch(/amountDue=\{resolveTransferAmount\(\{/)
    expect(m![0]).not.toMatch(/amountDue=\{order\.totalAmount/)
  })
})
