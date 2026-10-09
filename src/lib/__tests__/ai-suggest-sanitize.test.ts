import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PiiVault } from '../pii-redact'

// ตัวสวิตช์ mutation: ชนิดที่ "ปิดบังไม่ทำงาน" — ทำโดยคืนค่าจริงแทนป้ายของชนิดนั้นหลังตัวจริงทำงาน
const mutation = vi.hoisted(() => ({ label: null as string | null }))
vi.mock('../pii-redact', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../pii-redact')>()
  return {
    ...orig,
    redactPiiReversible: (input: string, vault: PiiVault) => {
      const r = orig.redactPiiReversible(input, vault)
      if (mutation.label) {
        const re = new RegExp(`\\[${mutation.label}#\\d+\\]`, 'g')
        r.text = r.text.replace(re, (tok) => vault.table.get(tok) ?? tok)
      }
      return r
    },
  }
})

import { sanitizeForExternalAi, SanitizeError, type SanitizeInput } from '../ai-suggest-sanitize'
import { buildSuggestTurns } from '../ai-suggest-turns'
import { restorePii } from '../pii-redact'

beforeEach(() => {
  mutation.label = null
})

const PHONES = [
  '0812345678', '081-234-5678', '081 234 5678', '+66812345678', '+66 81 234 5678',
  '+66-81-234-5678', '02-123-4567', '0-2123-4567', '021234567', '098 765 4321',
]
const NID = '1-2345-67890-12-3'
const EMAIL = 'somchai.k@example.co.th'
const ACCT = ['1234567890', '123456789012', '123456789012345']
const ADDR = 'ส่งที่ 99/9 หมู่ 3 ซอยสุขุมวิท 5 ต.บางนา อ.บางนา กทม. 10260'

const base = (texts: string[], over: Partial<SanitizeInput> = {}): SanitizeInput => ({
  turns: texts.map((text) => ({ role: 'BUYER' as const, text })),
  shopName: 'ร้านทดสอบ',
  knownCustomerNames: [],
  adminNames: [],
  ...over,
})
const all = (o: ReturnType<typeof sanitizeForExternalAi>) =>
  JSON.stringify([o.turns, o.shopName, o.instruction, o.contextBlock, o.customerNote, o.customerName])
const digits = (s: string) => s.replace(/\D/g, '')

// คืน true ถ้าชนิด `kind` รั่ว (sanitize ไม่โยน + payload ยังมีค่าจริง) — ใช้ทั้งเทสปกติ (ต้อง false) และ mutation (ต้อง true)
const SAMPLES: Record<string, { label: string; values: string[]; wrap: (v: string) => string }> = {
  PHONE: { label: 'เบอร์โทร', values: PHONES, wrap: (v) => `โทรมาที่ ${v} ด้วยนะ` },
  NATIONAL_ID: { label: 'เลขบัตรประชาชน', values: [NID, '1234567890123'], wrap: (v) => `บัตร ${v} ครับ` },
  EMAIL: { label: 'อีเมล', values: [EMAIL], wrap: (v) => `ส่งเมล ${v} ได้เลย` },
  BANK_ACCOUNT: { label: 'เลขบัญชี', values: ACCT, wrap: (v) => `โอนเข้า ${v}` },
  ADDRESS: { label: 'ที่อยู่', values: [ADDR], wrap: (v) => v },
}
function leaks(kind: string): boolean {
  const s = SAMPLES[kind]
  for (const v of s.values) {
    let out
    try {
      out = sanitizeForExternalAi(base([s.wrap(v)]), 'typhoon')
    } catch (e) {
      if (e instanceof SanitizeError) continue // ด่านกันซ้ำจับได้ = ไม่รั่ว (fail-closed)
      throw e
    }
    const payload = all(out)
    const needle = kind === 'ADDRESS' ? '10260' : digits(v) ? v : v
    if (payload.includes(needle) || (kind !== 'ADDRESS' && kind !== 'EMAIL' && payload.includes(digits(v)))) return true
  }
  return false
}

