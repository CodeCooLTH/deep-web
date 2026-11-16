// 00095 TC-040..051, 055..060(pure), 095..100, 105 — decideRun · eligibleToAttach · dueAt · mapFollowFailure
import { describe, expect, it } from 'vitest'
import { UNCERTAIN_SEND_REASON } from '../../chat-send-queue'
import { AD_WINDOW_MS, MESSAGING_WINDOW_MS } from '../../messaging-window'
import { META_AI_HOLD_MS, META_PAGE_INBOX_APP_ID } from '../../meta-ai-holder'
import { tagNameKey } from '../../shop-tag-match'
import { MIN_MS } from '../constants'
import {
  computeDueAt,
  decideRun,
  eligibleToAttach,
  mapFollowFailure,
  type AttachFacts,
  type Decision,
  type DecideFacts,
} from '../decide'

const T0 = new Date('2026-11-20T03:00:00.000Z')
const H = 60 * MIN_MS
const at = (ms: number) => new Date(T0.getTime() + ms)
const pos = (ms: number, seq = 1) => ({ createdAt: at(ms), seq })

// ฐาน: ผ่านทุกด่าน → SEND ขั้นแรก (ร้านตอบเมื่อ 1 ชม. ก่อน + delay 30 นาที = เลยกำหนดแล้ว)
function base(): DecideFacts {
  return {
    now: T0,
    run: { stageKey: 'NOT_BOUGHT', stageStamp: at(-3 * H), structureRev: 1, nextStep: 0, lastSentAt: null },
    bot: {
      status: 'ACTIVE',
      structureRev: 1,
      salesStatuses: ['NOT_BOUGHT', 'BILLED'],
      tagKeys: [],
      tagMatch: 'ANY',
      stepDelaysMin: [30, 120, 1440],
      channelIds: ['ch1'],
      testRoomIds: [],
    },
    shopTagKeys: new Set(),
    room: { id: 'room1', shopChannelId: 'ch1', channel: 'MESSENGER', isSpam: false, isHidden: false, lastInboundAt: at(-2 * H), autoReplyEnabled: null },
    contact: { salesStatus: 'UNSPECIFIED', tags: [], isBlocked: false },
    shopChannelStatus: 'ACTIVE',
    adWindowStartAt: null,
    metaAi: null,
    ourMetaAppId: null,
    stage: { key: 'NOT_BOUGHT', stamp: at(-3 * H) },
    latestBuyerMsg: pos(-2 * H),
    latestShopReply: pos(-1 * H),
    lastBotBubble: null,
    sendAllowed: true,
  }
}
const with_ = (f: (x: DecideFacts) => void): DecideFacts => {
  const x = base()
  f(x)
  return x
}

