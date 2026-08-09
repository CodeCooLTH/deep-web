import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Fix round 1 (feature 00038) — reviewer ชี้ว่า countUnansweredForShops() ไม่มีเทสเลย ซึ่งเป็น
 * เหตุผลที่บั๊ก "เติม isAutoReply=false เข้า subquery" หลุดออกไปได้ (ขัดกับ AC-CR-25/BR-CR-S1)
 *
 * หนี้ #1 (2026-08-09) — countUnansweredForShops() ถูกรื้อให้เรียก countCommentPostStatesByShop()
 * ตัวเดียวกับที่ listCommentPosts() ใช้คำนวณ counts.unanswered (เดิมมี $queryRaw ของตัวเองแยกกัน
 * สองชุดที่ "น่าจะตรงกัน") — เทสชุดนี้จึงต้องอัปเดตให้ตรงกับ SQL รูปแบบใหม่ (CTE 3 กลุ่ม แทนที่
 * count(DISTINCT postId) ตัวเดียว) แต่ยัง**คงเจตนาเดิมไว้ทุกข้อ**: เงื่อนไขที่ตัดสิน "ยังไม่ตอบ"
 * ต้องไม่มี isAutoReply, ยังเช็ค isFromPage, และ scope ด้วย shopIds ที่รับเข้ามาจริง
 *
 * เทสชุดนี้ไม่ผูกกับผลลัพธ์ตัวเลข (count) เพราะฟังก์ชันพึ่ง $queryRaw ดิบที่ต้องมี Postgres จริงถึงจะ
 * รันได้ — สิ่งที่ทดสอบได้แบบ unit จริง ๆ (ไม่ใช่ integration) คือ **สตริง SQL ที่ประกอบขึ้นก่อนส่งเข้า
 * $queryRaw** ว่ามีเงื่อนไขที่ถูกต้องหรือไม่ — mock เฉพาะ boundary (`$queryRaw` tag function +
 * `assertShopsAccessible`) แล้ว capture argument จริงที่โค้ดจริงส่งเข้ามา ไม่ใช่ assert ค่าที่ตัวเอง
 * เขียนขึ้นมาเอง (feedback_verify_dont_assume — เทสที่ mock ตามข้อสันนิษฐานแล้วเขียวเสมอไม่มีความหมาย)
 *
 * ดูเทสที่พิสูจน์ว่า countUnansweredForShops() กับ counts.unanswered (listCommentPosts) ให้เลขตรงกัน
 * เสมอที่ comment-post-counts.test.ts (หนี้ #1 ข้อหลัก)
 */

let capturedStrings: string[] | null = null
let capturedValues: unknown[] = []

vi.mock('@/lib/prisma', () => {
  const db: Record<string, unknown> = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      capturedStrings = [...strings]
      capturedValues = values
      // BigInt(0) แทน literal 0n — tsconfig target ES2017 ไม่รองรับ BigInt literal syntax
      return [{ all: BigInt(0), unanswered: BigInt(0), botAnswered: BigInt(0), humanAnswered: BigInt(0) }]
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

import { Prisma } from '@prisma/client'
import { countUnansweredForShops } from '@/services/page-comment.service'

/**
 * ตัด substring ของเงื่อนไข CASE ... WHEN NOT EXISTS (...) THEN 'UNANSWERED' ออกมาเดี่ยว ๆ — ต้อง
 * เจาะจงที่ branch นี้ ไม่ใช่ทั้ง SQL เพราะ query รูปแบบใหม่มี isAutoReply ปรากฏจริงในอีก 2 branch
 * (HUMAN_ANSWERED/BOT_ANSWERED) ซึ่งถูกต้องแล้ว — AC-CR-25 ห้ามเฉพาะ branch ที่ตัดสิน UNANSWERED
 */
function extractUnansweredBranch(sql: string): string {
  const start = sql.indexOf('WHEN NOT EXISTS (')
  const end = sql.indexOf("THEN 'UNANSWERED'")
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('countUnansweredForShops — SQL ที่ยิงจริง (Fix round 1: ย้อน isAutoReply ออก)', () => {
  beforeEach(() => {
    capturedStrings = null
    capturedValues = []
  })

  it('เงื่อนไขที่ตัดสิน UNANSWERED ไม่มี isAutoReply เลย (AC-CR-25: บอทตอบครบทั้งโพสต์ต้องหายจาก badge นี้)', async () => {
    await countUnansweredForShops({ shopIds: ['shop-1'], actorUserId: 'user-1' })
    const sql = (capturedStrings ?? []).join('')
    const unansweredBranch = extractUnansweredBranch(sql)
    expect(unansweredBranch).not.toContain('isAutoReply')
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

  it('ไม่ scope ด้วย shopChannelId/ค้นหา (badge ไม่รู้จักตัวกรองพวกนั้น นับทั้งร้านเสมอ)', async () => {
    await countUnansweredForShops({ shopIds: ['shop-1'], actorUserId: 'user-1' })
    // interpolation ที่ 2 (channelFilter) และ 3 (searchFilter) ต้องเป็น Prisma.empty ตัวเดียวกันเป๊ะ
    // (Sql instance เดี่ยว export จาก @prisma/client) เมื่อไม่ได้ส่ง shopChannelId/q เข้ามา — เช็คแบบนี้
    // เพราะเนื้อ SQL จริงของ fragment ที่ interpolate เข้าไปไม่ปรากฏใน capturedStrings (มันเป็น value
    // ไม่ใช่ literal text ของ template) grep ข้อความจึงมองไม่เห็นว่ามันว่างจริงหรือเปล่า
    expect(capturedValues[1]).toBe(Prisma.empty)
    expect(capturedValues[2]).toBe(Prisma.empty)
  })
})
