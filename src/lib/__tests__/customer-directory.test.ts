/**
 * [blocker] customer-directory — เกณฑ์ที่หน้า `/customers` และ `/customers/[id]` ใช้ร่วมกัน (00057)
 *
 * 🛑 ทุกเคสในไฟล์นี้ต้องพิสูจน์ด้วย **mutation** (กลับตรรกะในโค้ดจริงแล้วเทสต้องแดง) ไม่ใช่แค่
 * เขียนแล้วมันเขียวตอนแรก — บทเรียน `mutation-silence-means-weak-corpus.md` ที่เคยเงียบ 2 ครั้ง
 * ในวันเดียวเพราะชุดข้อมูลไม่มี input ที่ทำให้บั๊กโผล่
 *
 * mutation ที่รันจริงแล้วทำให้ไฟล์นี้แดง (2026-08-24 — ทุกตัวรันแล้ว ไม่ใช่รายการที่ตั้งใจจะทำ):
 *  1. `avgPerOrder` เปลี่ยนตัวหาร `revenueOrderCount` → `totalOrders`        → แดง 1
 *  2. `avgPerOrder` ถอด guard `revenueOrderCount <= 0` (หารด้วย 0)           → แดง 1
 *  3. `isValidCustomerKey` ถอดเงื่อนไข `key.length > p.length`               → แดง 1
 *  4. `isValidCustomerKey` เพิ่ม `if (key === 'guest-unknown') return true`  → แดง 2
 *  5. `matchesCustomerQuery` ถอดการเทียบแบบ digits-only                      → แดง 1
 *  6. `matchesCustomerFilter` สลับเงื่อนไขของ repeat/returned                → แดง 2
 *  7. `findEntryByKey` ถอด `isValidCustomerKey` guard ออก                    → แดง 1
 *
 * 🛑 บันทึกไว้กันคนถัดไปเสียเวลาซ้ำ: mutation ข้อ 4 ตอนแรกลองเป็น "เติม `'guest-unknown'`
 * เข้าอาร์เรย์ `VALID_KEY_PREFIXES`" แล้ว **เทสเขียว** — ไม่ใช่เพราะชุดข้อมูลอ่อน แต่เพราะ
 * mutation นั้นเป็น no-op เชิงความหมาย: guard `key.length > p.length` ลบล้างมันเอง
 * (`'guest-unknown'.length > 'guest-unknown'.length` = false) ⇒ เมื่อ mutation เงียบ
 * ต้องแยกให้ออกก่อนว่า "เทสไม่รู้สึก" หรือ "โค้ดที่แก้ไม่ได้เปลี่ยนพฤติกรรมจริง"
 * แล้วเลือก mutation ที่แสดงบั๊กได้จริงมาแทน
 */
import { describe, expect, it } from 'vitest'
import {
  aggregateCustomerStats,
  avgPerOrder,
  findEntryByKey,
  isValidCustomerKey,
  maskContact,
  matchesCustomerQuery,
  matchesCustomerFilter,
  parseCustomerFilter,
  type CustomerDirectoryEntry,
} from '../customer-directory'

/**
 * ลูกค้าตัวอย่าง — ปรับได้ทีละ field
 *
 * 🛑 ค่าเริ่มต้นจงใจให้ `totalOrders !== revenueOrderCount` (3 ใบ แต่นับเป็นยอดขาย 2 ใบ)
 * ถ้าทำให้เท่ากันเมื่อไหร่ mutation ข้อ 1 (สลับตัวหาร) จะให้ผลเท่ากันทั้งสองทาง = เทสเงียบ
 * **ห้ามแก้ให้เท่ากันเพื่อความ "สะอาด"**
 */
