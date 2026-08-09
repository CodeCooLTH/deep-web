import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * feature 00038 หนี้ #1 — "ตัวเลขสองชุดบนจอเดียวกันไม่ตรงกัน"
 *
 * badge บนแท็บ "ความคิดเห็น" (`countUnansweredForShops`, layout ครอบทุกหน้า) กับตัวเลขบนแท็บ
 * "ยังไม่ตอบ" ในหน้า /inbox/comments เอง (`counts.unanswered` ที่ listCommentPosts คืน) เคยไม่ตรงกัน
 * เพราะฝั่งหลังคำนวณจาก batch ที่ query มาแค่ 25 โพสต์ แล้ว client บวกสะสมตอน lazy-load — แก้ด้วยการ
 * สกัด countCommentPostStatesByShop() เป็นฟังก์ชันร่วมที่ทั้งสองทางเรียก แทนที่จะเขียน SQL คนละชุดที่
 * "น่าจะตรงกัน" (docs/conventions/sibling-surface-parity.md)
 *
 * เทสชุดนี้พิสูจน์ความตรงกัน**โดยโครงสร้าง** ไม่ใช่แค่เชื่อว่าตรง: capture SQL ดิบที่ $queryRaw ได้รับ
 * จริงจากทั้งสองทางเข้า (ไม่มี Postgres จริงให้รันในเทส unit — pattern เดียวกับ
 * comment-unanswered-count.test.ts) แล้วเทียบว่า **เหมือนกันไบต์ต่อไบต์** เมื่อ scope เดียวกัน — ถ้า
 * ในอนาคตมีใครแยกฟังก์ชันออกจากกันอีกครั้ง (regression กลับไปเป็นสภาพก่อนแก้) เทสนี้ต้องแดงทันที
 */

let calls: Array<{ strings: string[]; values: unknown[] }> = []

vi.mock('@/lib/prisma', () => {
  const db: Record<string, unknown> = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ strings: [...strings], values })
      // เลขที่แยกแยะได้ชัดต่อ field — ถ้าโค้ดสลับ field กันจะจับได้จากเทสข้อ 3
      return [{ all: BigInt(10), unanswered: BigInt(4), botAnswered: BigInt(3), humanAnswered: BigInt(3) }]
    }),
  }
  return { prisma: db }
})

vi.mock('@/lib/shop-context', () => ({
  assertShopsAccessible: vi.fn().mockResolvedValue(undefined),
  canAccessShop: vi.fn(),
}))

import { Prisma } from '@prisma/client'
import { countUnansweredForShops, countCommentPostStatesByShop } from '@/services/page-comment.service'

describe('countUnansweredForShops() กับ counts.unanswered (listCommentPosts) ต้องตรงกันเสมอ', () => {
  beforeEach(() => {
    calls = []
  })

  it('ยิง $queryRaw ด้วย SQL template ข้อความเดียวกันไบต์ต่อไบต์ เมื่อ scope เดียวกัน — proof by construction', async () => {
    await countUnansweredForShops({ shopIds: ['shop-1', 'shop-2'], actorUserId: 'user-1' })
    await countCommentPostStatesByShop({ shopIds: ['shop-1', 'shop-2'] })

    expect(calls).toHaveLength(2)
    // countUnansweredForShops ไม่มี $queryRaw ของตัวเองแล้ว — มันเรียก countCommentPostStatesByShop
    // ตัวเดียวกัน ทั้งสอง call จึงมาจาก call site เดียวกันในซอร์ส (tagged template เดียวกัน) เนื้อหา
    // ของ literal segments ต้องเหมือนกันเป๊ะ — ถ้าในอนาคตมีใครแยก $queryRaw ออกเป็นสองก้อนอีกครั้ง
    // (regression กลับไปเป็นสภาพก่อนแก้) segment ทั้งสองฝั่งจะไม่เท่ากันอีกต่อไปและเทสนี้ต้องแดง
    expect(calls[0].strings).toEqual(calls[1].strings)
  })

  it('ตัวเลข unanswered ที่คืนออกมาเท่ากันเสมอ — countUnansweredForShops คือ .unanswered ของอีกฟังก์ชันตัวเดียวกัน', async () => {
    const unanswered = await countUnansweredForShops({ shopIds: ['shop-1'], actorUserId: 'user-1' })
    const counts = await countCommentPostStatesByShop({ shopIds: ['shop-1'] })
    expect(unanswered).toBe(counts.unanswered)
    expect(unanswered).toBe(4)
  })

  it('แปลง bigint ของทั้ง 4 field ถูกคอลัมน์ ไม่สลับกัน', async () => {
    const counts = await countCommentPostStatesByShop({ shopIds: ['shop-1'] })
    expect(counts).toEqual({ all: 10, unanswered: 4, botAnswered: 3, humanAnswered: 3 })
  })
})

describe('countCommentPostStatesByShop — edge cases', () => {
  beforeEach(() => {
    calls = []
  })

  it('shopIds ว่าง — คืนศูนย์ทั้งหมดโดยไม่ยิง $queryRaw เลย', async () => {
    const counts = await countCommentPostStatesByShop({ shopIds: [] })
    expect(counts).toEqual({ all: 0, unanswered: 0, botAnswered: 0, humanAnswered: 0 })
    expect(calls).toHaveLength(0)
  })

  it('ส่ง shopChannelId เข้ามา — interpolation ตัวที่ 2 ต้องไม่ใช่ Prisma.empty (มีตัวกรองเพจจริง)', async () => {
    await countCommentPostStatesByShop({ shopIds: ['shop-1'], shopChannelId: 'ch-1' })
    expect(calls[0].values[1]).not.toBe(Prisma.empty)
  })

  it('ส่ง q เข้ามา — interpolation ตัวที่ 3 ต้องไม่ใช่ Prisma.empty (มีตัวกรองค้นหาจริง) และมี ILIKE', async () => {
    await countCommentPostStatesByShop({ shopIds: ['shop-1'], q: 'ปั๊ม' })
    const searchFilter = calls[0].values[2] as Prisma.Sql
    expect(searchFilter).not.toBe(Prisma.empty)
    // เนื้อ SQL ของ fragment ที่ interpolate เข้าไปไม่ปรากฏใน capturedStrings (มันเป็น value ไม่ใช่
    // literal text ของ template — เหตุผลเดียวกับที่ comment-unanswered-count.test.ts เจอ) ต้องอ่านจาก
    // `.sql` ของ Sql fragment เอง (Prisma แปลง placeholder ให้เป็น "?" แทนค่าจริง ปลอดภัยต่อการ log)
    expect(searchFilter.sql).toContain('ILIKE')
  })
})
