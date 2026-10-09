import { describe, it, expect } from 'vitest'
import { createPiiVault, redactPii, redactPiiReversible, restorePii } from '../pii-redact'

// CORPUS ใช้เฉพาะรูปแบบที่ redactPii เดิมรองรับ — ฝั่ง reversible ตั้งใจเข้มกว่า (normalize เลขไทย/ตัวคั่น, ที่อยู่ไม่มี zip,
// เลขยาว ≥9 หลัก, โซเชียล/อีเมลอำพราง) จึงห้ามเอารูปแบบเหล่านั้นมาเทียบ parity · รูปแบบเข้มดูใน ai-suggest-sanitize.test.ts
const CORPUS = [
  // (ย้ายออก: บรรทัดเดียวปนข้อความอื่น ฝั่ง reversible ปิดเฉพาะช่วงที่อยู่ ตั้งใจต่างจาก redactPii — ดูเทสท้ายไฟล์)
  'เบอร์ +66 81 234 5678 ครับ',
  'บัตร 1-2345-67890-12-3 และอีเมล a.b@test.co.th',
  'โอนบัญชี 1234567890123 หรือ 0123456789',
  'ไม่มีข้อมูลส่วนตัวเลย ราคา 500 บาท',
  'สองเบอร์ 0812345678 กับ 0898765432 แล้วเบอร์เดิม 0812345678',
  'บรรทัดแรก\nบ้านเลขที่ 9 ถนนสุขุมวิท 10110\nบรรทัดสาม',
]

