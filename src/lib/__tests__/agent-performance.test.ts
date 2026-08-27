/**
 * เทสสูตรของรายงานผลงานแอดมิน (feature 00059)
 *
 * 🛑 [blocker] ทั้งไฟล์ — นี่คือด่านเดียวที่ตรวจ *ความหมาย* ของตัวเลขบนรายงาน
 * `tsc`/build/lint มองไม่เห็นอะไรเลยถ้าใครสลับตัวตั้งกับตัวหาร หรือเผลอนับคำตอบของบอท
 * เป็นคำตอบของคน — ทั้งสองอย่างเป็นโค้ดที่ถูกชนิดทุกตัวอักษร
 *
 * ทุกเคสในไฟล์นี้ถูกพิสูจน์ด้วย mutation แล้ว (แก้ตรรกะให้ผิดแล้วต้องมีเทสแดง) —
 * รายการ mutation ที่ใช้อยู่ท้ายไฟล์ ห้ามลบ input ที่ดูเหมือนซ้ำโดยไม่รัน mutation ซ้ำ
 * (docs/conventions/mutation-silence-means-weak-corpus.md)
 */
import { describe, expect, it } from 'vitest'

import {
  attributeOrder,
  computeConversationFact,
  conversionRatePct,
  formatResponseDuration,
  isAnsweredOutsideSystem,
  isConvertedConversation,
  isQualifiedConversation,
  normalizeSource,
  selectCohort,
  slaAchievementPct,
  summarizeByAgent,
  summarizeShop,
  type AgentChatEvent,
  type ConversationInput,
} from '@/lib/agent-performance'
import { DEFAULT_FIRST_RESPONSE_SLA_SEC, meetsFirstResponseSla, resolveSlaConfig } from '@/lib/agent-sla'
import { countsAsRevenue } from '@/lib/order-revenue'

const T0 = new Date('2026-08-18T03:00:00.000Z') // 10:00 น. เวลาไทย
const at = (sec: number) => new Date(T0.getTime() + sec * 1000)

let seq = 0
function msg(over: Partial<AgentChatEvent> & { createdAt: Date }): AgentChatEvent {
  seq += 1
  return {
    conversationId: 'c1',
    seq,
    senderRole: 'BUYER',
    senderUserId: null,
    autoReplyKind: null,
    isDeleted: false,
    ...over,
  }
}
const fromCustomer = (sec: number) => msg({ createdAt: at(sec), senderRole: 'BUYER' })
const fromAgent = (sec: number, userId: string) =>
  msg({ createdAt: at(sec), senderRole: 'SHOP', senderUserId: userId })
const fromBot = (sec: number) =>
  msg({ createdAt: at(sec), senderRole: 'SHOP', senderUserId: null, autoReplyKind: 'AUTO' })
/**
 * คำตอบอัตโนมัติที่ **มี** ตัวตนผู้ส่งติดมาด้วย
 *
 * 🛑 อย่าลบทิ้งเพราะ "วันนี้เกิดไม่ได้" — วันนี้ `auto-reply-send.service.ts` ส่ง
 * `actorUserId: null` ทุกเส้นทาง (บรรทัด 136/167) แถวแบบนี้จึงยังไม่มีในฐาน
 * แต่ถ้าไม่มี input ตัวนี้ การถอด `autoReplyKind === null` ออกจาก `isHumanAgentReply()`
 * จะไม่ทำให้เทสแดงสักข้อ = ด่านนั้นไม่มีอะไรกันเลย (พิสูจน์ด้วย mutation แล้ว 2026-08-26)
 * วันที่มีใครส่ง actorUserId เข้าเส้นทางอัตโนมัติ คำตอบของบอทจะกลายเป็นผลงานของคนทันที
 */
const fromBotWithActor = (sec: number, userId: string) =>
  msg({ createdAt: at(sec), senderRole: 'SHOP', senderUserId: userId, autoReplyKind: 'AUTO' })
/** คำตอบที่คนพิมพ์จาก Business Suite — echo กลับมาโดยไม่มีตัวตนผู้ส่ง */
const fromOutsideSystem = (sec: number) =>
  msg({ createdAt: at(sec), senderRole: 'SHOP', senderUserId: null })

function conv(over: Partial<ConversationInput> = {}): ConversationInput {
  return {
    conversationId: 'c1',
    startedAt: T0,
    lastMessageAt: at(600),
    isSpam: false,
    channel: 'MESSENGER',
    referralSource: null,
    events: [],
    orders: [],
    ...over,
  }
}

