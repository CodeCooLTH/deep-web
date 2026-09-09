import { describe, it, expect } from 'vitest'
import {
  DEFAULT_INBOX_SORT,
  buildCustomerSortCursorWhere,
  buildInboxOrderBy,
  decodeInboxCursor,
  encodeInboxCursor,
  parseInboxSortMode,
  type InboxSortMode,
} from '@/lib/inbox-sort'

/**
 * 00018 ส่วนขยาย 2026-09-09 — ตัวเลือกการเรียงกล่องแชท
 *
 * [blocker] เทสชุด keyset ด้านล่างคือด่านเดียวที่จับ AC-SORT-07 ได้ (เลื่อนจนสุดรายการแล้ว
 * ไม่มีเธรดหาย/ซ้ำ) — บั๊กคลาสนี้ไม่ทำให้ tsc/build/หน้าจอผิดสังเกต มันแค่ "มีบางห้องหายไป"
 * ซึ่งไม่มีใครพิสูจน์ได้ด้วยตาจากรายการหลายร้อยแถว
 */

type Row = { id: string; isPinned: boolean; lastInboundAt: Date | null; lastMessageAt: Date }

const at = (iso: string) => new Date(iso)

/** ตัวแปล where ของ Prisma เท่าที่ buildCustomerSortCursorWhere ผลิตจริง (OR / null / lt / equals) */
function matches(row: Row, cond: Record<string, unknown>): boolean {
  return Object.entries(cond).every(([key, expected]) => {
    if (key === 'OR') return (expected as Record<string, unknown>[]).some((c) => matches(row, c))
    const actual = (row as unknown as Record<string, unknown>)[key]
    if (expected === null) return actual === null
    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime()
    if (typeof expected === 'object' && expected !== null && 'lt' in expected) {
      const lt = (expected as { lt: Date }).lt
      return actual instanceof Date && actual.getTime() < lt.getTime()
    }
    return actual === expected
  })
}

/** ลำดับที่ buildInboxOrderBy สั่ง: [isPinned desc, lastInboundAt desc nulls last, lastMessageAt desc] */
function sortRows(rows: Row[], mode: InboxSortMode): Row[] {
  return [...rows].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    if (mode === 'LAST_CUSTOMER_MESSAGE') {
      const av = a.lastInboundAt?.getTime() ?? null
      const bv = b.lastInboundAt?.getTime() ?? null
      if (av === null && bv !== null) return 1 // nulls last
      if (av !== null && bv === null) return -1
      if (av !== null && bv !== null && av !== bv) return bv - av
    }
    return b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
  })
}

/** จำลองการเลื่อนดูทีละหน้าแบบที่ listConversations ทำจริง (where + orderBy + take) */
function paginate(rows: Row[], mode: InboxSortMode, take: number, pinnedFirst = true): string[] {
  const seen: string[] = []
  let cursor: string | null = null
  for (let guard = 0; guard < 50; guard++) {
    const cond = cursor ? buildCustomerSortCursorWhere(decodeInboxCursor(cursor, mode)!, pinnedFirst) : {}
    const page = sortRows(rows.filter((r) => matches(r, cond)), mode).slice(0, take)
    if (page.length === 0) break
    seen.push(...page.map((r) => r.id))
    if (page.length < take) break
    cursor = encodeInboxCursor(page[page.length - 1]!, mode, pinnedFirst)
  }
  return seen
}

describe('parseInboxSortMode — fail-closed', () => {
  it('ค่าที่รู้จักผ่านทั้งสองตัว', () => {
    expect(parseInboxSortMode('LAST_MESSAGE')).toBe('LAST_MESSAGE')
    expect(parseInboxSortMode('LAST_CUSTOMER_MESSAGE')).toBe('LAST_CUSTOMER_MESSAGE')
  })

  it('[blocker] ค่าที่ไม่รู้จัก/ว่าง/ผิดชนิด ตกไปที่โหมดเดิม ไม่ throw (D-SORT-2)', () => {
    for (const bad of ['', 'lastMessage', 'OLDEST_FIRST', null, undefined, 42, {}]) {
      expect(parseInboxSortMode(bad)).toBe(DEFAULT_INBOX_SORT)
    }
    expect(DEFAULT_INBOX_SORT).toBe('LAST_MESSAGE')
  })
})

