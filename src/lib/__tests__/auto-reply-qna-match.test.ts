// feature 00023 phase `00023-qna` S-03 — เทสของ matchQna (SRS TFR-031, DATABASE §3.9.1)
//
// เทสทั้งไฟล์เป็น unit test ของฟังก์ชันบริสุทธิ์ — ไม่แตะ DB ไม่มี import Prisma
// (Hard Rule 13: ไฟล์เทสห้ามมีคำสั่งลบข้อมูลใด ๆ — ไฟล์นี้ไม่ต่อฐานข้อมูลเลย)

import { describe, it, expect } from 'vitest'
import { matchQna, type QnaSetItem, type QnaMatchKeyword } from '@/lib/auto-reply-qna-match'
import { normalizeMessage } from '@/lib/auto-reply-normalize'

/** ตัวช่วยสร้างข้อในคลัง — normalizedQuestion คำนวณด้วยฟังก์ชันจริง ไม่ hardcode
 *  (ถ้า normalizeMessage เปลี่ยนพฤติกรรม เทสชุดนี้ต้องพังให้เห็น ไม่ใช่ผ่านไปเงียบ ๆ) */
function qna(over: Partial<QnaSetItem> & { id: string; keywordId: string; question: string }): QnaSetItem {
  return {
    answer: 'คำตอบ',
    imageFileIds: [],
    isActive: true,
    useCount: 0,
    normalizedQuestion: normalizeMessage(over.question),
    ...over,
  }
}

const KW_A: QnaMatchKeyword = { id: 'kw-a', priority: 100 }
const KW_B: QnaMatchKeyword = { id: 'kw-b', priority: 200 }

describe('matchQna — โหมด EXACT (v1)', () => {
  it('ตรงตัวทุกอักษรหลัง normalize → คืนข้อนั้น', () => {
    const set = [qna({ id: 'q1', keywordId: 'kw-a', question: 'สอบถามรายละเอียด', answer: 'ยินดีครับ' })]
    const r = matchQna(normalizeMessage('สอบถามรายละเอียด'), set, [KW_A])
    expect(r).not.toBeNull()
    expect(r!.qna.id).toBe('q1')
    expect(r!.keywordId).toBe('kw-a')
    expect(r!.method).toBe('EXACT')
  })

  it('ต่างกันแค่วรรคตอน/ช่องว่าง/ตัวพิมพ์ → ยังตรง (เพราะ normalize ตัวเดียวกันทั้งสองฝั่ง)', () => {
    const set = [qna({ id: 'q1', keywordId: 'kw-a', question: 'สอบถามรายละเอียด' })]
    // ข้อความลูกค้าจริงจาก ice-breaker มักมีจุด/ช่องว่างเกินติดมา
    expect(matchQna(normalizeMessage('สอบถามรายละเอียด...'), set, [KW_A])?.qna.id).toBe('q1')
    expect(matchQna(normalizeMessage('  สอบถามรายละเอียด  '), set, [KW_A])?.qna.id).toBe('q1')
  })

  it('เป็นแค่ส่วนหนึ่งของข้อความลูกค้า → ไม่ตรง (EXACT ไม่ใช่ CONTAINS)', () => {
    const set = [qna({ id: 'q1', keywordId: 'kw-a', question: 'ราคาเท่าไหร่' })]
    expect(matchQna(normalizeMessage('ราคาเท่าไหร่ครับ'), set, [KW_A])).toBeNull()
    expect(matchQna(normalizeMessage('พอดีอยากถามว่าราคาเท่าไหร่'), set, [KW_A])).toBeNull()
  })
})