const SLA = DEFAULT_FIRST_RESPONSE_SLA_SEC

describe('1. ลูกค้าทัก → แอดมินตอบ', () => {
  it('[blocker] วัดเวลาจากข้อความลูกค้าถึงคำตอบของคน', () => {
    const f = computeConversationFact(
      conv({ events: [fromCustomer(0), fromAgent(84, 'a1')] }),
    )
    expect(f.firstResponseSec).toBe(84)
    expect(f.firstResponderUserId).toBe('a1')
    expect(f.responseSamples).toEqual([{ agentUserId: 'a1', waitSec: 84 }])
    expect(isQualifiedConversation(f)).toBe(true)
  })

  it('[blocker] ตอบต่อเนื่องหลายใบนับเป็นการตอบครั้งเดียว — ใบที่ 2/3 ไม่ใช่ "การรอ"', () => {
    const f = computeConversationFact(
      conv({ events: [fromCustomer(0), fromAgent(30, 'a1'), fromAgent(35, 'a1'), fromAgent(90, 'a1')] }),
    )
    expect(f.responseSamples).toHaveLength(1)
    expect(f.firstResponseSec).toBe(30)
  })

  it('[blocker] ไม่นับช่วงที่ร้านไม่มีหน้าที่ต้องตอบ — ลูกค้าเงียบไป 1 ชม.หลังร้านตอบ', () => {
    const f = computeConversationFact(
      conv({ events: [fromCustomer(0), fromAgent(20, 'a1'), fromCustomer(3620), fromAgent(3650, 'a1')] }),
    )
    // ถ้าเผลอวัดจาก "คำตอบก่อนหน้า" แทน "คำถามที่ค้าง" จะได้ 3630 วิ
    expect(f.responseSamples.map((s) => s.waitSec)).toEqual([20, 30])
  })
})

describe('2. ลูกค้าพิมพ์รัวหลายใบก่อนแอดมินตอบครั้งเดียว', () => {
  it('[blocker] เป็นการรอ "รอบเดียว" นับจากใบแรก ไม่ใช่ใบล่าสุด', () => {
    const f = computeConversationFact(
      conv({ events: [fromCustomer(0), fromCustomer(10), fromCustomer(25), fromAgent(100, 'a1')] }),
    )
    expect(f.responseSamples).toHaveLength(1)
    // ใบล่าสุดจะได้ 75 · ใบแรกได้ 100 — ตัวที่ถูกคือ 100 (ลูกค้ารอมา 100 วิจริง)
    expect(f.firstResponseSec).toBe(100)
  })
})

describe('3. คำตอบของบอทไม่นับ', () => {
  it('[blocker] บอทตอบทันทีแล้วคนตอบทีหลัง → เวลาต้องเป็นของคน', () => {
    const f = computeConversationFact(
      conv({ events: [fromCustomer(0), fromBot(2), fromAgent(300, 'a1')] }),
    )
    expect(f.firstResponseSec).toBe(300)
    expect(f.firstResponderUserId).toBe('a1')
  })

  it('[blocker] บอทที่มีตัวตนผู้ส่งติดมา ก็ยังไม่ใช่ "คนตอบ"', () => {
    const f = computeConversationFact(
      conv({ events: [fromCustomer(0), fromBotWithActor(3, 'a1'), fromAgent(400, 'a1')] }),
    )
    expect(f.firstResponseSec).toBe(400)
    expect(f.responseSamples).toEqual([{ agentUserId: 'a1', waitSec: 400 }])
  })

  it('[blocker] มีแต่บอทตอบ = เธรดที่ยังไม่มีคนตอบ (ไม่เข้าเกณฑ์ตัวหาร)', () => {
    const f = computeConversationFact(conv({ events: [fromCustomer(0), fromBot(2)] }))
    expect(f.firstResponseSec).toBeNull()
    expect(f.repliedAgentUserIds).toEqual([])
    expect(isQualifiedConversation(f)).toBe(false)
  })
})