// ลำดับ = ตาราง TFR-FB-11 · ทุกตัวแตะเฉพาะฟิลด์ของตัวเอง (ให้เทสคู่ชนแยกไม่ได้ว่าเหตุไหนชนะนอกจากลำดับ)
const TRIGGERS: { name: string; apply: (x: DecideFacts) => void; want: Decision }[] = [
  { name: 'stage เปลี่ยน', apply: (x) => (x.stage = { key: 'BILLED', stamp: at(-3 * H) }), want: { action: 'STOP', reason: 'STAGE_CHANGED' } },
  { name: 'แท็กไม่ผ่าน', apply: (x) => { x.bot.tagKeys = ['a']; x.shopTagKeys = new Set(['a']) }, want: { action: 'STOP', reason: 'TAG_REMOVED' } },
  { name: 'บอทปิด', apply: (x) => (x.bot.status = 'CLOSED'), want: { action: 'STOP', reason: 'BOT_DISABLED' } },
  { name: 'โครงเปลี่ยน', apply: (x) => (x.bot.structureRev = 2), want: { action: 'STOP', reason: 'BOT_EDITED' } },
  { name: 'ลูกค้าตอบ', apply: (x) => (x.lastBotBubble = pos(-3 * H)), want: { action: 'STOP', reason: 'CUSTOMER_REPLIED' } },
  { name: 'ครบขั้น', apply: (x) => (x.run.nextStep = 3), want: { action: 'DONE' } },
  { name: 'กรอบปิด', apply: (x) => (x.room.lastInboundAt = null), want: { action: 'STOP', reason: 'WINDOW_CLOSED' } },
  { name: 'ไม่สนใจ', apply: (x) => (x.contact.salesStatus = 'NOT_INTERESTED'), want: { action: 'STOP', reason: 'NOT_INTERESTED' } },
  { name: 'ห้องนอกขอบเขต', apply: (x) => (x.room.isSpam = true), want: { action: 'STOP', reason: 'OUT_OF_SCOPE' } },
  { name: 'LINE ถูกบล็อก', apply: (x) => { x.room.channel = 'LINE'; x.contact.isBlocked = true }, want: { action: 'STOP', reason: 'CONTACT_BLOCKED' } },
  { name: 'ร้านไม่นำร่อง', apply: (x) => (x.sendAllowed = false), want: { action: 'HOLD', reason: 'SHOP_NOT_ENABLED' } },
  { name: 'Meta AI ถือ', apply: (x) => (x.metaAi = metaAiHolding()), want: { action: 'HOLD', reason: 'META_AI_HOLDING' } },
  { name: 'ปิดตอบอัตโนมัติ', apply: (x) => (x.room.autoReplyEnabled = false), want: { action: 'HOLD', reason: 'AUTO_REPLY_OFF' } },
  { name: 'ช่องไม่ ACTIVE', apply: (x) => (x.shopChannelStatus = 'DISCONNECTED'), want: { action: 'HOLD', reason: 'CHANNEL_NOT_ACTIVE' } },
  { name: 'ร้านค้างตอบ', apply: (x) => (x.latestBuyerMsg = pos(-10 * MIN_MS)), want: { action: 'WAIT', dueAt: null } },
  { name: 'ยังไม่ถึงกำหนด', apply: (x) => (x.run.lastSentAt = T0), want: { action: 'WAIT', dueAt: at(30 * MIN_MS) } },
]

function metaAiHolding(): NonNullable<DecideFacts['metaAi']> {
  return {
    metaForeignEchoAt: at(-MIN_MS),
    metaForeignEchoAppId: META_PAGE_INBOX_APP_ID,
    metaForeignEchoAi: true,
    metaForeignEchoAdminText: false,
    lastMessageAt: at(-MIN_MS),
    lastSenderRole: 'SHOP',
    metaOwnerAppId: null,
    metaOwnerObservedAt: null,
  }
}

