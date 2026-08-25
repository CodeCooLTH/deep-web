/**
 * [blocker] ตรรกะของจอคืนของ (feature 00056 · re-design 2026-08-25)
 *
 * 🛑 ทุกตัวในไฟล์นี้เป็น boolean/สถานะที่ **เขียนกลับด้านได้ง่ายมาก และผลคือร้านเสียเงินจริง**
 * — นั่นคือเกณฑ์ทั้งหมดที่ทำให้มันต้องอยู่ใน `src/lib/` แทนที่จะเป็นเทอร์นารีกลาง JSX
 * (`docs/conventions/ui-boolean-needs-a-testable-home.md`)
 *
 * แดง = ห้าม merge
 */
import { describe, it, expect } from 'vitest'

import { RETURN_METHODS, type ReturnMethodKey } from '../order-return'
import {
  METHOD_STEP_BLOCK_TEXT,
  RETURN_PRICE_TEXT,
  defaultReturnCourier,
  methodStepBlock,
  methodUsesIship,
  resolveReturnPriceState,
  selectableReturnMethods,
  type QuoteRow,
  type ReturnPriceInput,
} from '../return-sheet'

const ROWS: QuoteRow[] = [
  { courierCode: 'THPA', courierName: 'ไปรษณีย์ไทย (EMS) X', totalPrice: 45 },
  { courierCode: 'FlashExpressA', courierName: 'Flash Thunder', totalPrice: 52 },
]

const base: ReturnPriceInput = {
  method: 'ISHIP',
  hasBox: true,
  loading: false,
  error: null,
  rows: ROWS,
  courierCode: 'THPA',
}