describe('buildInboxOrderBy', () => {
  it('โหมดเดิมเรียงเหมือนเดิมเป๊ะ — [isPinned desc, lastMessageAt desc]', () => {
    expect(buildInboxOrderBy('LAST_MESSAGE', true)).toEqual([{ isPinned: 'desc' }, { lastMessageAt: 'desc' }])
    expect(buildInboxOrderBy('LAST_MESSAGE', false)).toEqual([{ lastMessageAt: 'desc' }])
  })

  it('[blocker] โหมดลูกค้าต้อง nulls:last และต้องมี lastMessageAt เป็นคีย์ตัดเสมอ', () => {
    expect(buildInboxOrderBy('LAST_CUSTOMER_MESSAGE', true)).toEqual([
      { isPinned: 'desc' },
      { lastInboundAt: { sort: 'desc', nulls: 'last' } },
      { lastMessageAt: 'desc' },
    ])
  })
})

describe('cursor v2', () => {
  const row: Row = {
    id: 'a',
    isPinned: true,
    lastInboundAt: at('2026-09-01T10:00:00.000Z'),
    lastMessageAt: at('2026-09-02T10:00:00.000Z'),
  }

  it('เข้ารหัส/ถอดรหัสกลับได้ครบทั้ง 3 ส่วน', () => {
    const c = encodeInboxCursor(row, 'LAST_CUSTOMER_MESSAGE', true)
    expect(decodeInboxCursor(c, 'LAST_CUSTOMER_MESSAGE')).toEqual({
      pinned: true,
      lastInboundAt: at('2026-09-01T10:00:00.000Z'),
      lastMessageAt: at('2026-09-02T10:00:00.000Z'),
    })
  })

  it('lastInboundAt = null เข้ารหัสเป็น "-" แล้วถอดกลับเป็น null', () => {
    const c = encodeInboxCursor({ ...row, lastInboundAt: null }, 'LAST_CUSTOMER_MESSAGE', true)
    expect(c.split('|')[3]).toBe('-')
    expect(decodeInboxCursor(c, 'LAST_CUSTOMER_MESSAGE')?.lastInboundAt).toBeNull()
  })

  it('[blocker] cursor ของอีกโหมดต้องถูกปฏิเสธ (ผู้ใช้สลับโหมดกลางการเลื่อน)', () => {
    const c = encodeInboxCursor(row, 'LAST_CUSTOMER_MESSAGE', true)
    expect(decodeInboxCursor(c, 'LAST_MESSAGE')).toBeNull()
  })

  it('cursor รูปแบบเก่า (ISO ล้วน / "1|ISO") ต้องคืน null ให้ผู้เรียกถอยไปเส้นทางเดิม', () => {
    expect(decodeInboxCursor('2026-09-01T10:00:00.000Z', 'LAST_MESSAGE')).toBeNull()
    expect(decodeInboxCursor('1|2026-09-01T10:00:00.000Z', 'LAST_MESSAGE')).toBeNull()
  })

  it('วันที่เสียหายใน cursor คืน null ไม่ใช่ Invalid Date', () => {
    expect(decodeInboxCursor('v2|LAST_CUSTOMER_MESSAGE|0|-|ไม่ใช่วันที่', 'LAST_CUSTOMER_MESSAGE')).toBeNull()
    expect(decodeInboxCursor('v2|LAST_CUSTOMER_MESSAGE|0|เละ|2026-09-01T10:00:00.000Z', 'LAST_CUSTOMER_MESSAGE')).toBeNull()
  })
})

