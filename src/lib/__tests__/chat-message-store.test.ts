import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_THREADS,
  markThreadStale,
  readThread,
  MAX_MESSAGES_PER_THREAD,
  resetThreadStoreForTest,
  saveThreadView,
  watermarksOf,
  writeThread,
} from '@/lib/chat-message-store'
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

  it('markThreadStale ไม่ลบข้อมูล แค่ปักธง', () => {
    writeThread('c1', { items: [item('a')], lastSeq: 5, lastUpdatedAt: '2026-09-14T09:00:00.000Z' })
    markThreadStale('c1')
    expect(readThread('c1')?.stale).toBe(true)
    expect(readThread('c1')?.items).toHaveLength(1)
  })

  it('markThreadStale กับห้องที่ไม่มี cache ต้องไม่สร้างแถวเปล่า', () => {
    markThreadStale('ghost')
    expect(readThread('ghost')).toBeNull()
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

  it('ข้อความ optimistic (local-*) ห้ามลง store และห้ามลาก watermark', () => {
    // เปิดห้องจาก cache ทีหลัง hook ที่เคยถือบับเบิลนั้นถูก unmount ไปแล้ว ไม่มีใครเปลี่ยน
    // 'sending' ให้จบ ⇒ บับเบิลค้างคู่กับแถวจริงที่ delta พามา = ข้อความเดียวขึ้นสองใบ
    // และ createdAt ของบับเบิลเป็นนาฬิกาเครื่อง client ถ้านับเข้า watermark จะข้ามการแก้ฝั่ง server
    saveThreadView('c1', [
      item('a', { seq: 3, createdAt: '2026-09-14T09:00:00.000Z' }),
      item('local-0-1', { seq: undefined, createdAt: '2026-09-14T23:00:00.000Z', _status: 'sending' }),
    ], null)
    const got = readThread('c1')
    expect(got?.items.map((m) => m.id)).toEqual(['a'])
    expect(got?.lastUpdatedAt).toBe('2026-09-14T09:00:00.000Z')
  })

  it('ถูกตัดเหลือ MAX ใบ ⇒ cursor ต้องชี้ที่ใบเก่าสุดที่ยังเก็บไว้ ไม่ใช่ cursor เดิม', () => {
    // cursor เดิมชี้ก่อนใบแรกสุดที่เคยโหลด — ถ้าคงไว้หลังตัดใบเก่าทิ้ง loadOlder รอบถัดไป
    // จะข้ามช่วงที่ถูกตัดไปทั้งช่วง (ข้อความหายกลางเธรดโดยไม่มีอะไรฟ้อง)
    const items = Array.from({ length: MAX_MESSAGES_PER_THREAD + 5 }, (_, i) =>
      item(`m${i}`, { seq: i + 1, createdAt: new Date(Date.UTC(2026, 8, 14, 0, i)).toISOString() }),
    )
    saveThreadView('c1', items, 'cursor-before-m0')
    const got = readThread('c1')!
    expect(got.items).toHaveLength(MAX_MESSAGES_PER_THREAD)
    expect(got.items[0]!.id).toBe('m5')
    expect(got.oldestCursor).toBe(`${items[5]!.createdAt}|6`)
  })

  it('ไม่ถูกตัด ⇒ ใช้ cursor ที่ส่งมาตรง ๆ (null = ไม่มีของเก่ากว่าแล้ว)', () => {
    saveThreadView('c1', [item('a')], null)
    expect(readThread('c1')?.oldestCursor).toBeNull()
    saveThreadView('c1', [item('a')], 'x|1')
    expect(readThread('c1')?.oldestCursor).toBe('x|1')
  })
})
