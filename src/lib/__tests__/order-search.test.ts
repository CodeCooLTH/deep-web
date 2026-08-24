import { describe, expect, it } from 'vitest'

import {
  ORDER_SEARCH_MIN_CHARS,
  countMatchingOrders,
  isExactIdentifierMatch,
  isSearchActive,
  searchOrders,
  type SearchableOrder,
} from '../order-search'

/**
 * ชุดข้อมูลทดสอบของ feature 00058
 *
 * 🛑 ค่าที่ดู "แปลก" ในนี้ทุกตัวมีหน้าที่ — ห้ามลบเพราะคิดว่าซ้ำกับเคสอื่น
 * (`docs/conventions/mutation-silence-means-weak-corpus.md`: mutation ที่เงียบแปลว่าชุด
 * ข้อมูลอ่อน ไม่ใช่ mutation ไม่เกี่ยว)
 *   - A เก็บเบอร์ **มีขีดคั่น** ส่วน B เก็บ **ตัวเลขล้วน** → พิสูจน์ว่าตัดสัญลักษณ์ทั้งสองฝั่งจริง
 *     (ข้อมูล prod มีทั้งสองแบบปนกัน — ทางเข้าเพิ่งถูกบีบเมื่อ 2026-08-21 ของเก่าไม่ถูกแก้)
 *   - D เก็บเบอร์ **11 หลัก** (ผู้ขายพิมพ์เกิน) → เป็นใบที่ "ตรงแบบ substring แต่ไม่ตรงเต็มค่า"
 *     ซึ่งเป็นเงื่อนไขเดียวที่ทำให้เทสการลอยขึ้นบนสุดมีความหมาย
 *   - C ไม่มีเบอร์ ไม่มีพัสดุ มีสินค้าชิ้นเดียวที่ชื่อมีตัวเลข → กันทั้ง null และกันการ
 *     "ให้สิทธิ์ตัวเลขแทนที่จะเป็นสิทธิ์เพิ่ม" (ชื่อสินค้าที่มีเลขต้องยังค้นด้วยเลขได้)
 */
const A: SearchableOrder = {
  id: '51043fb1',
  publicToken: '51043fb1-9c2e-4a77-b3d1-000000000001',
  shortCode: 'AB12CD34',
  createdAtISO: '2026-07-15T03:00:00.000Z', // 10:00 น. เวลาไทย → งวด 256907
  buyerName: 'สมชาย ใจดี',
  buyerUsername: null,
  buyerPhone: '081-234-5678',
  shipment: { trackingNo: 'TH0665398112' },
  items: [{ name: 'เสื้อยืดสีขาว' }, { name: 'กางเกงยีนส์' }],
}

const B: SearchableOrder = {
  id: '92ab77cd',
  publicToken: '92ab77cd-1111-2222-3333-000000000002',
  shortCode: 'ZZ99YY88',
  createdAtISO: '2026-08-02T05:00:00.000Z',
  buyerName: 'สมชาย มานะ',
  buyerUsername: null,
  buyerPhone: '0812349999',
  shipment: null,
  items: [{ name: 'รองเท้าผ้าใบ' }, { name: 'ถุงเท้า' }, { name: 'เสื้อยืดสีดำ' }],
}

const C: SearchableOrder = {
  id: 'cccc0000',
  publicToken: 'cccc0000-4444-5555-6666-000000000003',
  shortCode: null,
  createdAtISO: '2026-08-03T05:00:00.000Z',
  buyerName: null,
  buyerUsername: null,
  buyerPhone: null,
  shipment: undefined,
  items: [{ name: 'ค่าบริการ 250 บาท' }],
}

/** เบอร์พิมพ์เกินหนึ่งหลัก — ข้อมูลสกปรกที่เกิดขึ้นจริงเวลาผู้ขายคีย์มือ */
const D: SearchableOrder = {
  id: 'dddd1111',
  publicToken: 'dddd1111-7777-8888-9999-000000000004',
  shortCode: null,
  createdAtISO: '2026-08-04T05:00:00.000Z',
  buyerName: 'ปรีชา',
  buyerUsername: null,
  buyerPhone: '08123456780',
  shipment: null,
  items: [{ name: 'หมวก' }],
}

/**
 * ใบที่ "มีเศษของเบอร์กระจายอยู่คนละฟิลด์" — 081 อยู่ท้ายเบอร์ · 234 อยู่ในชื่อ · 5678 อยู่ในเลขพัสดุ
 * ไม่มีอะไรเกี่ยวกับเบอร์ 081-234-5678 เลยสักนิด มีไว้เพื่อพิสูจน์ว่าเบอร์ที่ก็อปมาพร้อมช่องว่าง
 * ถูกอ่านเป็น "เลขก้อนเดียว" ไม่ใช่ "สามคำที่ต้องตรงคนละที่ก็ได้"
 */