describe('4. ข้อความระบบ/ตอบจากนอกระบบไม่นับเป็นผลงานของใคร', () => {
  it('[blocker] คำตอบที่ไม่มีตัวตนผู้ส่งไม่ถูกยกให้แอดมินคนใด แต่ต้องถูกนับไว้ติดป้าย', () => {
    const f = computeConversationFact(
      conv({ events: [fromCustomer(0), fromOutsideSystem(30)] }),
    )
    expect(f.firstResponseSec).toBeNull()
    expect(f.repliedAgentUserIds).toEqual([])
    // 🛑 ต้อง "ไม่หายเงียบ" — จอต้องบอกได้ว่ามีคำตอบที่ระบบระบุตัวคนไม่ได้กี่ใบ
    expect(f.unattributedReplyCount).toBe(1)
  })

  it('[blocker] ข้อความที่ถูกลบ (unsend) ไม่เปิดรอบการรอ', () => {
    const deleted = msg({ createdAt: at(0), senderRole: 'BUYER', isDeleted: true })
    const f = computeConversationFact(
      conv({ events: [deleted, fromCustomer(50), fromAgent(80, 'a1')] }),
    )
    expect(f.firstResponseSec).toBe(30)
  })
})

describe('5. เธรดที่ไม่มีแอดมินตอบเลย', () => {
  it('[blocker] ไม่มีเวลาตอบ · ไม่เข้าตัวหารการปิดการขาย · แต่ยังอยู่ในตัวหาร SLA และถือว่าไม่ทัน', () => {
    const f = computeConversationFact(conv({ events: [fromCustomer(0), fromCustomer(60)] }))
    expect(f.firstResponseSec).toBeNull()
    expect(isQualifiedConversation(f)).toBe(false)
    expect(meetsFirstResponseSla(f.firstResponseSec, resolveSlaConfig())).toBe(false)

    const shop = summarizeShop([f], SLA)
    expect(shop.slaRequired).toBe(1)
    expect(shop.slaWithin).toBe(0)
    expect(shop.slaPct).toBe(0)
    expect(shop.unansweredConversations).toBe(1)
    // ไม่มีเธรดเข้าเกณฑ์เลย → อัตราต้องเป็น "ไม่มีข้อมูล" ไม่ใช่ 0%
    expect(shop.conversionRatePct).toBeNull()
  })

  it('[blocker] เธรดที่ร้านทักไปเองแล้วลูกค้าไม่เคยตอบ ไม่เข้าตัวหาร SLA', () => {
    const f = computeConversationFact(conv({ events: [fromAgent(0, 'a1')] }))
    expect(summarizeShop([f], SLA).slaRequired).toBe(0)
    expect(summarizeShop([f], SLA).slaPct).toBeNull()
  })
})

describe('5b. เธรดที่ตอบจากนอกระบบ (Business Suite) — วัดไม่ได้ จึงไม่นับ', () => {
  /**
   * ผู้ใช้เคาะ 2026-08-27: "เอาเฉพาะฝั่งที่เค้าตอบผ่านระบบ · ส่วนที่ตอบผ่าน business suite
   * ไม่นับ ทำอะไรไม่ได้"
   *
   * เหตุผลเชิงข้อมูล: prod จริง (BT Premium พุทธมณฑลสาย 3) มี 834 เธรดใน 30 วัน ตอบไปแล้ว
   * 830 แต่ Meta ไม่ส่งชื่อผู้พิมพ์กลับมา ⇒ ถ้าไม่แยกออก SLA ของสาขานั้นจะเป็น 0%
   * และการ์ด "ยังไม่มีใครตอบ" จะขึ้น 830 ทั้งที่ลูกค้าได้คำตอบครบทุกห้อง
   */
  const outside = () =>
    computeConversationFact(conv({ events: [fromCustomer(0), fromOutsideSystem(45)] }))

  it('[blocker] แยกออกจาก "ไม่มีใครตอบ" ได้ถูกต้อง', () => {
    const f = outside()
    expect(isAnsweredOutsideSystem(f)).toBe(true)
    // เธรดที่ไม่มีใครตอบเลยต้องไม่เข้าเกณฑ์นี้ — สองอย่างนี้ห้ามปนกัน
    expect(isAnsweredOutsideSystem(computeConversationFact(conv({ events: [fromCustomer(0)] })))).toBe(false)
    // เธรดที่มีคนตอบด้วย ไม่ใช่ "นอกระบบล้วน ๆ"
    expect(
      isAnsweredOutsideSystem(
        computeConversationFact(conv({ events: [fromCustomer(0), fromOutsideSystem(10), fromAgent(60, 'a1')] })),
      ),
    ).toBe(false)
  })

  it('[blocker] ไม่เข้าตัวหาร SLA และไม่ถูกนับว่า "ยังไม่มีใครตอบ"', () => {
    const shop = summarizeShop([outside()], SLA)
    expect(shop.slaRequired).toBe(0)
    expect(shop.slaPct).toBeNull() // ไม่มีอะไรให้ตัดสิน → "—" ไม่ใช่ 0%
    expect(shop.unansweredConversations).toBe(0)
    expect(shop.answeredOutsideSystemConversations).toBe(1)
  })

  it('[blocker] เธรดที่ไม่มีใครตอบเลย ยังนับว่าไม่ทันเหมือนเดิม (ห้ามผ่อนตามไปด้วย)', () => {
    const never = computeConversationFact(conv({ conversationId: 'n', events: [fromCustomer(0)] }))
    const shop = summarizeShop([outside(), never], SLA)
    expect(shop.slaRequired).toBe(1) // เฉพาะ never
    expect(shop.slaWithin).toBe(0)
    expect(shop.slaPct).toBe(0)
    expect(shop.unansweredConversations).toBe(1)
    expect(shop.answeredOutsideSystemConversations).toBe(1)
  })

  it('[blocker] ไม่ยัดให้แอดมินคนไหนรับผิดชอบ', () => {
    expect(summarizeByAgent([outside()], SLA)).toEqual([])
  })
})

