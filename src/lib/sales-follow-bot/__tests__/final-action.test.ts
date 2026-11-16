// 00095-ext BR-FA-2/3/4/5/6 — ตัวตัดสิน action ท้ายสุด (pure) · ทุกด่านมีเคสแดงเมื่อถอดด่าน
import { describe, expect, it } from 'vitest'
import { MESSAGE_LOOKBACK_MS, MIN_MS } from '../constants'
import { buildFinalActionNote, decideFinalAction, finalDueAt, type FinalActionFacts } from '../final-action'

const NOW = new Date('2026-11-16T12:00:00Z')
const at = (minAgo: number) => new Date(NOW.getTime() - minAgo * MIN_MS)

/** ฐาน: ส่งรอบสุดท้ายเมื่อ 5 ชม. ก่อน · รอ 4 ชม. · สแปม · ห้องปกติ ไม่มีใครตอบ → ต้อง ACT */
const base = (o: { [K in keyof FinalActionFacts]?: Partial<FinalActionFacts[K]> | FinalActionFacts[K] } = {}): FinalActionFacts => ({
  now: NOW,
  run: { status: 'DONE', lastSentAt: at(300), finalActionAt: null, ...(o.run as object) },
  bot: o.bot === null ? null : { status: 'ACTIVE', deletedAt: null, finalAction: 'SPAM', finalDelayMin: 240, testRoomIds: [], ...(o.bot as object) },
  room: { id: 'room-1', isSpam: false, isHidden: false, resolvedAt: null, ...(o.room as object) },
  latestBuyerAt: o.latestBuyerAt === undefined ? at(400) : (o.latestBuyerAt as Date | null),
  latestShopReplyAt: o.latestShopReplyAt === undefined ? at(310) : (o.latestShopReplyAt as Date | null),
})
const skip = (reason: string) => ({ action: 'SKIP', reason })