const E: SearchableOrder = {
  id: 'eeee2222',
  publicToken: 'eeee2222-aaaa-bbbb-cccc-000000000005',
  shortCode: null,
  createdAtISO: '2026-08-05T05:00:00.000Z',
  buyerName: 'ณัฐพล 234',
  buyerUsername: null,
  buyerPhone: '0999999081',
  shipment: { trackingNo: 'XX5678' },
  items: [{ name: 'ของฝาก' }],
}

const ALL = [A, B, C, D, E]
const tokensOf = (q: string, list: SearchableOrder[] = ALL) => searchOrders(list, q).map((h) => h.order.id)

describe('order-search — เกณฑ์ขั้นต่ำ', () => {
  it('[blocker] ต่ำกว่า 2 ตัวอักษรต้องไม่กรองอะไรเลย', () => {
    // "ก" ตรงแค่ A (กางเกงยีนส์) กับ C (ค่าบริการ) — ถ้าเกณฑ์ถูกผ่อนเป็น 1 ตัวอักษร
    // ผลจะเหลือ 2 ใบแทนที่จะเป็นทั้ง 5
    expect(tokensOf('ก')).toEqual(['51043fb1', '92ab77cd', 'cccc0000', 'dddd1111', 'eeee2222'])
    expect(isSearchActive('ก')).toBe(false)
    expect(ORDER_SEARCH_MIN_CHARS).toBe(2)
  })

  it('[blocker] ช่องว่างล้วนไม่นับเป็นตัวอักษร', () => {
    expect(isSearchActive('   ')).toBe(false)
    expect(tokensOf('   ')).toHaveLength(5)
  })

  it('2 ตัวอักษรเริ่มกรองทันที', () => {
    expect(isSearchActive('กา')).toBe(true)
    expect(tokensOf('กา')).toEqual(['51043fb1', 'cccc0000'])
  })
})

describe('order-search — เบอร์โทรที่เก็บคนละรูปแบบ', () => {
  it('[blocker] เก็บมีขีด พิมพ์ไม่มีขีด ต้องเจอ', () => {
    // D (เบอร์พิมพ์เกินเป็น 08123456780) ตรงด้วยแบบ substring — ถูกต้องแล้ว
    // แต่ A ที่ตรงเต็มค่าต้องมาก่อนเสมอ
    expect(tokensOf('0812345678')).toEqual(['51043fb1', 'dddd1111'])
  })

  it('[blocker] เก็บไม่มีขีด พิมพ์มีขีด ต้องเจอ', () => {
    expect(tokensOf('081-234-9999')).toEqual(['92ab77cd'])
  })

  it('[blocker] พิมพ์เฉพาะ 4 ตัวท้ายต้องเจอ', () => {
    // ตรงกับท้ายเบอร์ของ A/D และท้ายเลขพัสดุของ E — ท่อนสั้นย่อมกว้าง ไม่ใช่บั๊ก
    // สิ่งที่ต้องไม่เกิดคือ "ไม่เจอเลย" ซึ่งเป็นพฤติกรรมเดิมก่อนฟีเจอร์นี้
    expect(tokensOf('5678')).toEqual(['51043fb1', 'dddd1111', 'eeee2222'])
  })

  it('[blocker] เบอร์ที่ก็อปมาพร้อมช่องว่าง = เลขก้อนเดียว ไม่ใช่สามคำ', () => {
    // E มี 081 ในเบอร์ · 234 ในชื่อ · 5678 ในเลขพัสดุ — คนละฟิลด์กันหมด
    // ถ้าหั่นเป็น 3 คำแล้ว AND ทีละท่อน E จะติดมาด้วยทั้งที่ไม่เกี่ยวกับเบอร์นี้เลย
    expect(tokensOf('081 234 5678')).toEqual(tokensOf('0812345678'))
    expect(tokensOf('081 234 5678')).not.toContain('eeee2222')
  })
})

describe('order-search — เลขพัสดุ', () => {
  it('[blocker] ค้นเลขพัสดุเต็มได้ (ก่อนหน้านี้ค้นไม่ได้เลยทั้งสองจอ)', () => {
    expect(tokensOf('TH0665398112')).toEqual(['51043fb1'])
  })

  it('[blocker] ค้นเฉพาะท่อนตัวเลขของเลขพัสดุได้', () => {
    expect(tokensOf('0665398112')).toEqual(['51043fb1'])
  })

  it('ไม่สนตัวพิมพ์เล็กใหญ่', () => {
    expect(tokensOf('th0665398112')).toEqual(['51043fb1'])
  })
})