describe('[blocker] selectableReturnMethods', () => {
  it('เชื่อม iShip แล้ว = เห็นครบ 3 ข้อ', () => {
    expect(selectableReturnMethods(true).map((m) => m.key)).toEqual(
      RETURN_METHODS.map((m) => m.key),
    )
  })

  /**
   * 🛑 ซ่อนทั้งข้อ ไม่ใช่ disable — ยกจากพี่น้อง `ShipmentEntryModal.showSegmented`
   * ตัวเลือกที่กดไม่ได้แต่ยังอยู่บนจอ = คำเชิญให้กดสิ่งที่ไม่มีวันสำเร็จ
   */
  it('[blocker] ยังไม่เชื่อม iShip → ข้อ "ส่งด้วย iShip" หายทั้งข้อ แต่วิธีอื่นยังครบ', () => {
    const keys = selectableReturnMethods(false).map((m) => m.key)
    expect(keys).not.toContain('ISHIP')
    expect(keys).toEqual(['SHOP_SELF', 'BUYER_SELF'])
  })

  it('[blocker] ไม่มีทางคืนลิสต์ว่าง — ร้านต้องเปิดใบคืนได้เสมอแม้ไม่มี iShip', () => {
    for (const connected of [true, false]) {
      expect(selectableReturnMethods(connected).length, String(connected)).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('[blocker] methodUsesIship', () => {
  it('เฉพาะวิธีที่ระบบเป็นคนออกเลขให้', () => {
    expect(methodUsesIship('ISHIP')).toBe(true)
    expect(methodUsesIship('SHOP_SELF')).toBe(false)
    expect(methodUsesIship('BUYER_SELF')).toBe(false)
  })

  /**
   * 🛑 ต้อง derive จากคุณสมบัติของวิธี ไม่ใช่เทียบชื่อคีย์ — เพิ่มวิธีที่ระบบออกเลขให้
   * ในอนาคตแล้วจอต้องทำถูกเอง · เทสนี้ผูกกับ `sourceWithTracking` โดยตรง
   */
  it('[blocker] ตรงกับ sourceWithTracking ของทุกวิธี ไม่ใช่ hardcode ชื่อ', () => {
    for (const m of RETURN_METHODS) {
      expect(methodUsesIship(m.key), m.key).toBe(m.sourceWithTracking === null)
    }
  })
})

describe('[blocker] resolveReturnPriceState', () => {
  it('มีราคาของเจ้าที่เลือก → แสดงตัวเลขนั้น ไม่ใช่ของเจ้าที่ถูกที่สุด', () => {
    expect(resolveReturnPriceState(base)).toEqual({ kind: 'PRICE', amount: 45 })
    expect(resolveReturnPriceState({ ...base, courierCode: 'FlashExpressA' })).toEqual({
      kind: 'PRICE',
      amount: 52,
    })
  })

  /**
   * 🛑 คลาสที่อันตรายที่สุดของแถวนี้: 4 สถานะที่ **ไม่มีตัวเลข** ถ้าถูกยุบเป็น ฿0
   * ร้านจะอ่านว่า "ส่งฟรี" ซึ่งเป็นข้อเท็จจริงคนละเรื่องกับ "ยังไม่รู้"
   */
  it('[blocker] ทุกสถานะที่ไม่มีตัวเลข ต้องไม่ใช่ PRICE และไม่มี amount เลย', () => {
    const cases: [string, ReturnPriceInput][] = [
      ['วิธีอื่นที่เราไม่ได้จ่าย', { ...base, method: 'SHOP_SELF' }],
      ['ยังไม่เลือกวิธี', { ...base, method: null }],
      ['ไม่รู้ขนาดกล่อง', { ...base, hasBox: false }],
      ['กำลังโหลด', { ...base, loading: true }],
      ['ยิงราคาไม่สำเร็จ', { ...base, error: 'ร้านยังไม่ได้เชื่อมต่อ iShip' }],
      ['ยังไม่เคยโหลด', { ...base, rows: null }],
      ['เจ้าที่เลือกไม่อยู่ในผล', { ...base, courierCode: 'NOT_IN_LIST' }],
      ['ยังไม่ได้เลือกเจ้าไหน', { ...base, courierCode: null }],
      // iShip เคยตอบ 0 แล้วชนะ "ถูกที่สุด" ทั้งที่ใช้ส่งจริงไม่ได้ (prod 2026-08-06)
      ['ราคา 0 = ไม่รองรับเส้นทางนี้', { ...base, rows: [{ ...ROWS[0]!, totalPrice: 0 }] }],
    ]
    for (const [label, input] of cases) {
      const s = resolveReturnPriceState(input)
      expect(s.kind, label).not.toBe('PRICE')
      expect(s, label).not.toHaveProperty('amount')
    }
  })

  /**
   * 🛑 โหลดใหม่ต้องชนะ error เก่า — ไม่งั้นเปลี่ยนขนส่งแล้วยังเห็นข้อความ error ของเจ้า
   * ก่อนหน้าค้างอยู่ระหว่างที่คำขอใหม่กำลังวิ่ง ซึ่งอ่านว่า "เจ้าใหม่ก็พังเหมือนกัน"
   */
  it('[blocker] loading ชนะ error เก่า · แต่ "ไม่รู้ขนาดกล่อง" ชนะทั้งคู่', () => {
    expect(resolveReturnPriceState({ ...base, loading: true, error: 'เก่า' }).kind).toBe('LOADING')
    expect(
      resolveReturnPriceState({ ...base, hasBox: false, loading: true, error: 'เก่า' }).kind,
    ).toBe('NO_PARCEL')
  })

  it('[blocker] วิธีที่เราไม่ได้จ่าย = HIDDEN ไม่ว่าจะมีราคาในมือหรือไม่', () => {
    // ราคาของ iShip ไม่เกี่ยวกับพัสดุที่ร้านไปเปิดเองที่เคาน์เตอร์ — แสดงไปคือโกหก
    for (const key of ['SHOP_SELF', 'BUYER_SELF'] as ReturnMethodKey[]) {
      expect(resolveReturnPriceState({ ...base, method: key }).kind, key).toBe('HIDDEN')
      expect(resolveReturnPriceState({ ...base, method: key, hasBox: false }).kind, key).toBe('HIDDEN')
    }
  })

  it('ข้อความของสถานะที่ไม่มีตัวเลข ต้องบอกทางแก้ ไม่ใช่แค่บอกว่าพัง', () => {
    expect(RETURN_PRICE_TEXT.NO_PARCEL).toContain('กรอกขนาด')
    expect(RETURN_PRICE_TEXT.NO_QUOTE).toContain('เปลี่ยนขนส่ง')
    // ห้ามมีคำว่า ฿0 หรือ 0 บาท ในข้อความที่แปลว่า "ยังไม่รู้"
    for (const t of Object.values(RETURN_PRICE_TEXT)) expect(t).not.toMatch(/฿\s*0|0\s*บาท/)
  })
})

describe('[blocker] methodStepBlock', () => {
  it('มีราคาแล้ว / กำลังโหลด → กดถัดไปได้', () => {
    expect(methodStepBlock('ISHIP', { kind: 'PRICE', amount: 45 })).toBeNull()
    // ราคาเป็นข้อมูลประกอบ ไม่ใช่เงื่อนไข — รอโหลดอยู่ก็เปิดใบคืนได้
    expect(methodStepBlock('ISHIP', { kind: 'LOADING' })).toBeNull()
  })

  it('[blocker] ยังไม่เลือกวิธี → บล็อกเสมอ ไม่ว่าสถานะราคาจะเป็นอะไร', () => {
    for (const price of [
      { kind: 'HIDDEN' } as const,
      { kind: 'PRICE', amount: 45 } as const,
      { kind: 'LOADING' } as const,
    ]) {
      expect(methodStepBlock(null, price), price.kind).toBe('NO_METHOD')
    }
  })

  /**
   * 🛑 บล็อกเฉพาะตอนที่เดินต่อแล้วจะล้มจริง — ขนส่งที่ไม่มีราคาให้เส้นทางนี้ = เปิดพัสดุ
   * ไม่ผ่านแน่นอน ปล่อยผ่านคือให้ร้านเปิดใบคืนที่ออกเลขไม่ได้แล้วค้างอยู่อย่างนั้น
   */
  it('[blocker] iShip: ไม่รู้กล่อง / ไม่มีราคา / ยิงไม่สำเร็จ → บล็อกพร้อมเหตุผลคนละอัน', () => {
    expect(methodStepBlock('ISHIP', { kind: 'NO_PARCEL' })).toBe('NO_PARCEL')
    expect(methodStepBlock('ISHIP', { kind: 'NO_QUOTE' })).toBe('NO_QUOTE')
    expect(methodStepBlock('ISHIP', { kind: 'ERROR', text: 'x' })).toBe('QUOTE_ERROR')
    // เหตุผลต้องต่างกันจริง ไม่ใช่ข้อความเดียวใช้ทุกเคส (ร้านจะไล่แก้ผิดจุด)
    const texts = new Set(
      (['NO_PARCEL', 'NO_QUOTE', 'QUOTE_ERROR'] as const).map((k) => METHOD_STEP_BLOCK_TEXT[k]),
    )
    expect(texts.size).toBe(3)
  })

  /**
   * 🛑 วิธีที่ร้าน/ลูกค้าส่งเอง **ไม่มีอะไรบล็อกได้เลยนอกจาก "ยังไม่เลือกวิธี"**
   * เลขพัสดุเว้นว่างได้ (D-4) และเราไม่ได้เป็นคนเปิดพัสดุ — เอาเงื่อนไขของ iShip
   * ไปบังคับกับมันคือถอดความสามารถที่มติ D-4 เพิ่งเปิดให้
   */
  it('[blocker] ร้าน/ลูกค้าส่งเอง: เลือกวิธีแล้วต้องกดถัดไปได้เสมอ', () => {
    for (const key of ['SHOP_SELF', 'BUYER_SELF'] as ReturnMethodKey[]) {
      // สถานะราคาของวิธีเหล่านี้คือ HIDDEN เสมอ (resolveReturnPriceState) แต่กันเผื่อ
      // มีคนส่งสถานะอื่นเข้ามาผิด ๆ ก็ยังต้องไม่บล็อก
      for (const price of [
        { kind: 'HIDDEN' } as const,
        { kind: 'NO_PARCEL' } as const,
        { kind: 'NO_QUOTE' } as const,
      ]) {
        const blocked = methodStepBlock(key, resolveReturnPriceState({ ...base, method: key }))
        expect(blocked, `${key}/${price.kind}`).toBeNull()
      }
    }
  })
})

describe('[blocker] defaultReturnCourier', () => {
  it('iShip: เจ้าเดียวกับขาไปมาก่อน', () => {
    expect(
      defaultReturnCourier({
        method: 'ISHIP',
        forwardCourierCode: 'FlashExpressA',
        rows: ROWS,
        brandFallback: 'FLASH',
      }),
    ).toBe('FlashExpressA')
  })

  it('iShip: ขาไปไม่อยู่ในบัญชีแล้ว → เจ้าที่ถูกที่สุด (rows เรียงมาแล้ว)', () => {
    expect(
      defaultReturnCourier({
        method: 'ISHIP',
        forwardCourierCode: 'GONE',
        rows: ROWS,
        brandFallback: null,
      }),
    ).toBe('THPA')
  })

  /**
   * 🛑 คืน null ได้ และนั่นคือค่าที่ถูก — ค่าที่ถูกเลือกไว้ให้จะกลายเป็นค่าที่ **ถูกบันทึกจริง**
   * ถ้าร้านไม่แตะ dropdown เลย ⇒ ถอยไปหยิบเจ้าแรกในลิสต์แบบสุ่มคือการเลือกขนส่งแทนร้าน
   */
  it('[blocker] iShip: ไม่มีผลราคาเลย → null ห้ามเดาเจ้าให้', () => {
    for (const rows of [null, []]) {
      expect(
        defaultReturnCourier({
          method: 'ISHIP',
          forwardCourierCode: 'FlashExpressA',
          rows,
          brandFallback: 'FLASH',
        }),
        String(rows),
      ).toBeNull()
    }
  })

  it('[blocker] วิธีอื่น: ใช้รหัสแบรนด์ ไม่ใช่รหัสแพ็กเกจของ iShip', () => {
    for (const key of ['SHOP_SELF', 'BUYER_SELF'] as ReturnMethodKey[]) {
      // แพ็กเกจ 'FlashExpressA' ไม่มีใน COURIER_OPTIONS ⇒ dropdown จะไม่มีค่านั้นให้เลือก
      // แล้ว <select> จะเด้งกลับเป็นตัวแรกเงียบ ๆ = ร้านได้ขนส่งที่ไม่ได้เลือก
      expect(
        defaultReturnCourier({
          method: key,
          forwardCourierCode: 'FlashExpressA',
          rows: ROWS,
          brandFallback: 'FLASH',
        }),
        key,
      ).toBe('FLASH')
      expect(
        defaultReturnCourier({ method: key, forwardCourierCode: null, rows: ROWS, brandFallback: null }),
        key,
      ).toBeNull()
    }
  })
})
