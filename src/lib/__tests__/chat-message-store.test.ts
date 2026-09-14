import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_THREADS,
  readThread,
  MAX_MESSAGES_PER_THREAD,
  resetThreadStoreForTest,
  saveThreadView,
  watermarksOf,
  writeThread,
} from '@/lib/chat-message-store'
import { firstPageReplacement } from '@/lib/chat-message-merge'
import { deltaAfterUpdatedAt } from '@/lib/chat-delta-query'
import type { ChatMessageView } from '@/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread'

const item = (id: string, over: Partial<ChatMessageView> = {}): ChatMessageView =>
  ({
    id,
    conversationId: 'c1',
    senderUserId: null,
    senderRole: 'BUYER',
    type: 'TEXT',
    body: id,
    imageUrl: null,
    createdAt: '2026-09-14T09:00:00.000Z',
    seq: 1,
    ...over,
  }) as ChatMessageView

describe('[blocker] chat-message-store', () => {
  beforeEach(() => resetThreadStoreForTest())

  it('อ่านห้องที่ไม่เคยเขียนได้ null', () => {
    expect(readThread('nope')).toBeNull()
  })

  it('เขียนแล้วอ่านกลับได้ พร้อม watermark', () => {
    writeThread('c1', { items: [item('a')], lastSeq: 5, lastUpdatedAt: '2026-09-14T09:00:00.000Z' })
    const got = readThread('c1')
    expect(got?.items.map((m) => m.id)).toEqual(['a'])
    expect(got?.lastSeq).toBe(5)
  })

  it(`เก็บได้ไม่เกิน ${MAX_THREADS} ห้อง — ห้องที่ถูกแตะนานสุดหลุดก่อน`, () => {
    for (let i = 0; i < MAX_THREADS + 1; i++) {
      writeThread(`c${i}`, { items: [item('a')], lastSeq: 1, lastUpdatedAt: '2026-09-14T09:00:00.000Z' })
    }
    expect(readThread('c0')).toBeNull()
    expect(readThread(`c${MAX_THREADS}`)).not.toBeNull()
  })

  it('การอ่านนับเป็นการแตะ — ห้องที่เพิ่งอ่านต้องไม่ใช่ตัวที่ถูกไล่ออก', () => {
    for (let i = 0; i < MAX_THREADS; i++) {
      writeThread(`c${i}`, { items: [item('a')], lastSeq: 1, lastUpdatedAt: '2026-09-14T09:00:00.000Z' })
    }
    readThread('c0') // แตะห้องเก่าสุด
    writeThread('newcomer', { items: [item('a')], lastSeq: 1, lastUpdatedAt: '2026-09-14T09:00:00.000Z' })
    expect(readThread('c0')).not.toBeNull()
    expect(readThread('c1')).toBeNull()
  })
})

describe('[blocker] watermarksOf', () => {
  it('แถวเก่า (updatedAt=1970 fast default) ต้องไม่ลาก watermark ย้อนกลับ — ใช้ createdAt แทน (R6)', () => {
    const out = watermarksOf([
      item('a', { createdAt: '2026-09-14T09:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z', seq: 7 }),
    ])
    expect(out).toEqual({ lastSeq: 7, lastUpdatedAt: '2026-09-14T09:00:00.000Z' })
  })

  it('แถวที่ updatedAt ใหม่กว่า createdAt จริง (แก้ไข/ลบ) ต้องใช้ updatedAt', () => {
    const out = watermarksOf([
      item('a', { createdAt: '2026-09-14T09:00:00.000Z', updatedAt: '2026-09-14T10:00:00.000Z', seq: 1 }),
    ])
    expect(out.lastUpdatedAt).toBe('2026-09-14T10:00:00.000Z')
  })

  it('ข้อความ optimistic ที่ไม่มี seq ไม่นับเข้า lastSeq แต่นับ createdAt ของมันด้วย', () => {
    const out = watermarksOf([
      item('local-1', { createdAt: '2026-09-14T11:00:00.000Z', seq: undefined, updatedAt: undefined }),
    ])
    expect(out.lastSeq).toBe(0)
    expect(out.lastUpdatedAt).toBe('2026-09-14T11:00:00.000Z')
  })
})