describe('matchQna — เงื่อนไขที่ทำให้ข้อ "เงียบ"', () => {
  it('ข้อที่ปิดอยู่ (isActive=false) ไม่ถูกเลือก', () => {
    const set = [qna({ id: 'q1', keywordId: 'kw-a', question: 'ค่าส่งเท่าไหร่', isActive: false })]
    expect(matchQna(normalizeMessage('ค่าส่งเท่าไหร่'), set, [KW_A])).toBeNull()
  })

  it('ข้อของกลุ่มที่ไม่ได้อยู่ในรายการกลุ่มที่ทำงาน (= OFFLINE) ไม่ถูกเลือก', () => {
    // นี่คือกลไกที่ทำให้ "QnA ของกลุ่ม OFFLINE ต้องไม่ตอบใคร" เป็นจริง — caller ส่งเฉพาะ
    // กลุ่มที่ไม่ใช่ OFFLINE เข้ามา ข้อที่ keywordId ไม่อยู่ใน list จึงถูกตัดทิ้ง
    const set = [qna({ id: 'q1', keywordId: 'kw-offline', question: 'ค่าส่งเท่าไหร่' })]
    expect(matchQna(normalizeMessage('ค่าส่งเท่าไหร่'), set, [KW_A, KW_B])).toBeNull()
  })

  it('ข้อความว่างหลัง normalize ไม่ match อะไรเลย แม้คลังจะมีข้อที่ normalizedQuestion ว่าง', () => {
    const broken: QnaSetItem = {
      id: 'q-broken',
      keywordId: 'kw-a',
      question: '!!!',
      normalizedQuestion: '',
      answer: 'ไม่ควรถูกส่ง',
      imageFileIds: [],
      isActive: true,
      useCount: 999,
    }
    expect(matchQna(normalizeMessage('!!!'), [broken], [KW_A])).toBeNull()
    expect(matchQna('', [broken], [KW_A])).toBeNull()
    // และต้องไม่ถูกเลือกโดยข้อความอื่นด้วย
    expect(matchQna(normalizeMessage('สวัสดี'), [broken], [KW_A])).toBeNull()
  })

  it('คลังว่าง หรือไม่มีกลุ่มที่ทำงานอยู่เลย → null (ไม่ throw)', () => {
    expect(matchQna(normalizeMessage('อะไรก็ได้'), [], [KW_A])).toBeNull()
    expect(matchQna(normalizeMessage('อะไรก็ได้'), [qna({ id: 'q1', keywordId: 'kw-a', question: 'x' })], [])).toBeNull()
  })
})

describe('matchQna — ตัวตัดสินเมื่อคำถามเดียวกันอยู่หลายกลุ่ม (DATABASE §3.9.1)', () => {
  const Q = 'ค่าส่งต่างจังหวัดคิดยังไง'

  it('เกณฑ์ 1: keyword.priority มากกว่าชนะ', () => {
    const set = [
      qna({ id: 'q-a', keywordId: 'kw-a', question: Q, useCount: 50 }), // priority 100
      qna({ id: 'q-b', keywordId: 'kw-b', question: Q, useCount: 0 }), // priority 200
    ]
    const r = matchQna(normalizeMessage(Q), set, [KW_A, KW_B])
    expect(r!.qna.id).toBe('q-b')
    expect(r!.keywordId).toBe('kw-b')
  })

  it('เกณฑ์ 2: priority เท่ากัน → useCount มากกว่าชนะ', () => {
    const kwC: QnaMatchKeyword = { id: 'kw-c', priority: 100 }
    const set = [
      qna({ id: 'q-a', keywordId: 'kw-a', question: Q, useCount: 3 }),
      qna({ id: 'q-c', keywordId: 'kw-c', question: Q, useCount: 31 }),
    ]
    expect(matchQna(normalizeMessage(Q), set, [KW_A, kwC])!.qna.id).toBe('q-c')
  })

  it('เกณฑ์ 3: เท่ากันหมด → id น้อยกว่าชนะ และผลต้องซ้ำเดิมไม่ว่าลำดับ input จะสลับยังไง', () => {
    const kwC: QnaMatchKeyword = { id: 'kw-c', priority: 100 }
    const a = qna({ id: 'q-aaa', keywordId: 'kw-a', question: Q, useCount: 7 })
    const c = qna({ id: 'q-zzz', keywordId: 'kw-c', question: Q, useCount: 7 })

    // ลำดับที่ DB คืนแถวมาไม่ควรมีผลกับคำตอบ (AC-011-03 หลักเดียวกัน)
    expect(matchQna(normalizeMessage(Q), [a, c], [KW_A, kwC])!.qna.id).toBe('q-aaa')
    expect(matchQna(normalizeMessage(Q), [c, a], [KW_A, kwC])!.qna.id).toBe('q-aaa')
    expect(matchQna(normalizeMessage(Q), [c, a], [kwC, KW_A])!.qna.id).toBe('q-aaa')
  })
})

