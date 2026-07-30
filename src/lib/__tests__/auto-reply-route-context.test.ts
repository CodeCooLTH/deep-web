import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// mock dependency ที่ module นี้ import ตอน top-level — เทสนี้แตะเฉพาะ mapServiceError (pure)
// ถ้าไม่ mock จะลาก prisma/next-auth เข้ามาโดยไม่จำเป็นและพังเวลา env ไม่ครบ
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/shop-context', () => ({ resolveActiveShopContext: vi.fn() }))

import { mapServiceError } from '@/lib/auto-reply-route-context'

const FALLBACK = 'บันทึกไม่สำเร็จ'

/** เรียก mapServiceError แล้วแกะ status + ข้อความจาก NextResponse ที่คืนมา */
async function mapped(code: string) {
  const res = mapServiceError(new Error(code), FALLBACK)
  const body = (await res.json()) as { error: string }
  return { status: res.status, error: body.error }
}

/** ตารางความจริงตาม Scope Baseline 00023-v3 (S-02) — 12 รหัสที่ service โยนจริง */
const CASES: ReadonlyArray<readonly [code: string, status: number, error: string]> = [
  [
    'AUTO_REPLY_KEYWORD_NO_PHRASE',
    400,
    'เปิดใช้ไม่ได้ — กลุ่มนี้ยังไม่มีคำตรวจจับ เพิ่มอย่างน้อย 1 คำก่อน',
  ],
  [
    'AUTO_REPLY_KEYWORD_NO_ANSWER',
    400,
    'เปิดใช้ไม่ได้ — ยังไม่มีข้อความตอบกลับ ใส่คำตอบใน "ทุกกรณีที่เหลือ" ก่อน',
  ],
  [
    'AUTO_REPLY_KEYWORD_NO_TEST_THREAD',
    400,
    'ยังตั้งเป็นโหมดทดสอบไม่ได้ — เลือกแชทสำหรับทดสอบอย่างน้อย 1 แชทก่อน',
  ],
  [
    'AUTO_REPLY_KEYWORD_LAST_PHRASE',
    400,
    'ลบคำสุดท้ายไม่ได้ตอนกลุ่มนี้ยังทำงานอยู่ — เปลี่ยนเป็น "ไม่ใช้งาน" ก่อน หรือเพิ่มคำอื่นแทน',
  ],
  [
    'AUTO_REPLY_KEYWORD_LAST_ANSWER',
    400,
    'ลบคำตอบสุดท้ายไม่ได้ตอนกลุ่มนี้ยังทำงานอยู่ — ต้องเหลือคำตอบไว้อย่างน้อย 1 ข้อ',
  ],
  ['AUTO_REPLY_KEYWORD_NAME_EMPTY', 400, 'ตั้งชื่อกลุ่มคำก่อนบันทึก'],
  ['AUTO_REPLY_KEYWORD_NAME_TOO_LONG', 400, 'ชื่อกลุ่มคำยาวเกินกำหนด ย่อให้สั้นลง'],
  [
    'AUTO_REPLY_KEYWORD_NAME_DUPLICATE',
    409,
    'ชื่อนี้ใช้กับกลุ่มคำอื่นในร้านแล้ว ตั้งชื่ออื่นที่ไม่ซ้ำ',
  ],
  [
    'AUTO_REPLY_KEYWORD_DUPLICATE_NAME_EXHAUSTED',
    409,
    'ทำสำเนาไม่ได้ — มีกลุ่มคำชื่อคล้ายกันมากเกินไป เปลี่ยนชื่อต้นทางก่อน',
  ],
  [
    'AUTO_REPLY_RULE_AD_REQUIRES_CHANNEL',
    400,
    'เงื่อนไขที่ระบุโฆษณาต้องระบุเพจด้วย — เลือกเพจที่โฆษณานั้นวิ่งอยู่',
  ],
  [
    'AUTO_REPLY_RULE_CENTRAL_CANNOT_HAVE_AD_OR_PRODUCT',
    400,
    'เงื่อนไขระดับร้านระบุโฆษณาหรือสินค้าไม่ได้',
  ],
  [
    'AUTO_REPLY_RULE_CONDITION_DUPLICATE',
    409,
    'มีเงื่อนไขเฉพาะที่ใช้เงื่อนไขชุดนี้อยู่แล้ว — แก้ข้อเดิมแทนการเพิ่มข้อใหม่',
  ],
]