function entry(over: Partial<CustomerDirectoryEntry> = {}): CustomerDirectoryEntry {
  return {
    key: 'c-cust-1',
    customerId: 'cust-1',
    buyerUserId: null,
    displayName: 'สมชาย ใจดี',
    initial: 'ส',
    contactFull: '0812345678',
    isRegistered: false,
    username: null,
    avatarUrl: null,
    totalOrders: 3,
    totalSpent: 3000,
    revenueOrderCount: 2,
    firstOrderISO: '2026-07-01T00:00:00.000Z',
    firstOrderRaw: 0,
    lastOrderISO: '2026-08-20T00:00:00.000Z',
    lastOrderRaw: 1,
    behavior: {
      orders: 3,
      completed: 2,
      cancelledByBuyer: 0,
      cancelledTotal: 1,
      returnedParcels: 0,
      problemOrders: 0,
    },
    shopReputation: {
      orders: 3,
      shipped: 2,
      received: 2,
      returned: 0,
      cancelledByBuyer: 0,
      returnRate: null,
      riskLevel: 'NONE',
    },
    orders: [],
    ...over,
  }
}

describe('[blocker] avgPerOrder — ตัวหารต้องมาจากกองเดียวกับตัวตั้ง (FR-009)', () => {
  it('หารด้วยจำนวนใบที่นับเป็นยอดขาย ไม่ใช่ออเดอร์ทั้งหมด', () => {
    // ลูกค้าคนเดียว: 2 ใบนับเป็นยอดขาย (฿1,000 + ฿2,000) + 1 ใบยกเลิก (฿5,000 ไม่อยู่ในตัวตั้ง)
    // ถูก  = 3000 / 2 = 1500
    // บั๊ก = 3000 / 3 = 1000  ← mutation ข้อ 1 ต้องทำให้บรรทัดนี้แดง
    expect(avgPerOrder(entry({ totalSpent: 3000, revenueOrderCount: 2, totalOrders: 3 }))).toBe(1500)
  })

  it('ไม่มีใบที่นับเป็นยอดขายเลย → null (ไม่ใช่ NaN / Infinity / 0)', () => {
    const result = avgPerOrder(entry({ totalSpent: 0, revenueOrderCount: 0, totalOrders: 3 }))
    expect(result).toBeNull()
    // ปักหมุดแยกจาก toBeNull() — mutation ข้อ 2 ให้ NaN ซึ่ง `toBeNull()` จับได้อยู่แล้ว
    // แต่เขียนไว้ให้ชัดว่าอะไรคือสิ่งที่ห้ามหลุดไปถึงหน้าจอ
    expect(Number.isNaN(result as unknown as number)).toBe(false)
  })

  it('ยอดสะสมเป็น 0 แต่มีใบที่นับเป็นยอดขาย → 0 (คนละเคสกับ null)', () => {
    // ของแถมฟรี/ส่วนลดเต็มจำนวน — "เฉลี่ยแล้วได้ 0 บาท" เป็นความจริง ต่างจาก "ยังไม่มีอะไรให้เฉลี่ย"
    expect(avgPerOrder(entry({ totalSpent: 0, revenueOrderCount: 1 }))).toBe(0)
  })
})

describe('[blocker] isValidCustomerKey — รูปแบบ key ที่รับได้ (FR-006)', () => {
  it('รับ prefix ที่ makeCustomerRowKey ผลิตได้จริงทั้ง 3 แบบ', () => {
    expect(isValidCustomerKey('c-3f9a1b2c')).toBe(true)
    expect(isValidCustomerKey('u-9d8c7b6a')).toBe(true)
    expect(isValidCustomerKey('g-a1b2c3d4e5f6a7b8')).toBe(true)
  })

  it('prefix ถูกแต่ไม่มีส่วนหลัง → ไม่รับ', () => {
    // mutation ข้อ 3 (ถอด key.length > p.length) ต้องทำให้ 3 บรรทัดนี้แดง
    expect(isValidCustomerKey('c-')).toBe(false)
    expect(isValidCustomerKey('u-')).toBe(false)
    expect(isValidCustomerKey('g-')).toBe(false)
  })

  it('รูปแบบอื่นทั้งหมด → ไม่รับ', () => {
    expect(isValidCustomerKey('x-abc123')).toBe(false)
    expect(isValidCustomerKey('')).toBe(false)
    expect(isValidCustomerKey('c')).toBe(false)
    expect(isValidCustomerKey('3f9a1b2c')).toBe(false)
  })

  it('guest-unknown ต้องไม่ถือว่าใช้ได้ — มัน match ลูกค้าหลายคนพร้อมกัน', () => {
    // mutation ข้อ 4 (เพิ่ม guest-unknown เข้า allow-list) ต้องทำให้บรรทัดนี้แดง
    // ถ้าปล่อยผ่าน หน้าโปรไฟล์จะรวมลูกค้าที่ไม่มีข้อมูลติดต่อหลายคนเป็นคนเดียว
    expect(isValidCustomerKey('guest-unknown')).toBe(false)
  })
})