describe('order-search — เลขคำสั่งซื้อ', () => {
  it('[blocker] ค้นเลขคำสั่งซื้อเต็มที่ผู้ขายเห็นบนจอได้', () => {
    // ค่าคงที่โดยตั้งใจ ไม่เรียก formatOrderNo มาคำนวณเทียบกับตัวเอง (จะกลายเป็น tautology)
    expect(tokensOf('DP25690751043FB1')).toEqual(['51043fb1'])
  })

  it('ค้นด้วยโค้ด 8 ตัวท้ายได้ (ตัวพิมพ์เล็กก็ได้)', () => {
    expect(tokensOf('51043fb1')).toEqual(['51043fb1'])
  })

  it('ค้นด้วยรหัสสั้นที่ผู้ขายใช้แชร์ลิงก์ได้', () => {
    expect(tokensOf('ZZ99YY88')).toEqual(['92ab77cd'])
  })

  it('[blocker] รหัสสั้นตรงเต็มค่าเท่านั้น — ตรงบางส่วนต้องไม่เจอ', () => {
    // รหัสสั้นเป็นฟิลด์เดียวที่ไม่เคยแสดงบนจอ ⇒ ถ้าตรงแบบ substring ได้
    // ใบจะโผล่มาโดยไม่มีอะไรถูกไฮไลต์ = ผลลัพธ์ที่ผู้ใช้อธิบายไม่ได้
    expect(tokensOf('ZZ99')).toEqual([])
    expect(tokensOf('99YY88')).toEqual([])
  })

  it('[blocker] รหัสสั้นที่ตรงต้องได้สัญญาณ "ตรงเต็มค่า" เสมอ (ไม่งั้นจะไม่มีอะไรอธิบายผล)', () => {
    const hits = searchOrders(ALL, 'zz99yy88')
    expect(hits).toHaveLength(1)
    expect(hits[0].isExactMatch).toBe(true)
  })
})

describe('order-search — ชื่อสินค้า', () => {
  it('[blocker] ค้นชื่อสินค้าได้ (เดสก์ท็อปเดิมได้แต่ [object Object])', () => {
    expect(tokensOf('ยีนส์')).toEqual(['51043fb1'])
  })

  it('[blocker] บอกได้ว่าตรงที่สินค้าชิ้นไหน — จอที่ยุบรายการไว้ต้องกางให้ถูกใบถูกชิ้น', () => {
    const hits = searchOrders(ALL, 'เสื้อยืดสีดำ')
    expect(hits).toHaveLength(1)
    expect(hits[0].order.id).toBe('92ab77cd')
    expect(hits[0].matchedItemIndexes).toEqual([2])
  })

  it('[blocker] ตัวเลขในชื่อสินค้าต้องยังค้นด้วยตัวเลขได้ — สิทธิ์ของคำตัวเลขเป็นสิทธิ์ "เพิ่ม" ไม่ใช่ "แทน"', () => {
    expect(tokensOf('250')).toEqual(['cccc0000'])
  })

  it('ใบที่ตรงชื่อผู้ซื้อแต่ไม่ตรงสินค้า ต้องไม่มี matchedItemIndexes', () => {
    const hits = searchOrders(ALL, 'ปรีชา')
    expect(hits[0].matchedItemIndexes).toEqual([])
  })
})

describe('order-search — หลายคำ', () => {
  it('[blocker] ทุกคำต้องตรง (AND) ไม่ใช่ตรงคำใดคำหนึ่ง', () => {
    // "สมชาย" ตรงทั้ง A และ B — "5678" ตรงเฉพาะ A ⇒ ถ้าเป็น OR จะได้ทั้งคู่
    expect(tokensOf('สมชาย 5678')).toEqual(['51043fb1'])
  })

  it('[blocker] คนละคำตรงคนละฟิลด์ได้ — ไม่ใช่ต้องตรงในฟิลด์เดียวกัน', () => {
    // "ใจดี" อยู่ในชื่อผู้ซื้อ · "TH0665" อยู่ในเลขพัสดุ — ไม่มีฟิลด์ไหนมีทั้งสองคำ
    expect(tokensOf('ใจดี TH0665')).toEqual(['51043fb1'])
  })

  it('[blocker] ช่องว่างหัวท้าย/ซ้อนกัน ต้องไม่เปลี่ยนผล', () => {
    expect(tokensOf('   สมชาย    5678  ')).toEqual(tokensOf('สมชาย 5678'))
  })

  it('คำที่ไม่ตรงสักใบ → ผลว่าง ไม่ใช่คืนทั้งหมด', () => {
    expect(tokensOf('สมชาย ไม่มีคำนี้')).toEqual([])
  })
})