describe('TC-040 ตารางลำดับ 1..16 อย่างละเคสบริสุทธิ์', () => {
  it('ฐาน = SEND ขั้น 0', () => {
    expect(decideRun(base())).toEqual({ action: 'SEND', step: 0 })
  })
  it.each(TRIGGERS)('$name', ({ apply, want }) => {
    expect(decideRun(with_(apply))).toEqual(want)
  })

  // เสริมเคสย่อยของแต่ละข้อ
  it('ข้อ 1: stamp ต่าง · stage ไม่อยู่ในรายการบอท', () => {
    expect(decideRun(with_((x) => (x.stage = { key: 'NOT_BOUGHT', stamp: at(-2 * H) })))).toEqual({ action: 'STOP', reason: 'STAGE_CHANGED' })
    expect(
      decideRun(with_((x) => { x.run.stageKey = 'SHIPPED'; x.stage = { key: 'SHIPPED', stamp: at(-3 * H) } })),
    ).toEqual({ action: 'STOP', reason: 'STAGE_CHANGED' })
  })
  it('ข้อ 2: ALL ขาดหนึ่ง · ไม่เหลือเงื่อนไข · แท็กหายหมด', () => {
    const tags = (x: DecideFacts, o: { keys: string[]; shop: string[]; have: string[]; match: 'ANY' | 'ALL'; statuses?: string[] }) => {
      x.bot.tagKeys = o.keys
      x.shopTagKeys = new Set(o.shop)
      x.contact.tags = o.have
      x.bot.tagMatch = o.match
      if (o.statuses) x.bot.salesStatuses = o.statuses as never
    }
    expect(decideRun(with_((x) => tags(x, { keys: ['a', 'b'], shop: ['a', 'b'], have: ['a'], match: 'ALL' })))).toEqual({ action: 'STOP', reason: 'TAG_REMOVED' })
    expect(decideRun(with_((x) => tags(x, { keys: ['a', 'b'], shop: ['a', 'b'], have: ['a', 'b'], match: 'ALL' })))).toEqual({ action: 'SEND', step: 0 })
    expect(decideRun(with_((x) => tags(x, { keys: ['a', 'b'], shop: ['a', 'b'], have: ['b'], match: 'ANY' })))).toEqual({ action: 'SEND', step: 0 })
    // ไม่มีสถานะ + แท็กหายหมด = ไม่เหลือเงื่อนไข
    expect(decideRun(with_((x) => tags(x, { keys: ['a'], shop: [], have: ['a'], match: 'ANY', statuses: [] })))).toEqual({ action: 'STOP', reason: 'TAG_REMOVED' })
    // มีสถานะ + แท็กหายหมด = เหลือเงื่อนไขสถานะ → ไปต่อ
    expect(decideRun(with_((x) => tags(x, { keys: ['a'], shop: [], have: [], match: 'ANY' })))).toEqual({ action: 'SEND', step: 0 })
    // เทียบด้วย tagNameKey ตัวเดียวกับ UI (ตัวพิมพ์/ช่องว่าง)
    expect(decideRun(with_((x) => tags(x, { keys: [tagNameKey('VIP')], shop: [tagNameKey('VIP')], have: ['  vip '], match: 'ANY' })))).toEqual({ action: 'SEND', step: 0 })
  })
  it('ข้อ 8: ช่องไม่อยู่ในบอท · isHidden · TESTING ห้องไม่อยู่ใน test rooms (อยู่ = ผ่าน)', () => {
    const stop = { action: 'STOP', reason: 'OUT_OF_SCOPE' }
    expect(decideRun(with_((x) => (x.room.shopChannelId = 'chX')))).toEqual(stop)
    expect(decideRun(with_((x) => (x.room.shopChannelId = null)))).toEqual(stop)
    expect(decideRun(with_((x) => (x.room.isHidden = true)))).toEqual(stop)
    expect(decideRun(with_((x) => { x.bot.status = 'TESTING'; x.bot.testRoomIds = ['other'] }))).toEqual(stop)
    expect(decideRun(with_((x) => { x.bot.status = 'TESTING'; x.bot.testRoomIds = ['room1'] }))).toEqual({ action: 'SEND', step: 0 })
  })
  it('ข้อ 9: isBlocked ของห้อง Messenger ไม่หยุด (บล็อกเป็นเรื่อง LINE)', () => {
    expect(decideRun(with_((x) => (x.contact.isBlocked = true)))).toEqual({ action: 'SEND', step: 0 })
  })
  it('ข้อ 11: Meta AI ไม่ใช้กับ LINE', () => {
    expect(decideRun(with_((x) => { x.room.channel = 'LINE'; x.metaAi = metaAiHolding() }))).toEqual({ action: 'SEND', step: 0 })
  })
  it('ข้อ 11: Meta AI หมดเวลาพัก 24 ชม. → ส่งได้', () => {
    const m = metaAiHolding()
    const f = with_((x) => { x.metaAi = { ...m, metaForeignEchoAt: at(-META_AI_HOLD_MS - 1), lastMessageAt: at(-META_AI_HOLD_MS - 1) } })
    expect(decideRun(f)).toEqual({ action: 'SEND', step: 0 })
  })
})

