import { describe, it, expect, vi } from 'vitest'

/**
 * แท็บ "หมดอายุ" ในกล่องแชทความคิดเห็น (user สั่ง 2026-08-19)
 *
 * นิยาม: คอมเมนต์ที่ **ยังไม่ตอบ** และ **พ้นหน้าต่างทักแชทส่วนตัว 7 วัน** แล้ว
 *
 * 🛑 สิ่งที่เทสชุดนี้ต้องกันไว้ให้ได้ มี 3 อย่างที่ไม่มี gate อื่นของโปรเจกต์เห็น:
 *   1. เกณฑ์ต้องเป็น "และ" ไม่ใช่ "เวลาอย่างเดียว" — เช็คแค่เวลาจะลากคอมเมนต์เก่าที่ตอบไปแล้ว
 *      ทั้งกองเข้าคิว ซึ่งไม่ใช่งานค้างของใครเลย (tsc/build เขียวหมด เพราะ boolean ถูกตามชนิด)
 *   2. TS (matcher ที่กรองรายการ) กับ SQL (ตัวนับบนแท็บ) ต้องใช้เส้นแบ่งเวลาชุดเดียวกัน —
 *      หลุดกันเมื่อไหร่จะได้จอที่เขียนว่า "หมดอายุ 7" นั่งอยู่เหนือรายการ 12 แถว
 *      (จอนี้เคยโชว์ "ยังไม่ตอบ 7 กับ 8" พร้อมกันมาแล้ว — sibling-surface-parity.md)
 *   3. "หมดอายุ" เป็น **สับเซตของ "ยังไม่ตอบ"** ไม่ใช่กลุ่มที่ถูกหักออกไป — ตอบใต้คอมเมนต์
 *      แบบสาธารณะยังทำได้ตลอดไป มันจึงยังเป็นงานค้างจริงที่ต้องอยู่ในคิวเดิมด้วย
 */

let calls: Array<{ strings: string[]; values: unknown[] }> = []

vi.mock('@/lib/prisma', () => {
  const db: Record<string, unknown> = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ strings: [...strings], values })
      return [
        {
          all: BigInt(10),
          unanswered: BigInt(4),
          botAnswered: BigInt(3),
          humanAnswered: BigInt(3),
          expired: BigInt(2),
        },
      ]
    }),
  }
  return { prisma: db }
})

vi.mock('@/lib/shop-context', () => ({
  assertShopsAccessible: vi.fn().mockResolvedValue(undefined),
  canAccessShop: vi.fn(),
}))

import { countCommentStatesByShop, matchesCommentStateFilter } from '@/services/page-comment.service'
import { PRIVATE_REPLY_WINDOW_MS } from '@/lib/private-reply-window'

const NOW = new Date('2026-08-19T12:00:00Z')
/** พ้นหน้าต่างแล้วแน่ ๆ (7 วัน + 1 ชม.) */
const OLD = new Date(NOW.getTime() - PRIVATE_REPLY_WINDOW_MS - 3600_000)
/** ยังอยู่ในหน้าต่าง (เหลืออีก 1 ชม.) */
const FRESH = new Date(NOW.getTime() - PRIVATE_REPLY_WINDOW_MS + 3600_000)