describe('sanitizeForExternalAi — corpus', () => {
  it.each(Object.keys(SAMPLES))('ชนิด %s ไม่รั่วทุกรูปแบบ', (kind) => {
    expect(leaks(kind)).toBe(false)
  })

  it('เบอร์ 10 รูปแบบหายหมด + restore คืนค่าได้', () => {
    for (const p of PHONES) {
      const o = sanitizeForExternalAi(base([`ติดต่อ ${p} นะ`]), 'typhoon')
      expect(o.turns[0].text).toBe('ติดต่อ [เบอร์โทร#1] นะ')
      expect(restorePii(o.turns[0].text, o.vault).text).toBe(`ติดต่อ ${p} นะ`)
    }
  })

  it('FR-AIT-10 (1): ข้อความรวมเบอร์+ที่อยู่ไม่เหลือในทุกฟิลด์ (instruction/contextBlock/shopName ด้วย)', () => {
    const o = sanitizeForExternalAi(
      base(['โทร 081-234-5678 ส่งที่ ซ.5 ต.บางนา 10260'], {
        instruction: 'โอนเข้าบัญชี 1234567890 ติดต่อ 02-123-4567',
        contextBlock: `อีเมลร้าน ${EMAIL}`,
        shopName: 'ร้าน 0812345678',
      }),
      'typhoon',
    )
    const s = all(o)
    for (const bad of ['081-234-5678', '10260', '1234567890', '02-123-4567', EMAIL, '0812345678']) {
      expect(s).not.toContain(bad)
    }
    // E-8: คืนค่าจริงของ instruction ได้เมื่อ AI อ้างป้าย
    expect(restorePii(o.instruction, o.vault).text).toContain('1234567890')
    expect(o.foundKinds).toEqual(expect.arrayContaining(['PHONE', 'BANK_ACCOUNT', 'EMAIL', 'ADDRESS']))
  })

  it('ชื่อลูกค้า (เต็ม + ท่อน) → ลูกค้า, ชื่อแอดมิน → แอดมิน', () => {
    const o = sanitizeForExternalAi(
      base(['สวัสดีครับ คุณสมชาย ใจดี ค่ะ', 'ผมสมศักดิ์เอง', 'ใจดี สมชาย'], {
        knownCustomerNames: ['สมชาย ใจดี'],
        adminNames: ['สมศักดิ์'],
      }),
      'typhoon',
    )
    const s = all(o)
    expect(s).not.toContain('สมชาย')
    expect(s).not.toContain('ใจดี')
    expect(s).not.toContain('สมศักดิ์')
    expect(o.turns[0].text).toBe('สวัสดีครับ คุณลูกค้า ค่ะ')
    expect(o.turns[1].text).toBe('ผมแอดมินเอง')
  })

  it('ชื่อ 1 ตัวอักษรไม่ถูกใช้เป็นท่อน', () => {
    const o = sanitizeForExternalAi(base(['ก ข ค'], { knownCustomerNames: ['ก ข'] }), 'typhoon')
    expect(o.turns[0].text).toContain('ก')
  })

  it('knownLiterals (ที่อยู่ไม่มีรหัสไปรษณีย์) ถูกแทน', () => {
    const o = sanitizeForExternalAi(
      base(['ส่งไปหลังเซเว่นปากซอย 12 ได้เลย'], { knownLiterals: ['หลังเซเว่นปากซอย 12'] }),
      'typhoon',
    )
    expect(all(o)).not.toContain('เซเว่น')
  })

  it("mode: typhoon → customerNote=null, customerName=null · gemini → note ถูก redact", () => {
    const i = base(['hi'], { customerNote: 'ลูกค้า VIP โทร 0812345678' })
    const t = sanitizeForExternalAi(i, 'typhoon')
    expect(t.customerNote).toBeNull()
    expect(t.customerName).toBeNull()
    const g = sanitizeForExternalAi(i, 'gemini')
    expect(g.customerNote).toBe('ลูกค้า VIP โทร [เบอร์โทร#1]')
    expect(g.customerName).toBeNull()
  })

  it('ค่าเดียวกันข้ามฟิลด์ใช้ป้ายเดียว (vault ร่วม request)', () => {
    const o = sanitizeForExternalAi(base(['0812345678'], { instruction: 'โทร 0812345678' }), 'typhoon')
    expect(o.turns[0].text).toBe('[เบอร์โทร#1]')
    expect(o.instruction).toBe('โทร [เบอร์โทร#1]')
  })

  it('fail-closed: input ที่ทำให้ throw → SanitizeError (ไม่ใช่ error ดิบ)', () => {
    const bad = { ...base(['x']), turns: [{ role: 'BUYER', text: undefined }] } as unknown as SanitizeInput
    expect(() => sanitizeForExternalAi(bad, 'typhoon')).toThrow(SanitizeError)
    const bad2 = { ...base(['x']), knownCustomerNames: null } as unknown as SanitizeInput
    expect(() => sanitizeForExternalAi(bad2, 'typhoon')).toThrow(SanitizeError)
  })
})