describe('TC-041 ลำดับชนกัน — ทุกคู่ (i<j) ผลต้องเป็นเหตุของลำดับแรก (M-10)', () => {
  for (let i = 0; i < TRIGGERS.length; i++)
    for (let j = i + 1; j < TRIGGERS.length; j++)
      it(`${TRIGGERS[i].name} + ${TRIGGERS[j].name} → ${TRIGGERS[i].name}`, () => {
        const f = with_((x) => { TRIGGERS[i].apply(x); TRIGGERS[j].apply(x) })
        expect(decideRun(f)).toEqual(TRIGGERS[i].want)
      })
})

describe('TC-042 stage = null (ค่าไม่รู้จัก) ข้ามข้อ 1', () => {
  it('ไม่ STOP STAGE_CHANGED · ไม่ย้ายสถานะ', () => {
    expect(decideRun(with_((x) => (x.stage = null)))).toEqual({ action: 'SEND', step: 0 })
  })
})

describe('TC-043 HOLD ซ้อน · autoReplyEnabled เฉพาะ false ตรง ๆ', () => {
  it('เหตุเรียง SHOP_NOT_ENABLED › META_AI › AUTO_REPLY_OFF › CHANNEL_NOT_ACTIVE', () => {
    const all = (x: DecideFacts) => { x.sendAllowed = false; x.metaAi = metaAiHolding(); x.room.autoReplyEnabled = false; x.shopChannelStatus = 'X' }
    expect(decideRun(with_(all))).toEqual({ action: 'HOLD', reason: 'SHOP_NOT_ENABLED' })
    expect(decideRun(with_((x) => { all(x); x.sendAllowed = true }))).toEqual({ action: 'HOLD', reason: 'META_AI_HOLDING' })
    expect(decideRun(with_((x) => { all(x); x.sendAllowed = true; x.metaAi = null }))).toEqual({ action: 'HOLD', reason: 'AUTO_REPLY_OFF' })
    expect(decideRun(with_((x) => { all(x); x.sendAllowed = true; x.metaAi = null; x.room.autoReplyEnabled = null }))).toEqual({ action: 'HOLD', reason: 'CHANNEL_NOT_ACTIVE' })
  })
  it.each([null, true])('autoReplyEnabled=%s ไม่พัก', (v) => {
    expect(decideRun(with_((x) => (x.room.autoReplyEnabled = v)))).toEqual({ action: 'SEND', step: 0 })
  })
})

describe('TC-044 คนรับช่วง (handoffAt / autoReplyPausedUntil) ไม่ใช่เหตุหยุด/พัก', () => {
  it('ฟิลด์เหล่านั้นไม่มีผลต่อ decideRun', () => {
    const f = with_((x) => Object.assign(x.room, { handoffAt: at(-H), autoReplyPausedUntil: at(5 * H) }))
    expect(decideRun(f)).toEqual({ action: 'SEND', step: 0 })
  })
})

describe('TC-046/047 กรอบส่ง: ขอบ dueAt เทียบ expiresAt (M-11 `>=` เป็น `>` ต้องแดง)', () => {
  const exp = at(-2 * H + MESSAGING_WINDOW_MS) // lastInboundAt = -2h
  const dueAtExpiry = (off: number) =>
    with_((x) => (x.latestShopReply = { createdAt: new Date(exp.getTime() + off - 30 * MIN_MS), seq: 1 }))
  it('expiresAt − 1ms → ยังไม่หยุด (WAIT เพราะอนาคต)', () => {
    expect(decideRun(dueAtExpiry(-1))).toEqual({ action: 'WAIT', dueAt: new Date(exp.getTime() - 1) })
  })
  it('= expiresAt และ +1ms → STOP WINDOW_CLOSED', () => {
    expect(decideRun(dueAtExpiry(0))).toEqual({ action: 'STOP', reason: 'WINDOW_CLOSED' })
    expect(decideRun(dueAtExpiry(1))).toEqual({ action: 'STOP', reason: 'WINDOW_CLOSED' })
  })
  it('TC-047 ไม่มี lastInboundAt → STOP WINDOW_CLOSED (แม้ร้านค้างตอบ)', () => {
    expect(decideRun(with_((x) => { x.room.lastInboundAt = null; x.latestBuyerMsg = pos(-MIN_MS) }))).toEqual({ action: 'STOP', reason: 'WINDOW_CLOSED' })
  })
})

