import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ICE_BREAKER_MAX,
  ICE_BREAKER_QUESTION_MAX,
  iceBreakerPayload,
  parseIceBreakerPayload,
  validateIceBreakers,
} from '@/lib/ice-breaker'

const ok = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ question: `คำถาม ${i}`, answer: `คำตอบ ${i}` }))

const CH = '5f0a1b2c-3d4e-4f50-8a9b-0c1d2e3f4a5b'

describe('[blocker] payload ของ Ice Breaker', () => {
  it('ไป-กลับได้ค่าเดิมทั้งช่องทางและลำดับ', () => {
    for (let i = 0; i < ICE_BREAKER_MAX; i++) {
      expect(parseIceBreakerPayload(iceBreakerPayload(CH, i))).toEqual({
        shopChannelId: CH,
        order: i,
      })
    }
  })

  it('payload ของฟีเจอร์อื่นต้องไม่ถูกตีเป็น Ice Breaker', () => {
    // postback มาจากหลายที่ (Get Started · ปุ่มใน template · persistent menu) — ถ้าไม่มี prefix
    // แล้ววันหนึ่ง payload ของฟีเจอร์อื่นบังเอิญตรงกับค่าของเรา จะตอบคำถามผิดใบโดยไม่มีอะไรฟ้อง
    for (const p of ['GET_STARTED', CH, `${CH}:0`, 'ICEBREAKER', 'ICEBREAKER:', '', null, undefined]) {
      expect(parseIceBreakerPayload(p as string), String(p)).toBeNull()
    }
  })

  it('[blocker] ลำดับที่หลุดกรอบ = ไม่ใช่ของเรา (ห้ามเอาไปค้นฐาน)', () => {
    // ค่าพวกนี้มาจากภายนอกล้วน — ผ่านเข้าไปได้แปลว่ายอมให้ใครก็ตามยิงคีย์อะไรก็ได้เข้า findUnique
    for (const bad of ['-1', '4', '99', 'x', '', '1.5', ' ']) {
      expect(parseIceBreakerPayload(`ICEBREAKER:${CH}:${bad}`), bad).toBeNull()
    }
  })

  it('[blocker] ช่องทางว่าง = ไม่ใช่ของเรา', () => {
    expect(parseIceBreakerPayload('ICEBREAKER::0')).toBeNull()
    expect(parseIceBreakerPayload('ICEBREAKER:   :0')).toBeNull()
  })
})

describe('[blocker] validateIceBreakers', () => {
  it('ชุดว่าง = ผ่าน (แปลว่าลบทั้งชุด)', () => {
    expect(validateIceBreakers([])).toEqual({ ok: true, items: [] })
  })

  it(`เกิน ${ICE_BREAKER_MAX} ข้อ = ไม่ผ่าน (เพดานของ Meta)`, () => {
    expect(validateIceBreakers(ok(ICE_BREAKER_MAX)).ok).toBe(true)
    expect(validateIceBreakers(ok(ICE_BREAKER_MAX + 1)).ok).toBe(false)
  })

  it('ข้อที่เว้นว่าง = ไม่ผ่าน (ปุ่มเปล่าที่กดแล้วไม่มีอะไรเกิดขึ้น)', () => {
    expect(validateIceBreakers([{ question: '  ', answer: 'ก' }]).ok).toBe(false)
    expect(validateIceBreakers([{ question: 'ก', answer: '   ' }]).ok).toBe(false)
  })

  it('ตัดช่องว่างหัวท้ายก่อนบันทึก', () => {
    const r = validateIceBreakers([{ question: '  เปิดกี่โมง  ', answer: '  9 โมง  ' }])
    expect(r).toMatchObject({ ok: true, items: [{ question: 'เปิดกี่โมง', answer: '9 โมง' }] })
  })

  it('คำถามซ้ำ = ไม่ผ่าน (ลูกค้าเห็นปุ่มเหมือนกันสองใบ)', () => {
    expect(validateIceBreakers([
      { question: 'เปิดกี่โมง', answer: 'ก' },
      { question: 'เปิดกี่โมง', answer: 'ข' },
    ]).ok).toBe(false)
    // ต่างแค่ตัวพิมพ์/ช่องว่าง ก็ยังถือว่าซ้ำ
    expect(validateIceBreakers([
      { question: 'Open?', answer: 'ก' },
      { question: '  open?  ', answer: 'ข' },
    ]).ok).toBe(false)
  })

  it('[blocker] นับความยาวด้วย code point ไม่ใช่ .length', () => {
    // 🛑 ตัวอย่างต้องเป็นอักขระ **นอก BMP** (surrogate pair) — ภาษาไทยอยู่ใน BMP ทั้งหมด
    // `.length` กับจำนวน code point จึงเท่ากันเป๊ะ ⇒ ใช้ไทยเป็นตัวอย่างแล้ว mutation ที่เปลี่ยนเป็น
    // `.length` **ยังเขียว** (เกิดขึ้นจริงกับเทสฉบับแรกของไฟล์นี้)
    // ผู้ขายพิมพ์อิโมจิในคำถามได้จริง — HR12 ห้าม emoji ใน UI ของเรา ไม่ได้ห้ามข้อความของผู้ขาย
    const glyph = '\u{1F6F5}' // 🛵 = 2 code units แต่คนเห็นตัวเดียว
    expect(glyph.length).toBe(2)
    expect(Array.from(glyph).length).toBe(1)

    const atCap = glyph.repeat(ICE_BREAKER_QUESTION_MAX)
    expect(Array.from(atCap).length).toBe(ICE_BREAKER_QUESTION_MAX)
    // นับถูก = พอดีเพดาน ผ่าน · นับด้วย .length = ได้ 2 เท่า ตีตกทั้งที่ยังไม่เกิน
    expect(validateIceBreakers([{ question: atCap, answer: 'ก' }]).ok).toBe(true)
    expect(validateIceBreakers([{ question: atCap + glyph, answer: 'ก' }]).ok).toBe(false)
  })

  it('คำตอบยาวเกินเพดาน = ไม่ผ่าน', () => {
    expect(validateIceBreakers([{ question: 'ก', answer: 'x'.repeat(1001) }]).ok).toBe(false)
    expect(validateIceBreakers([{ question: 'ก', answer: 'x'.repeat(1000) }]).ok).toBe(true)
  })

  it('ข้อความ error ต้องบอกสิ่งที่ต้องแก้ ไม่ใช่แค่ว่าผิด', () => {
    const r = validateIceBreakers(ok(ICE_BREAKER_MAX + 1))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(new RegExp(String(ICE_BREAKER_MAX)))
  })
})