describe('[blocker] keyset ของโหมดลูกค้า — เลื่อนจนสุดแล้วต้องครบและไม่ซ้ำ (AC-SORT-07)', () => {
  /**
   * ชุดข้อมูลจงใจมีทุกอย่างที่ทำให้ keyset พัง:
   *  - เธรดปักหมุดคาบเกี่ยวขอบหน้า (n1/n2 ปักหมุด + มี null ปักหมุดด้วย)
   *  - lastInboundAt เสมอกันเป๊ะ 2 คู่ (t3/t4) → ต้องมี lastMessageAt เป็นตัวตัด
   *  - กลุ่ม lastInboundAt = NULL หลายแถว (พรมแดน null ที่ `lt` ไม่มีวันเป็นจริง)
   * 🛑 ห้ามลบแถวใดแถวหนึ่งทิ้งเพราะ "ซ้ำกับเคสอื่น" — แต่ละแถวมีหน้าที่ของตัวเอง
   * (docs/conventions/mutation-silence-means-weak-corpus.md)
   */
  const rows: Row[] = [
    { id: 'p-null', isPinned: true, lastInboundAt: null, lastMessageAt: at('2026-09-08T09:00:00.000Z') },
    { id: 'p1', isPinned: true, lastInboundAt: at('2026-09-05T10:00:00.000Z'), lastMessageAt: at('2026-09-05T11:00:00.000Z') },
    { id: 'p2', isPinned: true, lastInboundAt: at('2026-09-04T10:00:00.000Z'), lastMessageAt: at('2026-09-06T11:00:00.000Z') },
    { id: 't1', isPinned: false, lastInboundAt: at('2026-09-07T10:00:00.000Z'), lastMessageAt: at('2026-09-07T12:00:00.000Z') },
    { id: 't2', isPinned: false, lastInboundAt: at('2026-09-06T10:00:00.000Z'), lastMessageAt: at('2026-09-06T10:00:00.000Z') },
    { id: 't3', isPinned: false, lastInboundAt: at('2026-09-03T10:00:00.000Z'), lastMessageAt: at('2026-09-09T10:00:00.000Z') },
    { id: 't4', isPinned: false, lastInboundAt: at('2026-09-03T10:00:00.000Z'), lastMessageAt: at('2026-09-03T10:00:00.000Z') },
    { id: 't5', isPinned: false, lastInboundAt: at('2026-09-01T10:00:00.000Z'), lastMessageAt: at('2026-09-01T10:00:00.000Z') },
    { id: 'n1', isPinned: false, lastInboundAt: null, lastMessageAt: at('2026-09-09T20:00:00.000Z') },
    { id: 'n2', isPinned: false, lastInboundAt: null, lastMessageAt: at('2026-09-02T20:00:00.000Z') },
    { id: 'n3', isPinned: false, lastInboundAt: null, lastMessageAt: at('2026-08-30T20:00:00.000Z') },
  ]

  const expected = sortRows(rows, 'LAST_CUSTOMER_MESSAGE').map((r) => r.id)

  it('ลำดับที่คาดหวัง: ปักหมุดก่อน → ลูกค้าพิมพ์ล่าสุดก่อน → ลูกค้าไม่เคยพิมพ์ท้ายสุด', () => {
    expect(expected).toEqual(['p1', 'p2', 'p-null', 't1', 't2', 't3', 't4', 't5', 'n1', 'n2', 'n3'])
  })

  it.each([1, 2, 3, 4, 5, 10])('take=%i → ได้ครบทุกเธรด เรียงถูก ไม่ซ้ำ', (take) => {
    const seen = paginate(rows, 'LAST_CUSTOMER_MESSAGE', take)
    expect(seen).toEqual(expected)
    expect(new Set(seen).size).toBe(rows.length)
  })

  it('เธรดที่ร้านเพิ่งทักไปแต่ลูกค้ายังไม่ตอบ ไม่เด้งขึ้นบนสุด (AC-SORT-05)', () => {
    // n1 มี lastMessageAt ใหม่ที่สุดในกอง (ร้านเพิ่งพิมพ์) แต่ลูกค้าไม่เคยพิมพ์ → ต้องอยู่ท้าย
    expect(expected.indexOf('n1')).toBeGreaterThan(expected.indexOf('t5'))
    // ในโหมดเดิม n1 ต้องอยู่บนสุดของกลุ่มไม่ปักหมุด — พิสูจน์ว่าสองโหมดให้คนละลำดับจริง
    const byMessage = sortRows(rows, 'LAST_MESSAGE').map((r) => r.id)
    expect(byMessage.filter((id) => !id.startsWith('p'))[0]).toBe('n1')
  })
})