describe('TC-048/049/050/051 dueAt', () => {
  const f = base()
  it('ขั้นแรก ไม่มีฟองบอท: ร้านตอบ + delay', () => {
    expect(computeDueAt(f)).toEqual(at(-1 * H + 30 * MIN_MS))
  })
  it('ขั้นสอง: lastSentAt ใหม่กว่าร้านตอบ', () => {
    const g = with_((x) => { x.run.nextStep = 1; x.run.lastSentAt = at(-10 * MIN_MS) })
    expect(computeDueAt(g)).toEqual(at(-10 * MIN_MS + 120 * MIN_MS))
  })
  it('ร้านตอบใหม่ระหว่างรอ ใหม่กว่า lastSentAt → เลื่อนไปข้างหน้า (M-13 ถอด lastSentAt ต้องแดง)', () => {
    const older = with_((x) => { x.run.nextStep = 1; x.run.lastSentAt = at(-3 * H); x.latestShopReply = pos(-4 * H) })
    expect(computeDueAt(older)).toEqual(at(-3 * H + 120 * MIN_MS)) // lastSentAt ใหม่กว่า
    const newer = with_((x) => { x.run.nextStep = 1; x.run.lastSentAt = at(-3 * H); x.latestShopReply = pos(-30 * MIN_MS) })
    expect(computeDueAt(newer)).toEqual(at(-30 * MIN_MS + 120 * MIN_MS))
    expect(decideRun(newer)).toEqual({ action: 'WAIT', dueAt: at(90 * MIN_MS) })
  })
  it('ไม่พบร้านตอบ/ฟองบอท → ค่าสำรอง lastInboundAt · ไม่มีเลย → null', () => {
    const g = with_((x) => { x.latestShopReply = null; x.latestBuyerMsg = null })
    expect(computeDueAt(g)).toEqual(at(-2 * H + 30 * MIN_MS))
    expect(computeDueAt(with_((x) => { x.latestShopReply = null; x.room.lastInboundAt = null }))).toBeNull()
  })
  it('TC-048 ร้านค้างตอบ แม้เลยกำหนดนานแล้ว = WAIT null · แอดมินตอบแล้ว = คิดใหม่จากเวลาตอบ (M-12)', () => {
    const waiting = with_((x) => { x.latestShopReply = pos(-10 * H); x.latestBuyerMsg = pos(-MIN_MS); x.room.lastInboundAt = at(-MIN_MS) })
    expect(decideRun(waiting)).toEqual({ action: 'WAIT', dueAt: null })
    const replied = with_((x) => { x.latestBuyerMsg = pos(-MIN_MS); x.latestShopReply = pos(-1, 2); x.room.lastInboundAt = at(-MIN_MS) })
    expect(decideRun(replied)).toEqual({ action: 'WAIT', dueAt: at(-1 + 30 * MIN_MS) })
  })
  it('TC-050 nextStep: 2 จาก 3 = SEND step 2 · 3 = DONE', () => {
    const g = with_((x) => { x.run.nextStep = 2; x.run.lastSentAt = at(-2000 * MIN_MS); x.latestShopReply = pos(-2000 * MIN_MS); x.latestBuyerMsg = pos(-2500 * MIN_MS); x.room.lastInboundAt = at(-3 * H) })
    expect(decideRun(g)).toEqual({ action: 'SEND', step: 2 })
    expect(decideRun(with_((x) => (x.run.nextStep = 3)))).toEqual({ action: 'DONE' })
  })
  it('ถึงกำหนดพอดี (dueAt = now) = SEND ไม่ใช่ WAIT', () => {
    expect(decideRun(with_((x) => (x.latestShopReply = pos(-30 * MIN_MS))))).toEqual({ action: 'SEND', step: 0 })
    expect(decideRun(with_((x) => (x.latestShopReply = { createdAt: at(-30 * MIN_MS + 1), seq: 1 })))).toEqual({
      action: 'WAIT',
      dueAt: at(1),
    })
  })
})

