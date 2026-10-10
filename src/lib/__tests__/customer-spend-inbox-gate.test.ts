/**
 * 00071 S-3 — ยอดสะสมลูกค้าในแชท: aggregate ต้องอยู่หลังเงื่อนไขบทบาทของ "ร้านของเธรด"
 * source-scan (หน้านี้ผูก prisma/session ลึก รันจริงในเทสไม่คุ้ม)
 *
 * mutation: ทำ aggregate ให้เรียกตรง ๆ (ไม่ใช่ `canSeeSpend ? … : …`) → เทสนี้แดง
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = readFileSync(
  join(process.cwd(), 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/page.tsx'),
  'utf8',
)

describe('inbox customerStats spend gate', () => {
  it('canSeeSpend ตัดสินจาก F1 ของร้านเธรด (threadShopId) ไม่ใช่ร้าน active', () => {
    expect(SRC).toMatch(/resolveActiveShopContext\(\{ user: \{ id: user\.id as string, activeShopId: threadShopId \} \}\)/)
    expect(SRC).toMatch(/canSeeSpend = !!threadCtx && can\(rolesFromMembership\(threadCtx\.role, threadCtx\.roles\), 'F1'\)/)
  })

  it('order.aggregate ทุกครั้งอยู่ใต้ canSeeSpend ?', () => {
    const calls = [...SRC.matchAll(/prisma\.order\.aggregate\(/g)]
    expect(calls.length).toBeGreaterThan(0)
    for (const m of calls) {
      expect(SRC.slice(Math.max(0, m.index! - 40), m.index!)).toMatch(/canSeeSpend\s*\?\s*$/)
    }
  })

  it('ไม่ตั้ง customerStats = null เพื่อซ่อนยอด', () => {
    expect(SRC).not.toMatch(/canSeeSpend[^\n]*customerStats = null/)
  })
})