describe('6. เธรดที่ปิดการขายได้', () => {
  it('[blocker] ยกให้คนที่กดสร้างออเดอร์ (หลักฐาน) ไม่ใช่คนที่ส่งข้อความล่าสุด', () => {
    const f = computeConversationFact(
      conv({
        events: [fromCustomer(0), fromAgent(60, 'a1'), fromCustomer(700)],
        orders: [
          { orderId: 'o1', createdAt: at(600), createdByUserId: 'a1', countsAsRevenue: true, amount: 1200 },
        ],
      }),
    )
    expect(isConvertedConversation(f)).toBe(true)
    expect(f.orders[0].attribution).toEqual({ agentUserId: 'a1', basis: 'ORDER_ACTOR' })
    expect(f.timeToCloseSec).toBe(600)

    const [row] = summarizeByAgent([f], SLA)
    expect(row.agentUserId).toBe('a1')
    expect(row.convertedConversations).toBe(1)
    expect(row.qualifiedConversations).toBe(1)
    expect(row.conversionRatePct).toBe(100)
    expect(row.revenue).toBe(1200)
  })
})

describe('7. เธรดที่มีออเดอร์ถูกยกเลิก', () => {
  it('[blocker] ใบที่ยกเลิกไม่นับเป็นยอดขายและไม่นับว่าปิดการขายได้', () => {
    const f = computeConversationFact(
      conv({
        events: [fromCustomer(0), fromAgent(60, 'a1')],
        orders: [
          { orderId: 'o1', createdAt: at(300), createdByUserId: 'a1', countsAsRevenue: false, amount: 990 },
        ],
      }),
    )
    expect(isConvertedConversation(f)).toBe(false)
    expect(f.timeToCloseSec).toBeNull()

    const shop = summarizeShop([f], SLA)
    expect(shop.ordersCreated).toBe(1) // "เปิดบิลแล้ว" ยังนับ
    expect(shop.revenue).toBe(0) // แต่ไม่ใช่ยอดขาย
    expect(shop.convertedConversations).toBe(0)
    expect(shop.conversionRatePct).toBe(0) // มีเธรดเข้าเกณฑ์ 1 แต่ปิดไม่ได้ = 0% (ต่างจาก null)
  })

  it('[blocker] เกณฑ์ "นับเป็นยอดขาย" ใช้ SSOT เดิมของระบบ ไม่ได้นิยามใหม่', () => {
    expect(countsAsRevenue({ status: 'CANCELLED', shipments: [] })).toBe(false)
    expect(countsAsRevenue({ status: 'PENDING', shipments: [] })).toBe(false)
    expect(countsAsRevenue({ status: 'CONFIRMED', shipments: [] })).toBe(true)
    expect(
      countsAsRevenue({
        status: 'SHIPPED',
        shipments: [{ status: 'CREATED', isDryRun: false, direction: 'FORWARD', carrierStatus: 'delivered' }],
      }),
    ).toBe(true)
  })
})