describe('redactPiiReversible', () => {
  it('parity: ตัด #\\d+ แล้วเท่ากับ redactPii ทุกข้อความ', () => {
    for (const c of CORPUS) {
      const r = redactPiiReversible(c, createPiiVault())
      expect(r.text.replace(/#\d+/g, '')).toBe(redactPii(c).text)
      expect(r.found.sort()).toEqual(redactPii(c).found.sort())
    }
  })

  it('round-trip: restore คืนข้อความเดิม', () => {
    for (const c of CORPUS) {
      const v = createPiiVault()
      const r = redactPiiReversible(c, v)
      const back = restorePii(r.text, v)
      expect(back.text).toBe(c)
      expect(back.unresolved).toEqual([])
    }
  })

  it('ค่าเดียวกัน = ป้ายเดียวกัน, ค่าต่างกัน = เลขต่างกัน', () => {
    const v = createPiiVault()
    const r = redactPiiReversible('0812345678 กับ 0898765432 และ 0812345678', v)
    expect(r.text).toBe('[เบอร์โทร#1] กับ [เบอร์โทร#2] และ [เบอร์โทร#1]')
    expect(v.table.size).toBe(2)
  })

  it('หลายชนิดไม่สลับกัน', () => {
    const v = createPiiVault()
    const r = redactPiiReversible('0812345678 a@b.com 1234567890123 9876543210', v)
    expect(r.text).toContain('[เบอร์โทร#1]')
    expect(r.text).toContain('[อีเมล#1]')
    expect(r.text).toContain('[เลขบัตรประชาชน#1]')
    expect(r.text).toContain('[เลขบัญชี#1]')
    expect(v.table.get('[อีเมล#1]')).toBe('a@b.com')
    expect(v.table.get('[เบอร์โทร#1]')).toBe('0812345678')
  })

  it('E-16: ป้ายเลียนแบบถูก defang และไม่ถูก restore', () => {
    const v = createPiiVault()
    const r = redactPiiReversible('ส่งไป [เบอร์โทร#1] ครับ เบอร์ผม 0812345678', v)
    expect(r.text).toContain('(เบอร์โทร#1)')
    expect(r.text).toContain('[เบอร์โทร#1]') // ป้ายจริงของเบอร์ผม
    // ป้ายปลอมตัวแรกไม่มีวงเล็บเหลี่ยมแล้ว จึงไม่เคยถูกจับมา restore
    const back = restorePii('(เบอร์โทร#1)', v)
    expect(back.text).toBe('(เบอร์โทร#1)')
    expect(back.unresolved).toEqual([])
  })

  it('ป้ายไม่รู้จัก/ไม่มีเลขลำดับ → unresolved', () => {
    const v = createPiiVault()
    redactPiiReversible('0812345678', v)
    const r = restorePii('โทร [เบอร์โทร#9] หรือ [เบอร์โทร] หรือ [เบอร์โทร#1]', v)
    expect(r.unresolved).toEqual(['[เบอร์โทร#9]', '[เบอร์โทร]'])
    expect(r.text).toContain('0812345678')
  })

  it('ค่าจริงที่มี $ ไม่ถูกตีความเป็น replacement pattern', () => {
    const v = createPiiVault()
    ;(v.table as Map<string, string>).set('[อีเมล#1]', "a$&b@x.com")
    expect(restorePii('[อีเมล#1]', v).text).toBe('a$&b@x.com')
  })

  it('normalize: เลขไทย/fullwidth/ตัวคั่นแปลก → ป้ายเดียว และเลขท้ายไม่หลุด', () => {
    for (const v of ['๐๘๑๒๓๔๕๖๗๘', '08１２３４５６７８', '081–234–5678', '081\u200B2345678']) {
      const r = redactPiiReversible(`โทร ${v}`, createPiiVault())
      expect(r.text).toBe('โทร [เบอร์โทร#1]')
    }
  })
})

describe('redactPiiReversible: security round 2 (N1/N2/N4/N6)', () => {
  const red = (t: string) => redactPiiReversible(t, createPiiVault()).text

  it.each([
    '081/234/5678', '081,234,5678', '081_234_5678', '081·234·5678', '0812­345678',
    '081٢٣٤٥٦٧٨', '081۲۳۴۵۶۷۸', '081-234-\n5678',
  ])('N1 เบอร์ %j ถูกปิด', (t) => {
    expect(red(`โทร ${t} ครับ`).replace(/#\d+/g, '')).not.toMatch(/\d/)
  })

  it.each([
    'Send to 99/9 Soi Ladprao 10, Bangkok',
    '99/9 Ladprao Rd Bangkok 10230',
    'ต.บางพลี อ.บางพลี จ.สมุทรปราการ',
    'บ้าน 99/9 ลาดพร้าว',
  ])('N2 ที่อยู่ %j ถูกปิด', (t) => {
    expect(red(t)).toBe('[ที่อยู่#1]')
  })

  it.each(['เลขบัญชี 12345678', 'บัญชี 123-4-5678', 'acct: 987654', 'A/C 1234 5678'])('N4 %j', (t) => {
    const o = red(t)
    expect(o).toMatch(/\[เลขบัญชี#1\]/)
    expect(o.replace(/#\d+/g, '')).not.toMatch(/\d/)
  })

  it.each(['4111 1111 1111 1111', '4111-1111-1111-1111', '4111111111111111'])('N6 บัตร %j ปิดทั้งก้อน', (t) => {
    expect(red(`บัตร ${t} ครับ`).replace(/#\d+/g, '')).not.toMatch(/\d/)
  })

  it.each(['ราคา 1,299 บาท', 'นัด 12/10/2026', 'เวลา 14:30', 'เปิด 10.30 - 12.30', 'ส่ง 2 ชิ้น'])(
    'ไม่ false positive: %j',
    (t) => {
      expect(red(t)).toBe(t)
    },
  )
})

describe('redactPiiReversible: ที่อยู่ในบรรทัดเดียวกับคำสั่งซื้อ', () => {
  const red = (t: string) => redactPiiReversible(t, createPiiVault()).text

  it.each([
    ['สั่งเสื้อ 2 ตัวค่ะ ส่งที่ 12/3 หมู่ 5 ต.บางพลี อ.บางพลี จ.สมุทรปราการ 10540 โทร 081-234-5678',
      'สั่งเสื้อ 2 ตัวค่ะ ส่งที่ [ที่อยู่#1] โทร [เบอร์โทร#1]'],
    ['สั่งเสื้อ 2 ตัวค่ะ ส่งที่ 12/3 หมู่ 5 ต.บางพลี อ.บางพลี จ.สมุทรปราการ โทร 081-234-5678',
      'สั่งเสื้อ 2 ตัวค่ะ ส่งที่ [ที่อยู่#1] โทร [เบอร์โทร#1]'],
    ['ส่งที่ 12/3 หมู่ 5 ต.บางพลี อ.บางพลี จ.สมุทรปราการ 10540 เอาสีดำนะคะ',
      'ส่งที่ [ที่อยู่#1] เอาสีดำนะคะ'],
  ])('%j', (input, expected) => {
    const vault = createPiiVault()
    const r = redactPiiReversible(input, vault)
    expect(r.text).toBe(expected)
    expect(restorePii(r.text, vault).text).toBe(normalizeSame(input))
  })

  it('หาจุดจบไม่ได้ → ปิดทั้งบรรทัด', () => {
    expect(red('สั่ง 2 ตัว ส่งที่ 12/3 หมู่ 5')).toBe('[ที่อยู่#1]')
  })
})

const normalizeSame = (s: string) => s

describe('security batch B1: H1 ตัวคั่น " - " / M2 โซเชียล', () => {
  it.each(['โทร 081 - 234 - 5678', 'โทร 081 – 234 – 5678', 'โทร 081 — 234 — 5678'])('H1 ปิดเบอร์: %s', (t) => {
    const r = redactPiiReversible(t, createPiiVault())
    expect(r.found).toContain('PHONE')
    expect(r.text).not.toMatch(/234/)
  })
  it.each(['ราคา 1,299 บาท', 'วันที่ 12/10/2026', 'นัด 14:30', 'เปิด 10.30 - 12.30', 'ส่ง 2 ชิ้น', 'อก 36 เอว 28'])('H1 ไม่โดน: %s', (t) => {
    const r = redactPiiReversible(t, createPiiVault())
    expect(r.found).toEqual([])
    expect(r.text).toBe(t)
  })
  it.each(['ig: somchai_k', 'IG somchai_k', 'tiktok @x_y', 'fb: somchai.k', 'facebook=somchai'])('M2 ปิดโซเชียล: %s', (t) => {
    const r = redactPiiReversible(t, createPiiVault())
    expect(r.found).toContain('CONTACT')
    expect(r.text).not.toMatch(/somchai|x_y/)
  })
})