describe('TC-055..060 กรอบส่งผ่าน getWindowState (decide)', () => {
  const win = (channel: string, lastInbound: Date, now: Date, adStart: Date | null) =>
    decideRun(
      with_((x) => {
        x.now = now
        x.room.channel = channel
        x.room.lastInboundAt = lastInbound
        x.adWindowStartAt = adStart
        x.latestBuyerMsg = pos(lastInbound.getTime() - T0.getTime())
        x.latestShopReply = { createdAt: new Date(now.getTime() - 60 * MIN_MS), seq: 9 }
        x.run.stageStamp = at(-3 * H)
      }),
    )
  const isOpen = (d: Decision) => d.action !== 'STOP'
  it('TC-055 ไม่มี anchor: 23h59m เปิด · 24h และ 24h+1s ปิด', () => {
    expect(isOpen(win('MESSENGER', at(-(24 * H - MIN_MS)), T0, null))).toBe(true)
    expect(win('MESSENGER', at(-24 * H), T0, null)).toEqual({ action: 'STOP', reason: 'WINDOW_CLOSED' })
    expect(win('MESSENGER', at(-24 * H - 1000), T0, null)).toEqual({ action: 'STOP', reason: 'WINDOW_CLOSED' })
  })
  it.each(['MESSENGER', 'INSTAGRAM'])('TC-056/057 %s มี anchor: 26h · 47h · 166h59m เปิด · 167h · 7d ปิด', (ch) => {
    const anchor = at(-300 * H)
    const nowAt = (ms: number) => new Date(anchor.getTime() + ms)
    expect(isOpen(win(ch, anchor, nowAt(26 * H), anchor))).toBe(true)
    expect(isOpen(win(ch, anchor, nowAt(47 * H), anchor))).toBe(true)
    expect(isOpen(win(ch, anchor, nowAt(AD_WINDOW_MS - MIN_MS), anchor))).toBe(true)
    expect(win(ch, anchor, nowAt(AD_WINDOW_MS), anchor)).toEqual({ action: 'STOP', reason: 'WINDOW_CLOSED' })
    expect(win(ch, anchor, nowAt(7 * 24 * H), anchor)).toEqual({ action: 'STOP', reason: 'WINDOW_CLOSED' })
  })
  it('TC-058 LINE: anchor ที่ส่งมาผิดช่องถูกเมิน → 24 ชม. จาก lastInboundAt', () => {
    const anchor = at(-300 * H)
    expect(win('LINE', anchor, new Date(anchor.getTime() + 26 * H), anchor)).toEqual({ action: 'STOP', reason: 'WINDOW_CLOSED' })
  })
})