describe('8. หลายออเดอร์จากเธรดเดียว', () => {
  it('[blocker] นับเป็นเธรดที่ปิดได้ "หนึ่ง" เธรด แต่ยอดขายรวมทุกใบ', () => {
    const f = computeConversationFact(
      conv({
        events: [fromCustomer(0), fromAgent(60, 'a1')],
        orders: [
          { orderId: 'o1', createdAt: at(300), createdByUserId: 'a1', countsAsRevenue: true, amount: 500 },
          { orderId: 'o2', createdAt: at(900), createdByUserId: 'a1', countsAsRevenue: true, amount: 700 },
        ],
      }),
    )
    const shop = summarizeShop([f], SLA)
    expect(shop.convertedConversations).toBe(1)
    expect(shop.ordersCreated).toBe(2)
    expect(shop.revenue).toBe(1200)
    expect(shop.conversionRatePct).toBe(100) // ห้ามได้ 200%

    const [row] = summarizeByAgent([f], SLA)
    expect(row.convertedConversations).toBe(1)
    expect(row.ordersCreated).toBe(2)
    expect(row.conversionRatePct).toBe(100)
    // เวลาปิดการขาย = ใบแรกที่นับเป็นยอดขาย ไม่ใช่ใบล่าสุด
    expect(f.timeToCloseSec).toBe(300)
  })
})

describe('9. เธรดที่ส่งต่อระหว่างแอดมิน', () => {
  const transferred = () =>
    computeConversationFact(
      conv({
        events: [
          fromCustomer(0),
          fromAgent(60, 'a1'), // a1 รับเรื่องก่อน
          fromCustomer(1000),
          fromAgent(1100, 'a2'), // a2 มารับช่วง
          fromCustomer(2000),
        ],
        orders: [
          // ระบบออกให้เอง (ไม่มีคนกด) → ต้องตกเป็นของ "เจ้าของเธรด ณ เวลานั้น"
          { orderId: 'o1', createdAt: at(1500), createdByUserId: null, countsAsRevenue: true, amount: 800 },
        ],
      }),
    )

  it('[blocker] ออเดอร์ที่ไม่มีคนกดสร้าง ตกเป็นของคนที่ตอบล่าสุด "ก่อน" เวลาสร้าง', () => {
    const f = transferred()
    expect(f.orders[0].attribution).toEqual({ agentUserId: 'a2', basis: 'CONVERSATION_OWNER' })
  })

  it('[blocker] ไม่ใช่ "คนที่ส่งข้อความล่าสุด" — ข้อความล่าสุดของเธรดเป็นของลูกค้า', () => {
    const f = transferred()
    const lastEvent = f.responseSamples.at(-1)
    expect(lastEvent?.agentUserId).toBe('a2')
    // เวลารอของแต่ละคนต้องเป็นของตัวเอง ไม่ปนกัน
    expect(f.responseSamples).toEqual([
      { agentUserId: 'a1', waitSec: 60 },
      { agentUserId: 'a2', waitSec: 100 },
    ])
  })

  it('[blocker] ทั้งสองคนได้ "เธรดที่ดูแล" แต่ยอดขายยกให้คนเดียว — ผลรวมเงินต้องไม่บวม', () => {
    const f = transferred()
    const rows = summarizeByAgent([f], SLA)
    expect(rows.map((r) => r.agentUserId).sort()).toEqual(['a1', 'a2'])
    expect(rows.reduce((n, r) => n + r.revenue, 0)).toBe(800)
    expect(rows.reduce((n, r) => n + r.ordersCreated, 0)).toBe(1)
    // SLA รายคน: a1 เป็นคนตอบครั้งแรก → เธรดนี้เป็นภาระของ a1 คนเดียว
    expect(rows.find((r) => r.agentUserId === 'a1')!.slaRequired).toBe(1)
    expect(rows.find((r) => r.agentUserId === 'a2')!.slaRequired).toBe(0)
  })

  it('[blocker] คนที่เปิดบิลให้เธรดที่ตัวเองไม่ได้ตอบ ต้องไม่ได้อัตราปิดการขายเกิน 100%', () => {
    const f = computeConversationFact(
      conv({
        events: [fromCustomer(0), fromAgent(60, 'a1')],
        orders: [
          { orderId: 'o1', createdAt: at(300), createdByUserId: 'a2', countsAsRevenue: true, amount: 400 },
        ],
      }),
    )
    const a2 = summarizeByAgent([f], SLA).find((r) => r.agentUserId === 'a2')!
    expect(a2.convertedConversations).toBe(1)
    expect(a2.qualifiedConversations).toBe(1)
    expect(a2.conversionRatePct).toBe(100)
  })
})