describe('[blocker] saveThreadView — ภาพที่ hook เขียนลง store', () => {
  beforeEach(() => resetThreadStoreForTest())
  const at = (min: number) => new Date(Date.UTC(2026, 8, 14, 0, min)).toISOString()

  it('ข้อความ optimistic (local-*) ห้ามลง store และห้ามลาก watermark', () => {
    // เปิดห้องจาก cache ทีหลัง hook ที่เคยถือบับเบิลนั้นถูก unmount ไปแล้ว ไม่มีใครเปลี่ยน
    // 'sending' ให้จบ ⇒ บับเบิลค้างคู่กับแถวจริงที่ delta พามา = ข้อความเดียวขึ้นสองใบ
    const rows = [
      item('a', { seq: 3, createdAt: '2026-09-14T09:00:00.000Z' }),
      item('local-0-1', { seq: undefined, createdAt: '2026-09-14T23:00:00.000Z', _status: 'sending' }),
    ]
    saveThreadView('c1', rows, null, { fetched: rows, replace: true })
    const got = readThread('c1')
    expect(got?.items.map((m) => m.id)).toEqual(['a'])
    expect(got?.lastUpdatedAt).toBe('2026-09-14T09:00:00.000Z')
  })

  it('ถูกตัดเหลือ MAX ใบ ⇒ cursor ต้องชี้ที่ใบเก่าสุดที่ยังเก็บไว้ ไม่ใช่ cursor เดิม', () => {
    // cursor เดิมชี้ก่อนใบแรกสุดที่เคยโหลด — ถ้าคงไว้หลังตัดใบเก่าทิ้ง loadOlder รอบถัดไป
    // จะข้ามช่วงที่ถูกตัดไปทั้งช่วง (ข้อความหายกลางเธรดโดยไม่มีอะไรฟ้อง)
    const items = Array.from({ length: MAX_MESSAGES_PER_THREAD + 5 }, (_, i) => item(`m${i}`, { seq: i + 1, createdAt: at(i) }))
    saveThreadView('c1', items, 'cursor-before-m0', { fetched: items, replace: true })
    const got = readThread('c1')!
    expect(got.items).toHaveLength(MAX_MESSAGES_PER_THREAD)
    expect(got.items[0]!.id).toBe('m5')
    expect(got.oldestCursor).toBe(`${items[5]!.createdAt}|6`)
  })

  it('cursor ประกอบจากแถวที่มี seq เท่านั้น — รูปแบบที่ไม่มี seq getMessages ไม่เคยสร้าง', () => {
    const items = Array.from({ length: MAX_MESSAGES_PER_THREAD + 2 }, (_, i) =>
      item(`m${i}`, { seq: i === 2 ? undefined : i + 1, createdAt: at(i) }),
    )
    saveThreadView('c1', items, 'x', { fetched: items, replace: true })
    expect(readThread('c1')!.oldestCursor).toBe(`${items[3]!.createdAt}|4`)
  })

  it('ไม่ถูกตัด ⇒ ใช้ cursor ที่ส่งมาตรง ๆ (null = ไม่มีของเก่ากว่าแล้ว)', () => {
    saveThreadView('c1', [item('a')], null, { fetched: [item('a')] })
    expect(readThread('c1')?.oldestCursor).toBeNull()
    saveThreadView('c1', [item('a')], 'x|1', { fetched: [item('a')] })
    expect(readThread('c1')?.oldestCursor).toBe('x|1')
  })
})