/**
 * [blocker] การต่อสายใน webhook — สแกนซอร์ส เพราะตรรกะอยู่กลาง route ที่แยกออกมาเรียกตรง ๆ ไม่ได้
 */
describe('[blocker] Ice Breakers ใน webhook', () => {
  const src = () =>
    readFileSync(join(process.cwd(), 'src/app/api/channels/facebook/webhook/route.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')

  it('ตอบเฉพาะ postback ที่เป็นของ Ice Breaker (ไม่ใช่ Get Started/ปุ่มใน template)', () => {
    expect(src()).toMatch(/if \(parseIceBreakerPayload\(ibPayload\)\)/)
  })

  it('บันทึกคำถามผ่าน ingestInboundMessage ตัวเดิม ไม่เขียนแถวเอง', () => {
    const s = src()
    // เขียนแถวเอง = ก็อปตรรกะกันซ้ำ/preview/แจ้งเตือนมาไว้อีกที่ แล้วมันจะ drift
    expect(s).toMatch(/ingestInboundMessage\(\{[\s\S]{0,220}message: \{ mid, text: title \}/)
  })

  it('[blocker] ไม่มี mid = ไม่บันทึก (ห้ามประกอบ id เอง — externalMessageId เป็น @unique)', () => {
    // ชนกับ mid จริงเมื่อไหร่ ข้อความจริงของลูกค้าจะเขียนไม่ลงทั้งใบ
    expect(src()).toMatch(/if \(title && mid\)/)
  })

  it('ตอบใน after() ไม่ให้ webhook ค้างรอ Meta (Meta retry ทั้ง batch ถ้าตอบช้า)', () => {
    expect(src()).toMatch(/after\(\(\) =>\s*\n?\s*answerIceBreaker\(/)
  })

  it('postback schema ต้องเก็บ mid ไว้ ไม่งั้นค่าไปไม่ถึง route', () => {
    const schema = readFileSync(join(process.cwd(), 'src/lib/facebook/webhook-types.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
    const pb = schema.slice(schema.indexOf('postback: v.optional'), schema.indexOf('postback: v.optional') + 300)
    expect(pb).toMatch(/mid: v\.optional\(v\.string\(\)\)/)
  })
})

/**
 * [blocker] ลำดับการบันทึก — ยิง Meta ก่อน สำเร็จแล้วจึงเขียน DB
 *
 * ลำดับกลับด้านทำให้ฐานมีคำถามชุดใหม่ทั้งที่ลูกค้ายังเห็นชุดเก่า แล้วหน้าจอรายงานว่า "ลูกค้าเห็นอยู่"
 * ซึ่งไม่จริง — และย้อนกลับไม่ได้เพราะทรานแซกชันปิดไปแล้ว
 */
describe('[blocker] saveIceBreakers ยิง Meta ก่อนเขียน DB', () => {
  const fn = () => {
    const s = readFileSync(join(process.cwd(), 'src/services/channel-chat.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
    return s.slice(s.indexOf('export async function saveIceBreakers'), s.indexOf('export async function answerIceBreaker'))
  }

  it('setIceBreakers/deleteIceBreakers ต้องมาก่อน channelIceBreaker.createMany', () => {
    const body = fn()
    const meta = Math.min(
      ...[body.indexOf('setIceBreakers('), body.indexOf('deleteIceBreakers(')].filter((i) => i > -1),
    )
    const write = body.indexOf('channelIceBreaker.deleteMany')
    expect(meta).toBeGreaterThan(-1)
    expect(write).toBeGreaterThan(-1)
    expect(meta).toBeLessThan(write)
  })

  it('payload ที่ส่ง Meta ประกอบจาก (ช่องทาง, ลำดับ) ไม่ใช่ id ของแถว', () => {
    // ใช้ id ของแถว = ต้องเขียน DB ก่อนถึงจะรู้ค่า = บังคับลำดับที่ผิดกลับมาเอง
    expect(fn()).toMatch(/iceBreakerPayload\(channel\.id, i\)/)
  })

  it('[blocker] answerIceBreaker ต้องเทียบช่องทางใน payload กับเพจที่ webhook มาจากจริง', () => {
    const s = readFileSync(join(process.cwd(), 'src/services/channel-chat.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
    const body = s.slice(s.indexOf('export async function answerIceBreaker'))
    // postback รับค่าจากภายนอกล้วน — ไม่เทียบ = ใครเดา payload ได้ก็สั่งให้เราส่งคำตอบของร้านอื่นได้
    const guard = body.indexOf('channel.id !== ref.shopChannelId')
    const lookup = body.indexOf('channelIceBreaker.findUnique')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(lookup)
  })
})