describe('9b. เส้นทาง "ตอบแชท → เปิดบิล" (ผู้ใช้สั่ง 2026-08-27)', () => {
  /**
   * เคสจริงบน prod ที่ทำให้ต้องมีกลุ่มคอลัมน์นี้ (BT Premium คลอง 4 ธัญบุรี · 30 วัน):
   * แอดมินคนหนึ่งตอบแชท 54 ห้อง มีบิลออกมา 4 ใบ แต่ **เปิดเอง 0 ใบ** (คนอื่นเปิดให้ทั้งหมด)
   * ⇒ ถ้ามีแต่คอลัมน์เครดิต เขาจะขึ้น "—" ทั้งแถว ทั้งที่เป็นคนคุยจนลูกค้าตัดสินใจ
   */
  const chatterOnly = () =>
    computeConversationFact(
      conv({
        conversationId: 'c-chat',
        events: [fromCustomer(0), fromAgent(60, 'chatter')],
        orders: [
          // 'biller' เป็นคนกดสร้าง ทั้งที่ 'chatter' เป็นคนคุย
          { orderId: 'o1', createdAt: at(300), createdByUserId: 'biller', countsAsRevenue: true, amount: 900 },
        ],
      }),
    )

  it('[blocker] คนที่คุยแต่ไม่ได้เปิดบิล ต้องยังเห็นกรวยของตัวเอง ไม่ใช่ศูนย์ทั้งแถว', () => {
    const chatter = summarizeByAgent([chatterOnly()], SLA).find((r) => r.agentUserId === 'chatter')!
    expect(chatter.repliedConversations).toBe(1)
    expect(chatter.conversationsWithOrder).toBe(1)
    expect(chatter.conversationsWithClosedOrder).toBe(1)
    // เครดิตยังเป็นของคนเปิดบิลเหมือนเดิม — กรวยไม่ได้ไปแย่งเครดิต
    expect(chatter.ordersCreated).toBe(0)
    expect(chatter.revenue).toBe(0)
    expect(chatter.ordersCreatedByOthers).toBe(1)
  })

  it('[blocker] คนที่เปิดบิลให้ ยังได้เครดิตเต็ม', () => {
    const biller = summarizeByAgent([chatterOnly()], SLA).find((r) => r.agentUserId === 'biller')!
    expect(biller.ordersCreated).toBe(1)
    expect(biller.revenue).toBe(900)
    // 🛑 แต่ **ไม่ได้** เธรดในกรวย เพราะเขาไม่ได้ตอบแชทห้องนั้น
    expect(biller.repliedConversations).toBe(0)
    expect(biller.conversationsWithOrder).toBe(0)
  })

  it('[blocker] คนที่ทั้งคุยและเปิดเอง → "คนอื่นเปิดให้" ต้องเป็น 0', () => {
    const f = computeConversationFact(
      conv({
        events: [fromCustomer(0), fromAgent(60, 'a1')],
        orders: [
          { orderId: 'o1', createdAt: at(300), createdByUserId: 'a1', countsAsRevenue: true, amount: 500 },
          { orderId: 'o2', createdAt: at(900), createdByUserId: 'a1', countsAsRevenue: false, amount: 200 },
        ],
      }),
    )
    const [row] = summarizeByAgent([f], SLA)
    expect(row.repliedConversations).toBe(1)
    expect(row.conversationsWithOrder).toBe(1)
    expect(row.conversationsWithClosedOrder).toBe(1) // 2 ใบ แต่เป็นเธรดเดียว
    expect(row.ordersCreated).toBe(2)
    expect(row.ordersCreatedByOthers).toBe(0)
  })

  it('[blocker] กรวยต้องลดหลั่นเสมอ: ตอบ ≥ มีบิล ≥ ปิดได้', () => {
    const facts = [
      chatterOnly(),
      computeConversationFact(conv({ conversationId: 'c2', events: [fromCustomer(0), fromAgent(30, 'chatter')] })),
      computeConversationFact(
        conv({
          conversationId: 'c3',
          events: [fromCustomer(0), fromAgent(30, 'chatter')],
          orders: [{ orderId: 'o9', createdAt: at(60), createdByUserId: 'chatter', countsAsRevenue: false, amount: 100 }],
        }),
      ),
    ]
    const r = summarizeByAgent(facts, SLA).find((x) => x.agentUserId === 'chatter')!
    expect(r.repliedConversations).toBe(3)
    expect(r.conversationsWithOrder).toBe(2)
    expect(r.conversationsWithClosedOrder).toBe(1)
    expect(r.repliedConversations).toBeGreaterThanOrEqual(r.conversationsWithOrder)
    expect(r.conversationsWithOrder).toBeGreaterThanOrEqual(r.conversationsWithClosedOrder)
  })
})