describe('matchQna — คุณสมบัติที่ต้องคงไว้', () => {
  it('เป็นฟังก์ชันบริสุทธิ์: เรียกซ้ำด้วย input เดิมได้ผลเดิม และไม่แก้ไข input', () => {
    const set = [
      qna({ id: 'q1', keywordId: 'kw-a', question: 'ราคา', useCount: 1 }),
      qna({ id: 'q2', keywordId: 'kw-b', question: 'ราคา', useCount: 9 }),
    ]
    const snapshot = JSON.stringify(set)
    const first = matchQna(normalizeMessage('ราคา'), set, [KW_A, KW_B])
    const second = matchQna(normalizeMessage('ราคา'), set, [KW_A, KW_B])
    expect(first!.qna.id).toBe(second!.qna.id)
    // sort ต้องไม่ไปเรียง array ของ caller (candidates เป็น array ใหม่)
    expect(JSON.stringify(set)).toBe(snapshot)
  })

  it('ส่งรูปแนบกลับมาครบตามที่ตั้งไว้', () => {
    const set = [qna({ id: 'q1', keywordId: 'kw-a', question: 'ดูรูปหน่อย', imageFileIds: ['f1', 'f2'] })]
    expect(matchQna(normalizeMessage('ดูรูปหน่อย'), set, [KW_A])!.qna.imageFileIds).toEqual(['f1', 'f2'])
  })

  it('โหมดที่ยังไม่ implement ต้อง throw ไม่ใช่เงียบ', () => {
    const set = [qna({ id: 'q1', keywordId: 'kw-a', question: 'x' })]
    // จำลองกรณีมีคนเพิ่มค่าใน QNA_MATCH_MODES แล้วลืมเขียนสาขา
    expect(() =>
      matchQna(normalizeMessage('x'), set, [KW_A], { mode: 'SIMILARITY' as never })
    ).toThrow(/ยังไม่ถูก implement/)
  })
})

describe('matchQna — เคสจริงจาก prod (ice-breaker โฆษณา Meta)', () => {
  // 4 ข้อความนี้คิดเป็น 170/401 = 42% ของ NO_KEYWORD_MATCH ทั้งหมด ณ 2026-07-31
  // และเป็นเหตุผลที่ user เลือก "ตรงตัวก่อน ความคล้ายเปิดทีหลัง" (A1)
  const REAL = ['สอบถามรายละเอียด', 'สนใจทำไฟหน้า', 'สอบถามโปรโมชั่น', 'ราคาโช้คหลังเวฟเท่าไหร่']

  it('ทั้ง 4 ข้อความจับได้ด้วยการตรงตัวล้วน', () => {
    const set = REAL.map((q, i) => qna({ id: `q${i}`, keywordId: 'kw-a', question: q, answer: `ตอบ ${q}` }))
    for (const [i, text] of REAL.entries()) {
      const r = matchQna(normalizeMessage(text), set, [KW_A])
      expect(r, `ควรจับ "${text}" ได้`).not.toBeNull()
      expect(r!.qna.id).toBe(`q${i}`)
    }
  })
})