describe('mutation: ถอดการปิดบังทีละชนิด → เทสต้องจับการรั่วได้ (mutation-silence-means-weak-corpus)', () => {
  it.each(Object.keys(SAMPLES))('ชนิด %s', (kind) => {
    mutation.label = SAMPLES[kind].label
    // ตัวปิดบังถูกถอด: ถ้า assertion ของชนิดนี้แข็งพอ leaks() ต้อง true (หรือด่านซ้ำโยน SanitizeError ทุกค่า = ปลอดภัยเหมือนกัน)
    const throwsAll = SAMPLES[kind].values.every((v) => {
      try {
        sanitizeForExternalAi(base([SAMPLES[kind].wrap(v)]), 'typhoon')
        return false
      } catch (e) {
        return e instanceof SanitizeError
      }
    })
    expect(leaks(kind) || throwsAll).toBe(true)
  })
})

describe('buildSuggestTurns', () => {
  const rows = (type: string, body: string | null, productRefId: string | null = null, senderRole = 'BUYER') => [
    { senderRole, type, body, productRefId },
  ]
  const o = (externalSafe: boolean, includeProductContext = true) => ({
    productCards: new Map([['p1', { name: 'เสื้อ', price: '199', isActive: true }]]),
    includeProductContext,
    externalSafe,
  })

  it('externalSafe → ป้ายชนิดสื่อ', () => {
    expect(buildSuggestTurns(rows('IMAGE', null), o(true))[0].text).toBe('[รูป]')
    expect(buildSuggestTurns(rows('IMAGE', 'อันนี้'), o(true))[0].text).toBe('[รูป] อันนี้')
    expect(buildSuggestTurns(rows('AUDIO', null), o(true))[0].text).toBe('[ข้อความเสียง]')
    expect(buildSuggestTurns(rows('VIDEO', null), o(true))[0].text).toBe('[ไฟล์]')
    expect(buildSuggestTurns(rows('FILE', null), o(true))[0].text).toBe('[ไฟล์]')
  })
  it('ไม่ externalSafe → พฤติกรรมเดิม', () => {
    expect(buildSuggestTurns(rows('IMAGE', null), o(false))[0].text).toBe('[ส่งรูปภาพ]')
    expect(buildSuggestTurns(rows('AUDIO', 'x'), o(false))[0].text).toBe('[ข้อความเสียง] x')
  })
  it('การ์ดสินค้า 3 แบบ + role + กรองข้อความว่าง', () => {
    expect(buildSuggestTurns(rows('PRODUCT', null, 'p1'), o(false))[0].text).toBe(
      '[ส่งการ์ดสินค้า: เสื้อ — 199 บาท (เปิดขาย)]',
    )
    expect(buildSuggestTurns(rows('PRODUCT', null, 'gone'), o(false))[0].text).toBe('[ส่งการ์ดสินค้า: สินค้าถูกลบแล้ว]')
    expect(buildSuggestTurns(rows('PRODUCT', null, 'gone'), o(false, false))[0].text).toBe('[ส่งการ์ดสินค้า]')
    expect(buildSuggestTurns(rows('TEXT', '  ', null, 'SHOP'), o(false))).toEqual([])
    expect(buildSuggestTurns(rows('TEXT', 'hi', null, 'SHOP'), o(false))[0].role).toBe('SHOP')
  })
})