describe('TC-099/100/095..098 eligibleToAttach', () => {
  const att = (f: (x: AttachFacts) => void = () => {}) => {
    const b = base()
    const a: AttachFacts = {
      now: T0,
      bot: { ...b.bot, deletedAt: null, tagKeys: [] },
      shopTagKeys: new Set(),
      room: { ...b.room, externalContactId: 'ec1' },
      contact: b.contact,
      shopChannelStatus: 'ACTIVE',
      adWindowStartAt: null,
      stage: { key: 'NOT_BOUGHT', stamp: at(-H) },
      latestBuyerMsg: pos(-10 * MIN_MS),
      lastRunFinishedAt: null,
    }
    a.bot.salesStatuses = ['NOT_BOUGHT']
    f(a)
    return eligibleToAttach(a)
  }
  it('ฐาน = แนบได้ พร้อม stage', () => {
    expect(att()).toEqual({ ok: true, stage: { key: 'NOT_BOUGHT', stamp: at(-H) } })
  })
  const NO: [string, (x: AttachFacts) => void, string][] = [
    ['ไม่มี RealBuyerMsg เลย', (x) => (x.latestBuyerMsg = null), 'NO_RECENT_BUYER_MSG'],
    ['ข้อความจริงเก่ากว่า delay ขั้นแรก (TC-097)', (x) => (x.latestBuyerMsg = pos(-31 * MIN_MS)), 'NO_RECENT_BUYER_MSG'],
    ['กรอบส่งปิด (TC-096 ไม่มี anchor, ทักล่าสุด 30 ชม.)', (x) => (x.room.lastInboundAt = at(-30 * H)), 'WINDOW_CLOSED'],
    ['NOT_INTERESTED', (x) => (x.contact = { ...x.contact, salesStatus: 'NOT_INTERESTED' }), 'NOT_INTERESTED'],
    ['LINE isBlocked', (x) => { x.room.channel = 'LINE'; x.contact = { ...x.contact, isBlocked: true } }, 'CONTACT_BLOCKED'],
    ['stage = null', (x) => (x.stage = null), 'STAGE_UNKNOWN'],
    ['stage ไม่อยู่ในบอท', (x) => (x.stage = { key: 'SHIPPED', stamp: at(-H) }), 'STAGE_NOT_MATCH'],
    ['stamp = null', (x) => (x.stage = { key: 'NOT_BOUGHT', stamp: null }), 'STAMP_MISSING'],
    ['externalContactId = null', (x) => (x.room.externalContactId = null), 'OUT_OF_SCOPE'],
    ['ห้องสแปม', (x) => (x.room.isSpam = true), 'OUT_OF_SCOPE'],
    ['ช่องไม่ ACTIVE', (x) => (x.shopChannelStatus = 'X'), 'OUT_OF_SCOPE'],
    ['บอท TESTING ห้องไม่อยู่ในห้องทดสอบ', (x) => { x.bot.status = 'TESTING'; x.bot.testRoomIds = ['z'] }, 'OUT_OF_SCOPE'],
    ['บอทปิด', (x) => (x.bot.status = 'CLOSED'), 'BOT_NOT_RUNNABLE'],
    ['บอทถูกลบ', (x) => (x.bot.deletedAt = at(-H)), 'BOT_NOT_RUNNABLE'],
  ]
  it.each(NO)('ไม่แนบ: %s', (_n, f, reason) => {
    expect(att(f)).toEqual({ ok: false, reason })
  })

  it('TC-096 มี anchor โฆษณา: ทัก 30 ชม. ก่อนแต่กรอบยังเปิด = แนบได้ (M-29)', () => {
    const r = att((x) => {
      x.room.lastInboundAt = at(-30 * H)
      x.adWindowStartAt = at(-30 * H)
      x.latestBuyerMsg = pos(-10 * MIN_MS)
    })
    expect(r.ok).toBe(true)
  })
  it('TC-098 บอทไม่เลือกสถานะ: run จบแล้ว — ข้อความ < F ไม่แนบ · > F แนบ (M-28)', () => {
    const f = (msg: number) => (x: AttachFacts) => {
      x.bot.salesStatuses = []
      x.bot.tagKeys = ['a']
      x.shopTagKeys = new Set(['a'])
      x.contact = { ...x.contact, tags: ['a'] }
      x.lastRunFinishedAt = at(-5 * MIN_MS)
      x.latestBuyerMsg = pos(msg)
    }
    expect(att(f(-10 * MIN_MS))).toEqual({ ok: false, reason: 'ALREADY_RAN' })
    expect(att(f(-5 * MIN_MS))).toEqual({ ok: false, reason: 'ALREADY_RAN' })
    expect(att(f(-4 * MIN_MS)).ok).toBe(true)
  })
  it('บอทที่เลือกสถานะ ไม่ติดด่าน finishedAt', () => {
    expect(att((x) => (x.lastRunFinishedAt = at(-5 * MIN_MS))).ok).toBe(true)
  })

  describe('TC-099 แท็ก (OD-FB-7)', () => {
    const tg = (o: { keys: string[]; shop: string[]; have: string[]; match: 'ANY' | 'ALL' }) => (x: AttachFacts) => {
      x.bot.salesStatuses = []
      x.bot.tagKeys = o.keys
      x.bot.tagMatch = o.match
      x.shopTagKeys = new Set(o.shop)
      x.contact = { ...x.contact, tags: o.have }
    }
    it('ANY ตรงอย่างน้อยหนึ่ง · ALL ครบ · ALL ขาดหนึ่ง', () => {
      expect(att(tg({ keys: ['a', 'b'], shop: ['a', 'b'], have: ['b'], match: 'ANY' })).ok).toBe(true)
      expect(att(tg({ keys: ['a', 'b'], shop: ['a', 'b'], have: ['a', 'b'], match: 'ALL' })).ok).toBe(true)
      expect(att(tg({ keys: ['a', 'b'], shop: ['a', 'b'], have: ['a'], match: 'ALL' }))).toEqual({ ok: false, reason: 'TAG_NOT_MATCH' })
    })
    it('แท็กหาย: ANY แนบต่อด้วยแท็กที่เหลือ · ALL ไม่แนบเลย (fail-closed)', () => {
      expect(att(tg({ keys: ['a', 'gone'], shop: ['a'], have: ['a'], match: 'ANY' })).ok).toBe(true)
      expect(att(tg({ keys: ['a', 'gone'], shop: ['a'], have: ['a'], match: 'ALL' }))).toEqual({ ok: false, reason: 'TAG_NOT_MATCH' })
    })
    it('เทียบด้วย tagNameKey (ตัวพิมพ์/ช่องว่าง)', () => {
      expect(att(tg({ keys: [tagNameKey('VIP')], shop: [tagNameKey('VIP')], have: [' vip'], match: 'ANY' })).ok).toBe(true)
    })
    it('TC-100 ไม่มีทั้งสถานะและแท็กที่ใช้ได้ = ไม่แนบ', () => {
      expect(att(tg({ keys: ['gone'], shop: [], have: ['gone'], match: 'ANY' }))).toEqual({ ok: false, reason: 'NO_CONDITION' })
      expect(att(tg({ keys: [], shop: [], have: [], match: 'ANY' }))).toEqual({ ok: false, reason: 'NO_CONDITION' })
    })
  })
})