describe('matchesCommentStateFilter — เกณฑ์ของแท็บ "หมดอายุ"', () => {
  it('[blocker] ยังไม่ตอบ + พ้น 7 วัน -> เข้าแท็บหมดอายุ', () => {
    expect(matchesCommentStateFilter({ state: 'UNANSWERED', createdTime: OLD }, 'EXPIRED', NOW)).toBe(true)
  })

  it('[blocker] ตอบไปแล้ว + พ้น 7 วัน -> ไม่เข้า (เกณฑ์เป็น "และ" ไม่ใช่ดูแค่เวลา)', () => {
    expect(matchesCommentStateFilter({ state: 'HUMAN_ANSWERED', createdTime: OLD }, 'EXPIRED', NOW)).toBe(false)
    expect(matchesCommentStateFilter({ state: 'BOT_ANSWERED', createdTime: OLD }, 'EXPIRED', NOW)).toBe(false)
  })

  it('[blocker] ยังไม่ตอบ + ยังอยู่ในหน้าต่าง -> ไม่เข้าแท็บหมดอายุ', () => {
    expect(matchesCommentStateFilter({ state: 'UNANSWERED', createdTime: FRESH }, 'EXPIRED', NOW)).toBe(false)
  })

  it('[blocker] ใบที่หมดอายุ ยังต้องอยู่ในแท็บ "ยังไม่ตอบ" ด้วย (สับเซต ไม่ใช่การหักออก) — ตอบใต้คอมเมนต์แบบสาธารณะยังทำได้ตลอดไป', () => {
    expect(matchesCommentStateFilter({ state: 'UNANSWERED', createdTime: OLD }, 'UNANSWERED', NOW)).toBe(true)
    expect(matchesCommentStateFilter({ state: 'UNANSWERED', createdTime: OLD }, 'ALL', NOW)).toBe(true)
  })

  it('ที่ขอบพอดี (ครบ 7 วันเป๊ะ) -> หมดอายุ — ต้องตรงกับ isWithinPrivateReplyWindow ที่ใช้ `<`', () => {
    const exactly = new Date(NOW.getTime() - PRIVATE_REPLY_WINDOW_MS)
    expect(matchesCommentStateFilter({ state: 'UNANSWERED', createdTime: exactly }, 'EXPIRED', NOW)).toBe(true)
  })

  it('แท็บอื่นไม่ถูกกระทบ', () => {
    expect(matchesCommentStateFilter({ state: 'BOT_ANSWERED', createdTime: OLD }, 'BOT', NOW)).toBe(true)
    expect(matchesCommentStateFilter({ state: 'HUMAN_ANSWERED', createdTime: FRESH }, 'HUMAN', NOW)).toBe(true)
    expect(matchesCommentStateFilter({ state: 'BOT_ANSWERED', createdTime: OLD }, 'UNANSWERED', NOW)).toBe(false)
  })
})

describe('countCommentStatesByShop — ตัวนับของแท็บหมดอายุ', () => {
  it('[blocker] เส้นแบ่งเวลาต้องเข้า SQL เป็น "พารามิเตอร์" ไม่ใช่ literal — นี่คือสิ่งเดียวที่ทำให้ตัวเลขบนแท็บกับรายการใต้มันใช้เกณฑ์เดียวกัน', async () => {
    calls = []
    await countCommentStatesByShop({ shopIds: ['shop-1'] })

    const sql = calls[0]!.strings.join('?')
    // ห้ามมี interval/literal เวลาใน SQL — ถ้าใครเผลอเขียน `NOW() - INTERVAL '7 days'` ตรง ๆ
    // เกณฑ์จะแยกออกจาก PRIVATE_REPLY_WINDOW_MS ทันทีโดยไม่มีอะไรฟ้อง
    expect(sql).not.toMatch(/INTERVAL/i)
    expect(sql).toContain('"createdTime" <')

    // เส้นแบ่งที่ส่งเข้าไปต้องเป็น Date ที่ห่างจาก "ตอนนี้" เท่ากับความกว้างของหน้าต่างพอดี
    const cutoff = calls[0]!.values.find((v): v is Date => v instanceof Date)
    expect(cutoff).toBeInstanceOf(Date)
    const width = Date.now() - cutoff!.getTime()
    expect(Math.abs(width - PRIVATE_REPLY_WINDOW_MS)).toBeLessThan(5_000)
  })

  it('[blocker] นับเฉพาะใบที่ยังไม่ตอบ — FILTER ต้องมีทั้งสองเงื่อนไข ไม่ใช่ expired อย่างเดียว', async () => {
    calls = []
    await countCommentStatesByShop({ shopIds: ['shop-1'] })
    const sql = calls[0]!.strings.join('?')
    expect(sql).toContain(`count(*) FILTER (WHERE state = 'UNANSWERED' AND expired)`)
  })

  it('แปลง bigint ของ expired ถูกคอลัมน์ ไม่สลับกับตัวอื่น', async () => {
    calls = []
    const counts = await countCommentStatesByShop({ shopIds: ['shop-1'] })
    expect(counts).toEqual({ all: 10, unanswered: 4, botAnswered: 3, humanAnswered: 3, expired: 2 })
  })

  it('expired ต้องไม่ถูกบวกเข้าไปใน all — สามกลุ่มหลักยังต้องรวมกันได้เท่า all เหมือนเดิม', async () => {
    calls = []
    const c = await countCommentStatesByShop({ shopIds: ['shop-1'] })
    expect(c.unanswered + c.botAnswered + c.humanAnswered).toBe(c.all)
    expect(c.expired).toBeLessThanOrEqual(c.unanswered)
  })
})