describe('order-search — คำค้นตัวหนังสือต้องไม่ถูกตัดสัญลักษณ์', () => {
  it('[blocker] "เสื้อ-ยืด" ต้องไม่ไปตรงกับ "เสื้อยืดสีขาว"', () => {
    // ถ้ามีใครขยายการตัดสัญลักษณ์ให้ครอบคำค้นภาษาไทยด้วย เทสนี้จะแดง —
    // การตัดขีดจากข้อความแปลว่าผู้ใช้จะเจอผลที่ตัวเองไม่ได้พิมพ์ และอธิบายไม่ได้ว่าทำไม
    expect(tokensOf('เสื้อ-ยืด')).toEqual([])
    expect(tokensOf('เสื้อยืด')).toEqual(['51043fb1', '92ab77cd'])
  })
})

describe('order-search — การลอยขึ้นบนสุดของใบที่ตรงเต็มค่า', () => {
  it('[blocker] ใบที่ตรงเต็มค่าขึ้นก่อน แม้อยู่ท้ายรายการที่รับเข้ามา', () => {
    // D (เบอร์ 11 หลัก) ตรงแบบ substring · A ตรงเต็มค่า — ส่ง D เข้าไปก่อน A
    const hits = searchOrders([D, A], '0812345678')
    expect(hits.map((h) => h.order.id)).toEqual(['51043fb1', 'dddd1111'])
    expect(hits[0].isExactMatch).toBe(true)
    expect(hits[1].isExactMatch).toBe(false)
  })

  it('[blocker] ไม่มีใบไหนตรงเต็มค่า → ลำดับเดิมทุกใบ ห้ามเรียงใหม่', () => {
    expect(tokensOf('เสื้อยืด', [B, A])).toEqual(['92ab77cd', '51043fb1'])
  })

  it('[blocker] ชื่อผู้ซื้อที่ตรงเป๊ะไม่นับเป็น "ตรงเต็มค่า" — ชื่อซ้ำกันได้', () => {
    const hits = searchOrders(ALL, 'สมชาย ใจดี')
    expect(hits.map((h) => h.order.id)).toEqual(['51043fb1'])
    expect(hits[0].isExactMatch).toBe(false)
  })

  it('[blocker] ชื่อสินค้าที่ตรงเป๊ะก็ไม่นับเป็น "ตรงเต็มค่า"', () => {
    expect(isExactIdentifierMatch(A, 'กางเกงยีนส์')).toBe(false)
  })

  it('เลขพัสดุที่ตรงเป๊ะนับเป็นตรงเต็มค่า', () => {
    expect(isExactIdentifierMatch(A, 'TH0665398112')).toBe(true)
  })

  it('เบอร์ที่ตรงเต็มค่าแม้เก็บคนละรูปแบบ ก็นับ', () => {
    expect(isExactIdentifierMatch(A, '0812345678')).toBe(true)
    expect(isExactIdentifierMatch(D, '0812345678')).toBe(false)
  })
})

describe('order-search — ออเดอร์ที่ข้อมูลไม่ครบ', () => {
  it('[blocker] ใบที่ไม่มีเบอร์/พัสดุ/ชื่อ ต้องไม่ทำให้พัง และต้องไม่ตรงกับคำค้นของใบอื่น', () => {
    expect(() => searchOrders([C], '0812345678')).not.toThrow()
    expect(tokensOf('0812345678', [C])).toEqual([])
  })

  it('ร้านที่ไม่มีแกนพัสดุ (shipment เป็น undefined) ค้นได้ปกติ', () => {
    expect(tokensOf('ค่าบริการ', [C])).toEqual(['cccc0000'])
  })
})

describe('order-search — ตัวนับสำหรับประโยค "พบ N รายการในทั้งร้าน"', () => {
  it('[blocker] นับด้วยเกณฑ์เดียวกับตัวกรอง — ห้ามนับคนละแบบกับที่กรอง', () => {
    expect(countMatchingOrders(ALL, 'สมชาย')).toBe(2)
    expect(countMatchingOrders(ALL, 'สมชาย')).toBe(searchOrders(ALL, 'สมชาย').length)
  })

  it('คำค้นสั้นเกินเกณฑ์ → 0 ไม่ใช่จำนวนทั้งหมด (ปุ่มจะได้ไม่โผล่มาหลอกให้กด)', () => {
    expect(countMatchingOrders(ALL, 'ก')).toBe(0)
  })
})