describe('10. กรองด้วยช่วงเวลา', () => {
  const facts = [
    computeConversationFact(conv({ conversationId: 'in', startedAt: new Date('2026-08-18T00:00:00Z') })),
    computeConversationFact(conv({ conversationId: 'before', startedAt: new Date('2026-08-12T09:00:00Z') })),
    computeConversationFact(conv({ conversationId: 'edge-to', startedAt: new Date('2026-08-25T00:00:00Z') })),
  ]
  const range = { from: new Date('2026-08-18T00:00:00Z'), to: new Date('2026-08-25T00:00:00Z') }

  it('[blocker] ขอบเป็น [from, to) — ต้นรวม ปลายไม่รวม', () => {
    expect(selectCohort(facts, range).map((f) => f.conversationId)).toEqual(['in'])
  })

  it('[blocker] ช่วงก่อนหน้าที่ยาวเท่ากันต้องไม่คาบเกี่ยวกับช่วงปัจจุบัน', () => {
    const span = range.to.getTime() - range.from.getTime()
    const prev = { from: new Date(range.from.getTime() - span), to: range.from }
    expect(selectCohort(facts, prev).map((f) => f.conversationId)).toEqual(['before'])
    expect(prev.to.getTime()).toBe(range.from.getTime())
  })
})

describe('11. กรองด้วยช่องทางและที่มา', () => {
  const facts = [
    computeConversationFact(conv({ conversationId: 'fb', channel: 'MESSENGER', referralSource: 'ADS' })),
    computeConversationFact(conv({ conversationId: 'line', channel: 'LINE', referralSource: null })),
    computeConversationFact(conv({ conversationId: 'ig', channel: 'INSTAGRAM', referralSource: 'SHORTLINK' })),
  ]
  const range = { from: new Date('2026-08-17T00:00:00Z'), to: new Date('2026-08-19T00:00:00Z') }

  it('[blocker] กรองช่องทางแล้วเหลือเฉพาะช่องทางนั้น', () => {
    expect(selectCohort(facts, { ...range, channel: 'LINE' }).map((f) => f.conversationId)).toEqual(['line'])
  })

  it('[blocker] "ทักเข้ามาเอง" คือค่า null ในฐานข้อมูล — ต้องกรองเจอ ไม่ใช่ตกหล่น', () => {
    expect(normalizeSource(null)).toBe('DIRECT')
    expect(selectCohort(facts, { ...range, source: 'DIRECT' }).map((f) => f.conversationId)).toEqual(['line'])
    expect(selectCohort(facts, { ...range, source: 'ADS' }).map((f) => f.conversationId)).toEqual(['fb'])
  })
})

describe('12. SLA', () => {
  it('[blocker] เกณฑ์ตั้งต้น 5 นาที และเป็นขอบแบบ "เท่ากับก็ผ่าน"', () => {
    const cfg = resolveSlaConfig()
    expect(cfg.firstResponseSec).toBe(300)
    expect(cfg.source).toBe('SYSTEM_DEFAULT')
    expect(meetsFirstResponseSla(300, cfg)).toBe(true)
    expect(meetsFirstResponseSla(301, cfg)).toBe(false)
  })

  it('[blocker] ตัวหาร = เธรดที่ต้องมีการตอบครั้งแรก (รวมเธรดที่ไม่มีใครตอบ)', () => {
    const facts = [
      computeConversationFact(conv({ conversationId: 'fast', events: [fromCustomer(0), fromAgent(10, 'a1')] })),
      computeConversationFact(conv({ conversationId: 'slow', events: [fromCustomer(0), fromAgent(900, 'a1')] })),
      computeConversationFact(conv({ conversationId: 'never', events: [fromCustomer(0)] })),
      computeConversationFact(conv({ conversationId: 'spam', isSpam: true, events: [fromCustomer(0)] })),
    ]
    const shop = summarizeShop(facts, SLA)
    expect(shop.slaRequired).toBe(3) // สแปมไม่นับ
    expect(shop.slaWithin).toBe(1)
    expect(shop.slaPct).toBeCloseTo(33.3, 1)
  })

  it('[blocker] ไม่มีเธรดที่ต้องตอบเลย → "—" ไม่ใช่ 100%', () => {
    expect(slaAchievementPct(0, 0)).toBeNull()
    expect(conversionRatePct(0, 0)).toBeNull()
  })
})

