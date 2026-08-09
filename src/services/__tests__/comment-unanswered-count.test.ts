import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Fix round 1 (feature 00038) — reviewer ชี้ว่า countUnansweredForShops() ไม่มีเทสเลย ซึ่งเป็น
 * เหตุผลที่บั๊ก "เติม isAutoReply=false เข้า subquery" หลุดออกไปได้ (ขัดกับ AC-CR-25/BR-CR-S1)
 *
 * เทสชุดนี้ไม่ผูกกับผลลัพธ์ตัวเลข (count) เพราะฟังก์ชันพึ่ง $queryRaw ดิบที่ต้องมี Postgres จริงถึงจะ
 * รันได้ — สิ่งที่ทดสอบได้แบบ unit จริง ๆ (ไม่ใช่ integration) คือ **สตริง SQL ที่ประกอบขึ้นก่อนส่งเข้า
 * $queryRaw** ว่ามีเงื่อนไขที่ถูกต้องหรือไม่ — mock เฉพาะ boundary (`$queryRaw` tag function +
 * `assertShopsAccessible`) แล้ว capture argument จริงที่โค้ดจริงส่งเข้ามา ไม่ใช่ assert ค่าที่ตัวเอง
 * เขียนขึ้นมาเอง (feedback_verify_dont_assume — เทสที่ mock ตามข้อสันนิษฐานแล้วเขียวเสมอไม่มีความหมาย)
 *
 * **ครอบ:** SQL text ไม่มีคำว่า "isAutoReply" เลย (ข้อ 1) · ยังมี "isFromPage" = true ในเงื่อนไข
 * (ข้อ 2) · shopIds ที่ assertShopsAccessible ผ่านแล้วถูกส่งเข้า Prisma.join() จริงและปรากฏใน
 * argument ที่ $queryRaw ได้รับ (ข้อ 3 — ยืนยันด้วย `.values` ของ Sql fragment ไม่ใช่แค่ grep ข้อความ)
 *
 * **ไม่ครอบ:** ผลลัพธ์ตัวเลขจริงจาก Postgres (ต้อง integration test กับ DB จริง — อยู่นอกขอบเขต
 * unit test), เงื่อนไข isFromPage/isDeleted ของ c. (แถวลูกค้า) — เทสนี้เจาะเฉพาะจุดที่ Fix round 1
 * แก้ (เงื่อนไขใน NOT EXISTS ของฝั่งคำตอบ r.) และจุดที่ reviewer ขอให้กัน scope ไว้เท่านั้น
 */

let capturedStrings: string[] | null = null
let capturedValues: unknown[] = []

vi.mock('@/lib/prisma', () => {
  const db: Record<string, unknown> = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      capturedStrings = [...strings]
      capturedValues = values
      // BigInt(0) แทน literal 0n — tsconfig target ES2017 ไม่รองรับ BigInt literal syntax
      return [{ count: BigInt(0) }]
    }),
  }
  return { prisma: db }
})

// assertShopsAccessible เดิมเรียก listAccessibleShopIds() ซึ่งต้องมี DB จริง — mock ที่ boundary ของ
// shop-context ตรง ๆ (pattern เดียวกับ comment-private-reply.service.test.ts) ให้ผ่านเสมอ เพราะ
// เทสชุดนี้ไม่ได้ทดสอบ authorization — ทดสอบแค่รูปร่างของ SQL ที่ประกอบขึ้นหลังผ่านด่านนั้นแล้ว
vi.mock('@/lib/shop-context', () => ({
  assertShopsAccessible: vi.fn().mockResolvedValue(undefined),
  canAccessShop: vi.fn(),
}))

import { countUnansweredForShops } from '@/services/page-comment.service'

describe('countUnansweredForShops — SQL ที่ยิงจริง (Fix round 1: ย้อน isAutoReply ออก)', () => {
  beforeEach(() => {
    capturedStrings = null
    capturedValues = []
  })

  it('ไม่มี isAutoReply ในเงื่อนไขเลย (AC-CR-25: บอทตอบครบทั้งโพสต์ต้องหายจาก badge นี้)', async () => {
    await countUnansweredForShops({ shopIds: ['shop-1'], actorUserId: 'user-1' })
    const sql = (capturedStrings ?? []).join('')
    expect(sql).not.toContain('isAutoReply')
  })

  it('ยังเช็ค isFromPage = true ในเงื่อนไข NOT EXISTS (ต้องมีคำตอบของเพจอยู่ข้างใต้ถึงนับว่าตอบแล้ว)', async () => {
    await countUnansweredForShops({ shopIds: ['shop-1'], actorUserId: 'user-1' })
    const sql = (capturedStrings ?? []).join('')
    expect(sql).toContain('isFromPage')
  })

  it('ยัง scope ด้วย shopIds ที่รับเข้ามา — Prisma.join() ห่อ shopIds จริง ไม่หลุด scope ข้ามร้าน', async () => {
    await countUnansweredForShops({ shopIds: ['shop-1', 'shop-2'], actorUserId: 'user-1' })
    const sql = (capturedStrings ?? []).join('')
    expect(sql).toContain('shopId')
    // ค่าที่ Prisma.join() ห่อไว้ต้องเป็น shopIds ตัวจริงที่ countUnansweredForShops ได้รับมา
    // (Prisma.join คืน Sql fragment ที่มี .values เป็นอาร์เรย์ค่าดิบ) — ไม่ใช่แค่ assert ว่า "มี
    // สตริง shopId" ลอย ๆ ซึ่งเขียวได้แม้ scope ผิด
    const joinFragment = capturedValues[0] as { values: string[] }
    expect(joinFragment.values).toEqual(['shop-1', 'shop-2'])
  })
})