describe('[blocker] saveThreadView — watermark ไม่ถอยหลังและมาจาก response เท่านั้น (R8)', () => {
  beforeEach(() => resetThreadStoreForTest())
  const t0 = '2026-09-14T09:00:00.000Z'
  const t9 = '2026-09-14T18:00:00.000Z'

  it('loadOlder / ตัดรายการ / ยกเลิกข้อความ (ไม่มี fetched) ห้ามขยับ watermark', () => {
    const fresh = [item('n', { seq: 50, createdAt: t9 })]
    saveThreadView('c1', fresh, 'cur', { fetched: fresh, replace: true })
    // แถวของเก่าที่ถูกแก้ไม่นานมานี้ (updatedAt ใหม่กว่า watermark) — ต้องไม่ลาก lastUpdatedAt
    const older = [item('o', { seq: 2, createdAt: t0, updatedAt: '2026-09-14T20:00:00.000Z' }), ...fresh]
    saveThreadView('c1', older, 'cur-older')
    const got = readThread('c1')!
    expect(got.lastSeq).toBe(50)
    expect(got.lastUpdatedAt).toBe(t9)
  })

  it('รายการที่ถือน้อยกว่าเดิม (ถูกตัด) ห้ามทำ watermark ถอยหลัง', () => {
    const fresh = [item('n', { seq: 50, createdAt: t9 })]
    saveThreadView('c1', fresh, null, { fetched: fresh, replace: true })
    saveThreadView('c1', [item('a', { seq: 1, createdAt: t0 })], null)
    expect(readThread('c1')!.lastSeq).toBe(50)
  })

  it('delta ที่มีแถวใหม่ยกขึ้น · delta ที่เก่ากว่าไม่ดึงลง', () => {
    const first = [item('a', { seq: 5, createdAt: t0 })]
    saveThreadView('c1', first, null, { fetched: first, replace: true })
    const delta = [item('b', { seq: 9, createdAt: t9 })]
    saveThreadView('c1', [...first, ...delta], null, { fetched: delta })
    expect(readThread('c1')!.lastSeq).toBe(9)
    saveThreadView('c1', [...first, ...delta], null, { fetched: first })
    expect(readThread('c1')!.lastSeq).toBe(9)
  })

  it('replace เริ่ม watermark ใหม่จากหน้าที่เพิ่งโหลด', () => {
    const big = [item('n', { seq: 500, createdAt: t9 })]
    saveThreadView('c1', big, null, { fetched: big, replace: true })
    const page = [item('p', { seq: 9, createdAt: t0 })]
    saveThreadView('c1', page, null, { fetched: page, replace: true })
    expect(readThread('c1')!.lastSeq).toBe(9)
  })

  it('ไม่มี store และไม่มี fetched = ไม่เขียน', () => {
    saveThreadView('c1', [item('a')], null)
    expect(readThread('c1')).toBeNull()
  })
})

describe('[blocker] แทนที่จอด้วยหน้าแรกหลัง delta เต็มเพดาน — watermark ต้องครอบแถว delta (R28)', () => {
  beforeEach(() => resetThreadStoreForTest())

  /** เงื่อนไขเดียวกับ buildDeltaWhere (ฝั่ง SQL) เขียนเป็นฟังก์ชันบนแถว — เทสเท่านั้น */
  const matchesDelta = (row: ChatMessageView, w: { afterSeq: number; afterUpdatedAt: string }) =>
    (row.seq ?? 0) > w.afterSeq || new Date(row.updatedAt ?? row.createdAt) > new Date(w.afterUpdatedAt)

  it('แถว backfill (seq สูง · createdAt เก่า · updatedAt = ตอน insert) ต้องไม่เข้าเงื่อนไข delta อีกหลังแทนที่', () => {
    // หน้าแรก 30 ใบ = ข้อความล่าสุดจริง — แถว backfill เก่ากว่าหน้าแรกทั้งหมด จึงไม่อยู่ในหน้านั้น
    const page = Array.from({ length: 30 }, (_, i) =>
      item(`p${i}`, { seq: 1000 + i, createdAt: `2026-09-14T08:${String(i).padStart(2, '0')}:00.000Z` }),
    ).reverse()
    const backfill = Array.from({ length: 100 }, (_, i) =>
      item(`bf${i}`, {
        seq: 5000 + i,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-09-14T09:30:00.000Z',
      }),
    )
    const { items, fetched } = firstPageReplacement({ screen: [], pageDesc: page, triggeredBy: backfill })
    saveThreadView('c1', items, 'cursor', { fetched, replace: true })
    const got = readThread('c1')!
    const w = { afterSeq: got.lastSeq, afterUpdatedAt: got.lastUpdatedAt }
    expect(backfill.filter((r) => matchesDelta(r, w))).toEqual([])
    // จอยังแสดงแค่หน้าแรก — ของเก่ากว่ามาจาก loadOlder
    expect(got.items.map((m) => m.id)).toEqual(items.map((m) => m.id))
    expect(got.items.some((m) => m.id.startsWith('bf'))).toBe(false)
  })

  it('ระยะเผื่อ R31 ถอยเฉพาะ updatedAt 5 วิ — แถวที่ commit ช้า (updatedAt ≤ watermark) ยังถูกขอกลับมา', () => {
    const w = '2026-09-14T09:30:00.000Z'
    const late = item('late', { seq: 1, createdAt: '2026-09-14T09:29:58.000Z', updatedAt: '2026-09-14T09:29:58.000Z' })
    expect(matchesDelta(late, { afterSeq: 99, afterUpdatedAt: w })).toBe(false)
    expect(matchesDelta(late, { afterSeq: 99, afterUpdatedAt: deltaAfterUpdatedAt(w) })).toBe(true)
  })
})