describe('H1–H2, M2–M4 regression: รูปแบบที่เคยหลุด', () => {
  const longRun = (s: string) => /\d(?:[ .\-–—]?\d){8,}/.test(s.normalize('NFKC'))
  const wrap = (v: string) => `ติดต่อ ${v} นะครับ`
  const LEAKY = [
    '081.234.5678', '+66 (0) 81-234-5678', '081–234–5678', '081​2345678', '๐๘๑๒๓๔๕๖๗๘',
    '08１２３４５６７８', '123-4-56789-0', '123-456789-0', '1234 5678 90', '1.2345.67890.12.3',
    '๑๒๓๔๕๖๗๘๙๐๑๒๓', 'EX123456789TH', '＋66812345678',
  ]
  it.each(LEAKY)('ปิด %j ได้ ไม่เหลือเลขยาว ≥9 หลัก', (v) => {
    const o = sanitizeForExternalAi(base([wrap(v)]), 'typhoon')
    const t = o.turns[0].text
    expect(longRun(t)).toBe(false)
    expect(t).not.toContain(v)
    expect(digits(t)).not.toMatch(/\d{9,}/)
    expect(restorePii(t, o.vault).unresolved).toEqual([])
  })

  it('round-trip ค่าที่ไม่ต้อง normalize ได้เท่าเดิม', () => {
    for (const v of ['123-4-56789-0', '1234 5678 90', 'EX123456789TH', '081.234.5678']) {
      const o = sanitizeForExternalAi(base([wrap(v)]), 'typhoon')
      expect(restorePii(o.turns[0].text, o.vault).text).toBe(wrap(v).replace('081.234.5678', '081-234-5678'))
    }
  })

  it('เลขพัสดุไม่ทำให้ throw — ได้ป้าย [ตัวเลข#n]', () => {
    const o = sanitizeForExternalAi(base(['พัสดุ EX123456789TH ถึงไหนแล้ว']), 'typhoon')
    expect(o.turns[0].text).toBe('พัสดุ EX[ตัวเลข#1]TH ถึงไหนแล้ว')
  })

  const ADDRS = [
    'ที่อยู่ 99/9 ซอยลาดพร้าว 10 กทม',
    'บ้านเลขที่ 12 หมู่ 3 ต.บางพลี',
    'ส่งที่ 12/3 ถ.สุขุมวิท\n10110',
  ]
  it.each(ADDRS)('ที่อยู่ไม่มีรหัสไปรษณีย์ %j ถูกปิด', (a) => {
    const o = sanitizeForExternalAi(base([a]), 'typhoon')
    expect(o.turns[0].text).toBe('[ที่อยู่#1]')
    expect(restorePii(o.turns[0].text, o.vault).text).toBe(a)
  })

  it('false-positive: ราคา/ไซส์/วันที่ ไม่ถูกปิด', () => {
    for (const t of ['ราคา 350 บาท ส่ง 2 วัน ไซส์ 42', 'ส่งวันที่ 5 ม.ค. 2569 ได้ไหม', 'ลด 99.50 บาท เหลือ 3 ชิ้น']) {
      expect(sanitizeForExternalAi(base([t]), 'typhoon').turns[0].text).toBe(t)
    }
  })

  it('M4: social / อีเมลอำพราง', () => {
    const cases: [string, string][] = [
      ['LINE id: somchai_99', 'ติดต่อ'],
      ['ไลน์ somchai99', 'ติดต่อ'],
      ['ไอดีไลน์ somchai99', 'ติดต่อ'],
      ['ทัก @somchai.shop ได้', 'ติดต่อ'],
      ['facebook.com/somchai.k', 'ติดต่อ'],
      ['https://line.me/ti/p/abc123', 'ติดต่อ'],
      ['instagram.com/somchai', 'ติดต่อ'],
      ['somchai (at) gmail.com', 'อีเมล'],
      ['somchai at gmail dot com', 'อีเมล'],
    ]
    for (const [t, kind] of cases) {
      const o = sanitizeForExternalAi(base([t]), 'typhoon')
      expect(o.turns[0].text, t).toContain(`[${kind}#1]`)
      expect(o.turns[0].text, t).not.toMatch(/somchai|abc123/)
    }
  })

  it('M2: ชื่อหลัง "ชื่อ" ถูกปิด แต่ "ชื่อสินค้า" ไม่', () => {
    expect(sanitizeForExternalAi(base(['ชื่อ นายสมหมาย รักดี']), 'typhoon').turns[0].text).toBe('ชื่อ [ชื่อ#1]')
    expect(sanitizeForExternalAi(base(['ชื่อผู้รับ: คุณมานี']), 'typhoon').turns[0].text).toBe('ชื่อผู้รับ: [ชื่อ#1]')
    expect(sanitizeForExternalAi(base(['ชื่อสินค้าอะไรคะ']), 'typhoon').turns[0].text).toBe('ชื่อสินค้าอะไรคะ')
  })

  it('ท่อนชื่อสั้น (<3) ไม่ถูกใช้ แต่ชื่อเต็มใช้', () => {
    const o = sanitizeForExternalAi(base(['คุณ มา ครับ มา ดี'], { knownCustomerNames: ['มา ดี'] }), 'typhoon')
    expect(o.turns[0].text).toBe('คุณ มา ครับ ลูกค้า')
  })
})

describe('buildSuggestTurns M3: allow-list ตอน externalSafe', () => {
  const o = { productCards: new Map(), includeProductContext: true, externalSafe: true }
  it.each(['LOCATION', 'CONTACT', 'STICKER', 'UNKNOWN_FUTURE'])('%s ไม่ส่ง body', (type) => {
    const t = buildSuggestTurns([{ senderRole: 'BUYER', type, body: '13.7563,100.5018 081-234-5678', productRefId: null }], o)
    expect(t[0].text).toBe('[ไฟล์]')
  })
  it('TEXT ส่ง body', () => {
    expect(buildSuggestTurns([{ senderRole: 'BUYER', type: 'TEXT', body: 'สวัสดี', productRefId: null }], o)[0].text).toBe('สวัสดี')
  })
})