describe('TC-105 mapFollowFailure', () => {
  const cases: [string | null | undefined, ReturnType<typeof mapFollowFailure>][] = [
    ['WINDOW_CLOSED', { status: 'SKIPPED', reason: 'META_WINDOW_REJECTED', stopRun: 'WINDOW_CLOSED' }],
    ['(#10) Message failed to send because another app is controlling this thread now.', { status: 'SKIPPED', reason: 'OTHER_APP_CONTROLS', stopRun: null }],
    ['SEND_FAILED: Another App Is Controlling This Thread', { status: 'SKIPPED', reason: 'OTHER_APP_CONTROLS', stopRun: null }],
    ['QUOTA_EXCEEDED', { status: 'SKIPPED', reason: 'LINE_QUOTA_FULL', stopRun: null }],
    [UNCERTAIN_SEND_REASON, { status: 'FAILED', reason: 'UNCERTAIN_SEND', stopRun: null }],
    ['TOKEN_INVALID', { status: 'FAILED', reason: 'PLATFORM_REJECTED', stopRun: null }],
    ['window_closed', { status: 'FAILED', reason: 'PLATFORM_REJECTED', stopRun: null }],
    ['', { status: 'FAILED', reason: 'PLATFORM_REJECTED', stopRun: null }],
    [null, { status: 'FAILED', reason: 'PLATFORM_REJECTED', stopRun: null }],
    [undefined, { status: 'FAILED', reason: 'PLATFORM_REJECTED', stopRun: null }],
  ]
  it.each(cases)('%j', (input, want) => {
    expect(mapFollowFailure(input)).toEqual(want)
  })
})

describe('AD_WINDOW_MS สอดคล้องกับเพดานรวมของบอท (SRS: 167 ชม. = 10,020 นาที)', () => {
  it('maxTotalDelayMin = AD_WINDOW_MS', () => {
    expect(AD_WINDOW_MS / MIN_MS).toBe(10_020)
  })
})
