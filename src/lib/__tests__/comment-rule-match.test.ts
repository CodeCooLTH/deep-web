import { describe, it, expect } from 'vitest'
import {
  matchCommentRule,
  ruleHasSomethingToSend,
  type CommentRuleCandidate,
} from '@/lib/comment-rule-match'
import { normalizeMessage } from '@/lib/auto-reply-normalize'

const CH = 'ch-page-1'
const OTHER_CH = 'ch-page-2'

function rule(over: Partial<CommentRuleCandidate> & { id: string }): CommentRuleCandidate {
  return {
    shopChannelId: null,
    normalizedPhrases: ['ราคา'],
    priority: 100,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

describe('matchCommentRule', () => {
  it('คำอยู่ในข้อความ -> เข้ากฎ', () => {
    expect(matchCommentRule('ชุดนี้ราคาเท่าไหร่ครับ', [rule({ id: 'r1' })], CH)?.id).toBe('r1')
  })

  it('ไม่มีคำไหนตรง -> null (ตกไปใช้ข้อความ fallback ของเพจ)', () => {
    expect(matchCommentRule('สวยมากครับ', [rule({ id: 'r1' })], CH)).toBeNull()
  })

  // [blocker] บน prod มีคอมเมนต์ที่ไม่มีข้อความเลย 22 ใบ (แท็กเพื่อน/สติกเกอร์) — ถ้าข้อความว่าง
  // ไปเข้ากฎได้ ลูกค้ากลุ่มนี้จะได้คำตอบมั่ว ๆ ทุกใบ
  it('[blocker] ข้อความว่าง -> ไม่เข้ากฎไหนเลย', () => {
    for (const text of ['', '   ', '\n']) {
      expect(matchCommentRule(text, [rule({ id: 'r1', normalizedPhrases: ['ราคา'] })], CH)).toBeNull()
    }
  })

  // [blocker] `x.includes('')` เป็น true **เสมอ** — กฎที่เผลอมีคำว่างในลิสต์จะกินคอมเมนต์ทุกใบ
  // ทันที (และกินไปจาก fallback ด้วย) นี่คือกับดักที่เงียบที่สุดของทั้งฟีเจอร์
  it('[blocker] กฎที่มีคำว่างในลิสต์ -> ต้องไม่ match ทุกอย่าง', () => {
    const withEmpty = rule({ id: 'r1', normalizedPhrases: ['', '   '] })
    expect(matchCommentRule('อะไรก็ได้', [withEmpty], CH)).toBeNull()
  })

  it('กฎที่มีคำว่างปนกับคำจริง -> ยังใช้คำจริงได้ตามปกติ', () => {
    const mixed = rule({ id: 'r1', normalizedPhrases: ['', 'ผ่อน'] })
    expect(matchCommentRule('ผ่อนได้ไหมครับ', [mixed], CH)?.id).toBe('r1')
    expect(matchCommentRule('ราคาเท่าไหร่', [mixed], CH)).toBeNull()
  })

  // [blocker] D-EXT2-2 — ถ้าเจาะจงเพจไม่ชนะ ตัวเลือก "ต่อเพจ" บนหน้าจอไม่มีความหมายเลย
  it('[blocker] กฎเจาะจงเพจ ชนะกฎ "ทุกเพจ" แม้ priority ต่ำกว่า', () => {
    const all = rule({ id: 'all', shopChannelId: null, priority: 999 })
    const page = rule({ id: 'page', shopChannelId: CH, priority: 1 })
    expect(matchCommentRule('ราคาเท่าไหร่', [all, page], CH)?.id).toBe('page')
    // สลับลำดับใน array แล้วต้องได้ผลเดิม (ไม่พึ่งลำดับที่ query คืนมา)
    expect(matchCommentRule('ราคาเท่าไหร่', [page, all], CH)?.id).toBe('page')
  })

  // [blocker] กฎของเพจอื่นต้องไม่รั่วมาตอบเพจนี้ — ร้านหลายสาขาตั้งราคาคนละแบบ
  it('[blocker] กฎที่ผูกเพจอื่น -> ต้องไม่ถูกเลือก', () => {
    const other = rule({ id: 'other', shopChannelId: OTHER_CH })
    expect(matchCommentRule('ราคาเท่าไหร่', [other], CH)).toBeNull()
  })

  it('priority มากกว่าชนะ เมื่อเจาะจงเพจเท่ากัน', () => {
    const lo = rule({ id: 'lo', priority: 10 })
    const hi = rule({ id: 'hi', priority: 200 })
    expect(matchCommentRule('ราคาเท่าไหร่', [lo, hi], CH)?.id).toBe('hi')
    expect(matchCommentRule('ราคาเท่าไหร่', [hi, lo], CH)?.id).toBe('hi')
  })

  // [blocker] ต้องมีตัวตัดสินที่นิ่ง ไม่งั้นกฎที่ priority เท่ากันจะสลับกันชนะไปมาตามลำดับที่
  // Postgres บังเอิญคืนมา แล้วร้านเห็นคำตอบไม่เหมือนเดิมกับคอมเมนต์ที่หน้าตาเหมือนกัน
  it('[blocker] priority เท่ากัน -> กฎที่เก่ากว่าชนะ และผลไม่ขึ้นกับลำดับใน array', () => {
    const older = rule({ id: 'z-older', createdAt: '2026-08-01T00:00:00.000Z' })
    const newer = rule({ id: 'a-newer', createdAt: '2026-08-10T00:00:00.000Z' })
    expect(matchCommentRule('ราคาเท่าไหร่', [newer, older], CH)?.id).toBe('z-older')
    expect(matchCommentRule('ราคาเท่าไหร่', [older, newer], CH)?.id).toBe('z-older')
  })

  it('createdAt เท่ากันเป๊ะ -> ตัดสินด้วย id (ยังต้องได้ผลเดิมทุกครั้ง)', () => {
    const a = rule({ id: 'aaa' })
    const b = rule({ id: 'bbb' })
    expect(matchCommentRule('ราคาเท่าไหร่', [b, a], CH)?.id).toBe('aaa')
    expect(matchCommentRule('ราคาเท่าไหร่', [a, b], CH)?.id).toBe('aaa')
  })

  it('ไม่มีกฎเลย -> null', () => {
    expect(matchCommentRule('ราคาเท่าไหร่', [], CH)).toBeNull()
  })

  // ใช้ normalizeMessage ตัวจริง — ยืนยันว่าคู่ที่ผู้ใช้พิมพ์จริงเทียบติดหลังผ่านตัว normalize
  // (ข้อความจริงจาก prod: "ราคาเท่าไหล", "เท่าไหร่ครับ", "ชุดนี้เท่าไหร่ครับแบบจ..")
  it('เข้ากับข้อความจริงจาก prod หลัง normalizeMessage', () => {
    const priceRule = rule({ id: 'price', normalizedPhrases: [normalizeMessage('ราคา')] })
    for (const real of ['ราคาเท่าไหล', 'ชุดนี้ราคาเท่าไรครับ', 'ราคาครับแบบนี้เลยวิท']) {
      expect(matchCommentRule(normalizeMessage(real), [priceRule], CH)?.id).toBe('price')
    }
  })

  it('ไม่แก้ไขอาร์เรย์ที่รับเข้ามา', () => {
    const input = [rule({ id: 'b' }), rule({ id: 'a' })]
    const before = input.map((r) => r.id)
    matchCommentRule('ราคาเท่าไหร่', input, CH)
    expect(input.map((r) => r.id)).toEqual(before)
  })
})

describe('ruleHasSomethingToSend', () => {
  // [blocker] กฎที่ match แล้วไม่ทำอะไรเลย จะ "กิน" คอมเมนต์นั้นไปจาก fallback ของเพจด้วย
  // = เงียบกว่าตอนไม่มีกฎเสียอีก ต้องกันตั้งแต่ตอนบันทึก ไม่ใช่ปล่อยให้ไปเงียบตอนรัน
  it('[blocker] ว่างทุกช่อง -> false', () => {
    expect(ruleHasSomethingToSend({})).toBe(false)
    expect(
      ruleHasSomethingToSend({ publicReplyText: '   ', publicReplyFileId: null, privateReplyText: null }),
    ).toBe(false)
  })

  it('มีอย่างใดอย่างหนึ่ง -> true', () => {
    expect(ruleHasSomethingToSend({ publicReplyText: 'ราคา 1,500 ครับ' })).toBe(true)
    expect(ruleHasSomethingToSend({ publicReplyFileId: 'file-1' })).toBe(true)
    expect(ruleHasSomethingToSend({ privateReplyText: 'ทักมาได้เลยครับ' })).toBe(true)
  })
})