describe('[blocker] findEntryByKey — เทียบสตริงตรง ๆ ไม่ reverse hash (FR-007)', () => {
  const entries = [
    entry({ key: 'c-cust-1', customerId: 'cust-1' }),
    entry({ key: 'u-user-9', customerId: null, buyerUserId: 'user-9' }),
    entry({ key: 'g-a1b2c3d4e5f6a7b8', customerId: null, buyerUserId: null }),
  ]

  it('หา c- / u- / g- เจอครบทั้ง 3 แบบ', () => {
    expect(findEntryByKey(entries, 'c-cust-1')?.customerId).toBe('cust-1')
    expect(findEntryByKey(entries, 'u-user-9')?.buyerUserId).toBe('user-9')
    expect(findEntryByKey(entries, 'g-a1b2c3d4e5f6a7b8')?.key).toBe('g-a1b2c3d4e5f6a7b8')
  })

  it('key ที่ไม่มีในร้านนี้ → null (ไม่ throw)', () => {
    expect(findEntryByKey(entries, 'c-someone-else')).toBeNull()
    expect(findEntryByKey(entries, 'g-0000000000000000')).toBeNull()
  })

  it('key รูปแบบผิด → null โดยไม่ต้องไล่หาในลิสต์', () => {
    // mutation ข้อ 7 (ถอด isValidCustomerKey guard) — ต้องแดงที่ 'guest-unknown'
    // เพราะถ้าไม่มี guard มันจะไปหาในลิสต์แล้วบังเอิญไม่เจอ (null เหมือนกัน) จึงต้องมีเคส
    // ที่ลิสต์ **มี** key นั้นอยู่จริงเพื่อให้เห็นความต่าง — ดูเคสถัดไป
    expect(findEntryByKey(entries, 'x-abc')).toBeNull()
    expect(findEntryByKey(entries, '')).toBeNull()
  })

  it('ถึงลิสต์จะมี guest-unknown อยู่จริง ก็ต้องไม่คืนให้ (mutation ข้อ 7 จับที่นี่)', () => {
    const withUnknown = [...entries, entry({ key: 'guest-unknown', customerId: null })]
    expect(findEntryByKey(withUnknown, 'guest-unknown')).toBeNull()
  })
})

describe('[blocker] matchesCustomerQuery — ต้องค้นเบอร์เต็มเจอ (FR-001)', () => {
  const e = entry({ displayName: 'สมชาย ใจดี', contactFull: '0812345678' })

  it('ค้นด้วยเบอร์เต็ม 10 หลักเจอ', () => {
    expect(matchesCustomerQuery(e, '0812345678')).toBe(true)
  })

  it('ค้นด้วยเบอร์ที่มีขีด/เว้นวรรคก็ต้องเจอ (เทียบเฉพาะตัวเลข)', () => {
    // mutation ข้อ 5 (ถอด digits-only) ต้องทำให้ 2 บรรทัดนี้แดง —
    // เพราะ substring ธรรมดาไม่มีทาง match '081-234-5678' กับ '0812345678'
    expect(matchesCustomerQuery(e, '081-234-5678')).toBe(true)
    expect(matchesCustomerQuery(e, '081 234 5678')).toBe(true)
  })

  it('ค้นด้วยเลขท้าย 4 ตัวเจอ', () => {
    expect(matchesCustomerQuery(e, '5678')).toBe(true)
  })

  it('ค้นด้วยชื่อเจอ', () => {
    expect(matchesCustomerQuery(e, 'สมชาย')).toBe(true)
  })

  it('ค้นด้วยอีเมลเจอ (ลูกค้าที่ไม่มีเบอร์)', () => {
    const emailOnly = entry({ displayName: 'ลูกค้าทั่วไป', contactFull: 'a@example.com' })
    expect(matchesCustomerQuery(emailOnly, 'example.com')).toBe(true)
    expect(matchesCustomerQuery(emailOnly, 'A@EXAMPLE.COM')).toBe(true)
  })

  it('คำค้นว่าง → ผ่านทุกแถว', () => {
    expect(matchesCustomerQuery(e, '')).toBe(true)
    expect(matchesCustomerQuery(e, '   ')).toBe(true)
  })

  it('ไม่ตรงเลย → false', () => {
    expect(matchesCustomerQuery(e, 'วรรณา')).toBe(false)
    expect(matchesCustomerQuery(e, '0999999999')).toBe(false)
  })

  it('ลูกค้าที่ไม่มีข้อมูลติดต่อ ค้นด้วยตัวเลขต้องไม่ระเบิด', () => {
    const noContact = entry({ contactFull: null })
    expect(matchesCustomerQuery(noContact, '0812345678')).toBe(false)
    expect(matchesCustomerQuery(noContact, 'สมชาย')).toBe(true)
  })
})

