import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * 00071 T9 — Prisma global omit ตัด OrderItem.cost / Product.cost ทิ้งโดยค่าตั้งต้น และ tsc มองไม่เห็น
 * ถ้าใครลบ opt-in ของหน้าที่คำนวณต้นทุน ตัวเลขกำไรจะผิดเงียบ ๆ (cost = undefined) — HR16
 * ด่านนี้ล็อกผู้อ่านต้นทุนฝั่งหน้า (service ที่ select cost เองถูกล็อกด้วย role-contract test แล้ว)
 */
const read = (p: string) => readFileSync(p, 'utf8')

describe('cost opt-in ของหน้าที่คำนวณต้นทุน', () => {
  it('/sales: getOrdersByShop ต้อง withCost: true (COGS รายวัน)', () => {
    const s = read('src/app/(paces)/seller/(dashboard)/sales/page.tsx')
    expect(s).toMatch(/getOrdersByShop\([^)]*\{\s*withCost:\s*true\s*\}\)/)
  })
  it('/orders/[token]: getOrderForShop ต้อง withCost ตามสิทธิ์ดูกำไร (computeOrderProfit)', () => {
    const s = read('src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx')
    expect(s).toMatch(/getOrderForShop\([^)]*\{\s*withCost:\s*canSeeProfit\s*\}\)/)
  })
  it('prisma client ยังตั้ง omit cost (ถ้าถอด = ต้องทบทวนทุกจุดที่อาศัยการตัดนี้)', () => {
    const s = read('src/lib/prisma.ts')
    expect(s).toMatch(/orderItem:\s*\{\s*cost:\s*true\s*\}/)
    expect(s).toMatch(/product:\s*\{\s*cost:\s*true\s*\}/)
  })
})