describe('decideFinalAction', () => {
  it('ครบเงื่อนไข → ทำ action ตามที่บอทตั้ง', () => {
    expect(decideFinalAction(base())).toEqual({ action: 'ACT', kind: 'SPAM' })
    for (const kind of ['RESOLVE', 'HIDE'] as const) expect(decideFinalAction(base({ bot: { finalAction: kind } }))).toEqual({ action: 'ACT', kind })
  })

  describe('เวลารอ (BR-FA-2/6)', () => {
    it('นับจากรอบสุดท้ายที่ส่งจริง: ยังไม่ครบ = WAIT · ครบพอดี = ACT (>=)', () => {
      expect(decideFinalAction(base({ run: { lastSentAt: at(239) } }))).toEqual({ action: 'WAIT' })
      expect(decideFinalAction(base({ run: { lastSentAt: at(240) } }))).toEqual({ action: 'ACT', kind: 'SPAM' })
    })
    it('รอ 0 นาที = ทำได้ทันที', () => {
      expect(decideFinalAction(base({ bot: { finalDelayMin: 0 }, run: { lastSentAt: NOW } }))).toEqual({ action: 'ACT', kind: 'SPAM' })
    })
    it('ใช้ค่าล่าสุดของบอท: ขยายเวลารอทีหลังทำให้ WAIT ใหม่', () => {
      expect(decideFinalAction(base({ bot: { finalDelayMin: 10_080 } }))).toEqual({ action: 'WAIT' })
    })
    it('finalDueAt คำนวณถูก', () => {
      expect(finalDueAt(at(0), 90).getTime()).toBe(NOW.getTime() + 90 * MIN_MS)
    })
    it('ไม่มีรอบที่ส่งจริงให้นับ → SKIP · เกินขอบอ่านข้อความ 30 วัน → SKIP', () => {
      expect(decideFinalAction(base({ run: { lastSentAt: null } }))).toEqual(skip('NO_LAST_SEND'))
      expect(decideFinalAction(base({ run: { lastSentAt: new Date(NOW.getTime() - MESSAGE_LOOKBACK_MS - 1) } }))).toEqual(skip('TOO_OLD'))
    })
  })

  describe('ตรวจซ้ำก่อนทำ (BR-FA-3)', () => {
    it('ลูกค้าตอบหลังรอบสุดท้าย → SKIP · ก่อนรอบสุดท้าย → ไม่กระทบ', () => {
      expect(decideFinalAction(base({ latestBuyerAt: at(299) }))).toEqual(skip('CUSTOMER_REPLIED'))
      expect(decideFinalAction(base({ latestBuyerAt: at(301) }))).toEqual({ action: 'ACT', kind: 'SPAM' })
    })
    it('ร้าน/แอดมินตอบหลังรอบสุดท้าย → SKIP', () => {
      expect(decideFinalAction(base({ latestShopReplyAt: at(100) }))).toEqual(skip('SHOP_REPLIED'))
    })
    it.each([
      ['สแปมแล้ว', { isSpam: true }],
      ['ซ่อนแล้ว', { isHidden: true }],
      ['ปิดงานแล้ว', { resolvedAt: at(60) }],
    ])('ห้อง%s → SKIP (ไม่ทำซ้ำ/ไม่ทับการตัดสินของคน)', (_n, room) => {
      expect(decideFinalAction(base({ room }))).toEqual(skip('ROOM_ALREADY_HANDLED'))
    })
    it('บอทถูกลบ/ปิด/หาไม่เจอ → SKIP', () => {
      expect(decideFinalAction(base({ bot: { deletedAt: at(10) } }))).toEqual(skip('BOT_INACTIVE'))
      expect(decideFinalAction(base({ bot: { status: 'CLOSED' } }))).toEqual(skip('BOT_INACTIVE'))
      expect(decideFinalAction(base({ bot: null }))).toEqual(skip('BOT_INACTIVE'))
    })
  })

  describe('ครั้งเดียวต่อ run (BR-FA-4)', () => {
    it('ทำไปแล้ว (finalActionAt มีค่า) → SKIP ไม่ทำซ้ำ', () => {
      expect(decideFinalAction(base({ run: { finalActionAt: at(1) } }))).toEqual(skip('ALREADY_HANDLED'))
    })
    it('run ที่ยังไม่ครบ/ถูกหยุด ไม่เข้าเงื่อนไข', () => {
      expect(decideFinalAction(base({ run: { status: 'ACTIVE' } }))).toEqual(skip('RUN_NOT_DONE'))
      expect(decideFinalAction(base({ run: { status: 'STOPPED' } }))).toEqual(skip('RUN_NOT_DONE'))
    })
  })

  describe('บอทเลือก "ไม่ทำอะไร"', () => {
    it('NONE → WAIT (ไม่ปิดแถว เผื่อแก้ค่าภายหลัง)', () => {
      expect(decideFinalAction(base({ bot: { finalAction: 'NONE' } }))).toEqual({ action: 'WAIT' })
    })
  })

  describe('บอททดสอบ (BR-FA-5)', () => {
    it('TESTING: ห้องทดสอบ = ทำ · ห้องอื่น = SKIP', () => {
      expect(decideFinalAction(base({ bot: { status: 'TESTING', testRoomIds: ['room-1'] } }))).toEqual({ action: 'ACT', kind: 'SPAM' })
      expect(decideFinalAction(base({ bot: { status: 'TESTING', testRoomIds: ['other'] } }))).toEqual(skip('TEST_ROOM_ONLY'))
    })
  })
})

describe('buildFinalActionNote', () => {
  it.each([
    ['SPAM', 'บอทตามครบ 5 รอบ ลูกค้าไม่ตอบ — ย้ายไปสแปม'],
    ['HIDE', 'บอทตามครบ 5 รอบ ลูกค้าไม่ตอบ — ซ่อน'],
    ['RESOLVE', 'บอทตามครบ 5 รอบ ลูกค้าไม่ตอบ — ปิดงาน'],
  ] as const)('%s', (k, text) => expect(buildFinalActionNote(5, k)).toBe(text))
})