describe('[blocker] matchesCustomerFilter — ชิปกรอง 4 ตัว เลือกได้ทีละอัน (FR-003)', () => {
  const e = (over: Partial<CustomerDirectoryEntry> = {}) => entry(over)
  const rep = (over: Partial<CustomerDirectoryEntry['shopReputation']>) => ({
    orders: 1, shipped: 1, received: 1, returned: 0,
    cancelledByBuyer: 0, returnRate: null, riskLevel: 'NONE' as const, ...over,
  })

  it('all → ผ่านทุกแถว ไม่ว่าธงหรือตัวเลขจะเป็นอะไร', () => {
    expect(matchesCustomerFilter(e({ totalOrders: 1 }), 'all', false)).toBe(true)
    expect(matchesCustomerFilter(e({ totalOrders: 9 }), 'all', true)).toBe(true)
  })

  it('warn → ใช้ธงที่ผู้เรียกส่งมา ไม่ตัดสินเองจากตัวเลข', () => {
    // 🛑 fixture ต้องมีเคสที่ "ธงไม่ตรงกับตัวเลข" ไม่งั้นถ้าโค้ดหันไปดู riskLevel เองก็ยังเขียว
    const looksBadButNoFlag = e({ shopReputation: rep({ returned: 3, riskLevel: 'HIGH' }) })
    expect(matchesCustomerFilter(looksBadButNoFlag, 'warn', false)).toBe(false)
    expect(matchesCustomerFilter(e({ shopReputation: rep({}) }), 'warn', true)).toBe(true)
  })

  it('returned → เจาะจงเฉพาะเคยตีกลับ ไม่รวมยกเลิก', () => {
    // เคสนี้พิสูจน์ว่า returned ≠ warn: มีธงเตือน (จากการยกเลิก) แต่ไม่เคยตีกลับ
    expect(matchesCustomerFilter(e({ shopReputation: rep({ returned: 0 }) }), 'returned', true)).toBe(false)
    expect(matchesCustomerFilter(e({ shopReputation: rep({ returned: 1 }) }), 'returned', false)).toBe(true)
  })

  it('repeat → ตั้งแต่ 2 ใบขึ้นไป (นับทุกสถานะตามนิยามเดิมของ 00014 FR-9)', () => {
    expect(matchesCustomerFilter(e({ totalOrders: 1 }), 'repeat', false)).toBe(false)
    expect(matchesCustomerFilter(e({ totalOrders: 2 }), 'repeat', false)).toBe(true)
    expect(matchesCustomerFilter(e({ totalOrders: 3 }), 'repeat', false)).toBe(true)
  })

  it('parseCustomerFilter fail-closed — ค่าที่ไม่รู้จักตกเป็น all ไม่ใช่ throw', () => {
    expect(parseCustomerFilter('warn')).toBe('warn')
    expect(parseCustomerFilter('returned')).toBe('returned')
    expect(parseCustomerFilter('repeat')).toBe('repeat')
    expect(parseCustomerFilter('all')).toBe('all')
    expect(parseCustomerFilter('first')).toBe('all')
    expect(parseCustomerFilter('')).toBe('all')
    expect(parseCustomerFilter(undefined)).toBe('all')
    expect(parseCustomerFilter(null)).toBe('all')
  })
})