describe('mapServiceError', () => {
  describe('12 รหัสที่ service โยนจริง ต้องได้ status + ข้อความไทยตรงตาราง', () => {
    for (const [code, status, error] of CASES) {
      it(`${code} → ${status}`, async () => {
        expect(await mapped(code)).toEqual({ status, error })
      })
    }
  })

  describe('บั๊ก substring order (เหตุผลที่เปลี่ยนมาใช้ exact-match table)', () => {
    // เดิม guard `includes('DUPLICATE_NAME')` อยู่ก่อน `includes('DUPLICATE')` แต่รหัสจริงคือ
    // `..._NAME_DUPLICATE` (ลำดับคำกลับกัน) → หลุดไปสาขา generic
    it('NAME_DUPLICATE ต้องไม่ได้ข้อความ generic "รายการนี้ซ้ำกับที่มีอยู่แล้ว"', async () => {
      const r = await mapped('AUTO_REPLY_KEYWORD_NAME_DUPLICATE')
      expect(r.error).not.toBe('รายการนี้ซ้ำกับที่มีอยู่แล้ว')
      expect(r.error).toBe('ชื่อนี้ใช้กับกลุ่มคำอื่นในร้านแล้ว ตั้งชื่ออื่นที่ไม่ซ้ำ')
    })

    it('DUPLICATE_NAME_EXHAUSTED ต้องไม่ได้ข้อความ "ชื่อกลุ่มคำนี้มีอยู่แล้วในร้าน" (ผิดเรื่อง)', async () => {
      const r = await mapped('AUTO_REPLY_KEYWORD_DUPLICATE_NAME_EXHAUSTED')
      expect(r.error).not.toBe('ชื่อกลุ่มคำนี้มีอยู่แล้วในร้าน')
      expect(r.error).toBe('ทำสำเนาไม่ได้ — มีกลุ่มคำชื่อคล้ายกันมากเกินไป เปลี่ยนชื่อต้นทางก่อน')
    })

    it('CONDITION_DUPLICATE ต้องได้ข้อความของตัวเอง ไม่ใช่ generic', async () => {
      const r = await mapped('AUTO_REPLY_RULE_CONDITION_DUPLICATE')
      expect(r.error).not.toBe('รายการนี้ซ้ำกับที่มีอยู่แล้ว')
      expect(r.error).toBe('มีเงื่อนไขเฉพาะที่ใช้เงื่อนไขชุดนี้อยู่แล้ว — แก้ข้อเดิมแทนการเพิ่มข้อใหม่')
    })

    it('3 รหัสที่มีคำ DUPLICATE ต้องได้ข้อความคนละอันทั้งหมด (ไม่ทับกัน)', async () => {
      const msgs = await Promise.all(
        [
          'AUTO_REPLY_KEYWORD_NAME_DUPLICATE',
          'AUTO_REPLY_KEYWORD_DUPLICATE_NAME_EXHAUSTED',
          'AUTO_REPLY_RULE_CONDITION_DUPLICATE',
        ].map(async (c) => (await mapped(c)).error),
      )
      expect(new Set(msgs).size).toBe(3)
    })
  })

  describe('NOT_FOUND — เทียบ suffix เพราะมีหลาย prefix', () => {
    const notFoundCodes = [
      'AUTO_REPLY_KEYWORD_NOT_FOUND',
      'AUTO_REPLY_PHRASE_NOT_FOUND',
      'AUTO_REPLY_RULE_NOT_FOUND',
      'AUTO_REPLY_RULE_CHANNEL_NOT_FOUND',
      'AUTO_REPLY_RULE_PRODUCT_NOT_FOUND',
    ]
    for (const code of notFoundCodes) {
      it(`${code} → 404`, async () => {
        expect(await mapped(code)).toEqual({ status: 404, error: 'ไม่พบรายการที่ต้องการ' })
      })
    }
  })

  it('AUTO_REPLY_RULE_EMPTY_REPLY → 400 คำตอบต้องไม่เป็นค่าว่าง', async () => {
    expect(await mapped('AUTO_REPLY_RULE_EMPTY_REPLY')).toEqual({
      status: 400,
      error: 'คำตอบต้องไม่เป็นค่าว่าง',
    })
  })

  describe('สาขาตายที่ถูกลบแล้ว — ต้องตกไป fallback ไม่ใช่มีข้อความของตัวเอง', () => {
    // service ไม่เคยโยนสองรหัสนี้ (ของจริง = NO_PHRASE / NO_ANSWER) ถ้ามีสาขารับอยู่แสดงว่า
    // ยังไม่ได้ลบตาม S-02
    let spy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
      spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => spy.mockRestore())

    it('AUTO_REPLY_KEYWORD_REQUIRES_PHRASE → 500 fallback', async () => {
      expect(await mapped('AUTO_REPLY_KEYWORD_REQUIRES_PHRASE')).toEqual({
        status: 500,
        error: FALLBACK,
      })
    })

    it('AUTO_REPLY_KEYWORD_REQUIRES_REPLY → 500 fallback', async () => {
      expect(await mapped('AUTO_REPLY_KEYWORD_REQUIRES_REPLY')).toEqual({
        status: 500,
        error: FALLBACK,
      })
    })
  })

  describe('fallback 500', () => {
    let spy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
      spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => spy.mockRestore())

    it('รหัสที่ไม่รู้จัก → 500 + fallbackMessage + log ไว้ให้ debug', async () => {
      expect(await mapped('SOMETHING_UNEXPECTED')).toEqual({ status: 500, error: FALLBACK })
      expect(spy).toHaveBeenCalledWith('[auto-reply-api]', 'SOMETHING_UNEXPECTED')
    })

    it('ค่าที่ไม่ใช่ Error (throw string) ก็ยัง 500 ไม่ระเบิด', async () => {
      const res = mapServiceError('ระเบิดกลางทาง', FALLBACK)
      expect(res.status).toBe(500)
      expect(((await res.json()) as { error: string }).error).toBe(FALLBACK)
    })

    it('รหัสที่มีคำ NOT_FOUND อยู่กลางสตริงต้องไม่หลุดเป็น 404 (endsWith ไม่ใช่ includes)', async () => {
      expect((await mapped('AUTO_REPLY_NOT_FOUND_SOMETHING_ELSE')).status).toBe(500)
    })

    /**
     * เคยเป็นช่อง fail-open: ตอนที่ตารางเป็น object literal การ lookup ด้วยชื่อ method ของ
     * prototype จะคืนฟังก์ชัน (truthy) แต่ `.status` เป็น undefined → NextResponse ให้ 200
     * body ว่าง = error กลายเป็น success เงียบ ๆ และไม่มี log. เปลี่ยนตารางเป็น Map แล้ว
     * เทสนี้กันการถอยกลับไปใช้ object literal
     */
    it.each(['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__'])(
      'ชื่อ prototype key (%s) ต้องได้ 500 ไม่ใช่ 200',
      async (key) => {
        const res = await mapped(key)
        expect(res.status).toBe(500)
        expect(res.error).toBe(FALLBACK)
      },
    )

    /**
     * suffix rule บังคับ prefix AUTO_REPLY_ ร่วม — รหัส NOT_FOUND ของฟีเจอร์อื่นที่หลุดเข้ามา
     * ต้องได้ 500 + log ไม่ใช่ 404 เงียบ ๆ ที่ debug ไม่ได้
     */
    it('SHOP_NOT_FOUND (คนละฟีเจอร์) ต้องได้ 500 + log ไม่ใช่ 404', async () => {
      expect((await mapped('SHOP_NOT_FOUND')).status).toBe(500)
      expect(spy).toHaveBeenCalledWith('[auto-reply-api]', 'SHOP_NOT_FOUND')
    })
  })
})