describe('การแสดงผลของหน่วยเวลา', () => {
  it('อ่านออกทุกช่วง และ "ไม่มีข้อมูล" ต้องไม่กลายเป็น 0', () => {
    expect(formatResponseDuration(32)).toBe('32 วิ')
    expect(formatResponseDuration(84)).toBe('1 น. 24 วิ')
    expect(formatResponseDuration(492)).toBe('8 น. 12 วิ')
    expect(formatResponseDuration(120)).toBe('2 น.')
    expect(formatResponseDuration(7325)).toBe('2 ชม. 2 น.')
    expect(formatResponseDuration(null)).toBe('—')
    expect(formatResponseDuration(0)).toBe('0 วิ')
  })
})

describe('กติกาการยกเครดิต (สรุป)', () => {
  it('[blocker] ไม่มีทั้งคนกดและเจ้าของเธรด → ไม่ยกให้ใคร ห้ามเดา', () => {
    expect(attributeOrder({ createdByUserId: null, conversationOwnerUserId: null })).toEqual({
      agentUserId: null,
      basis: 'UNATTRIBUTED',
    })
  })

  it('[blocker] คนกดสร้างชนะเจ้าของเธรดเสมอ', () => {
    expect(
      attributeOrder({ createdByUserId: 'a1', conversationOwnerUserId: 'a2' }),
    ).toEqual({ agentUserId: 'a1', basis: 'ORDER_ACTOR' })
  })

  it('[blocker] ยอดที่ยกให้ใครไม่ได้ ต้องยังอยู่ในภาพรวมร้าน (ไม่หายไปเฉย ๆ)', () => {
    const f = computeConversationFact(
      conv({
        events: [fromCustomer(0), fromBot(5)],
        orders: [
          { orderId: 'o1', createdAt: at(60), createdByUserId: null, countsAsRevenue: true, amount: 250 },
        ],
      }),
    )
    expect(summarizeShop([f], SLA).revenue).toBe(250)
    expect(summarizeByAgent([f], SLA)).toEqual([])
  })
})

/**
 * ── mutation ที่ใช้พิสูจน์ว่าเทสชุดนี้จับของจริง (รันแล้วต้องแดง) ────────────────
 *  1. `computeResponsePairs`: เปลี่ยน `if (askedAt === null) askedAt = ...` เป็นเขียนทับทุกใบ
 *     → เคส 2 แดง (ได้ 75 แทน 100)
 *  2. `isHumanAgentReply`: ถอด `autoReplyKind === null` → เคส 3 แดง
 *  3. `isHumanAgentReply`: ถอด `senderUserId !== null` → เคส 4 แดง
 *  4. `attributeOrder`: สลับลำดับสองข้อแรก → เคส 6 แดง
 *  5. `summarizeShop`: ใช้ `facts.length` เป็นตัวหารแทน `qualified.length` → เคส 5/7 แดง
 *  6. `summarizeShop` (SLA): กรองเธรดที่ยังไม่ถูกตอบออกจากตัวหาร → เคส 5/12 แดง
 *  7. `isConvertedConversation`: นับจำนวนใบแทน "มีอย่างน้อยหนึ่งใบ" → เคส 8 แดง
 *  8. `summarizeByAgent`: ไม่รวม convertedIds เข้า qualifiedIds → เคส 9 (ข้อสุดท้าย) แดง
 *  9. `conversionRatePct`/`slaAchievementPct`: คืน 0 แทน null เมื่อตัวหารเป็น 0 → เคส 5/12 แดง
 * 10. `computeConversationFact`: เรียงออเดอร์ตามลำดับ array แทน `createdAt` → เคส 8 แดง
 */