describe('maskContact — ยกมาจาก customers/page.tsx (เปลี่ยน 1 จุด: สตริงว่าง = ไม่มีข้อมูล)', () => {
  it('เหลือ 4 ตัวท้าย', () => {
    expect(maskContact('0812345678')).toBe('••••••5678')
  })

  it('สั้นกว่าหรือเท่ากับ 4 ตัว → คืนตามเดิม', () => {
    expect(maskContact('5678')).toBe('5678')
    expect(maskContact('12')).toBe('12')
  })

  it('ไม่มีข้อมูล → เส้นประ', () => {
    expect(maskContact(null)).toBe('—')
    expect(maskContact(undefined)).toBe('—')
    expect(maskContact('')).toBe('—')
  })
})

describe('[blocker] aggregateCustomerStats — สถิติความน่าเชื่อถือระดับร้าน', () => {
  const rep = (over: Partial<CustomerDirectoryEntry['shopReputation']> = {}) => ({
    orders: 1,
    shipped: 1,
    received: 1,
    returned: 0,
    cancelledByBuyer: 0,
    returnRate: null,
    riskLevel: 'NONE' as const,
    ...over,
  })

  it('รวมยอดข้ามลูกค้าแล้วคิดอัตราจากฐาน "ใบที่เปิดพัสดุ" ไม่ใช่จำนวนลูกค้า', () => {
    // 🛑 fixture ต้องมีลูกค้าที่ shipped ไม่เท่ากัน ไม่งั้นสลับตัวหารเป็น rows.length
    //    จะให้ผลเท่ากันโดยบังเอิญ = เทสเงียบ (mutation-silence-means-weak-corpus)
    const stats = aggregateCustomerStats([
      { shopReputation: rep({ shipped: 6, received: 5, returned: 1 }), hasWarning: true },
      { shopReputation: rep({ shipped: 4, received: 4, returned: 0 }), hasWarning: false },
    ])
    expect(stats.shipped).toBe(10)
    expect(stats.received).toBe(9)
    expect(stats.returned).toBe(1)
    expect(stats.returnRate).toBeCloseTo(0.1)
    expect(stats.receivedRate).toBeCloseTo(0.9)
    expect(stats.totalCustomers).toBe(2)
    expect(stats.watchCount).toBe(1)
  })

  it('ฐานน้อยกว่า 3 ใบ → อัตราเป็น null ไม่ใช่ 0 หรือ 100%', () => {
    // ร้านที่เพิ่งเปิดพัสดุใบแรกแล้วตีกลับ ต้องไม่ขึ้น "อัตราตีกลับ 100%" บนหัวหน้าจอตัวเอง
    const stats = aggregateCustomerStats([
      { shopReputation: rep({ shipped: 1, received: 0, returned: 1 }), hasWarning: true },
    ])
    expect(stats.returned).toBe(1)
    expect(stats.returnRate).toBeNull()
    expect(stats.receivedRate).toBeNull()
  })

  it('ไม่มีลูกค้าเลย → ทุกค่าเป็น 0 และอัตราเป็น null (ไม่หารด้วย 0)', () => {
    const stats = aggregateCustomerStats([])
    expect(stats.totalCustomers).toBe(0)
    expect(stats.shipped).toBe(0)
    expect(stats.returnRate).toBeNull()
    expect(Number.isNaN(stats.returnRate as unknown as number)).toBe(false)
  })

  it('watchCount นับจากธงที่ผู้เรียกส่งมา ไม่ใช่คำนวณเกณฑ์เองซ้ำ', () => {
    // ตัวเลขบนการ์ดกับผลของชิปกรอง "ต้องเฝ้าระวัง" ต้องมาจากเกณฑ์เดียวกันเสมอ
    const stats = aggregateCustomerStats([
      { shopReputation: rep({ returned: 2, riskLevel: 'HIGH' }), hasWarning: false },
      { shopReputation: rep(), hasWarning: true },
    ])
    expect(stats.watchCount).toBe(1)
  })
})
