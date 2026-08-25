/**
 * [blocker] รายชื่อขนส่งที่ร้านเลือกได้ (feature 00056 · D-2)
 *
 * 🛑 คลาสที่เสี่ยงที่สุดของไฟล์ `courier.ts` คือ **โลโก้หายเงียบ ๆ** — ไม่มี error ไม่มี type ผิด
 * มีแค่กล่องตัวย่อโผล่แทนโลโก้บนจอ ซึ่งไม่มีใครรายงานเพราะมัน "ก็ยังอ่านออก"
 * รอบนี้ความเสี่ยงเพิ่มอีกชั้น: ตั้งแต่ 00056 เราเก็บ **รหัสของเราเอง** ('THAIPOST') ลงฐาน
 * ซึ่ง regex เดิมที่เขียนไว้จับ *ชื่อจริงของ iShip* จับไม่ได้เลย
 *
 * แดง = ห้าม merge
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  COURIER_OPTIONS,
  OTHER_COURIER_CODE,
  courierBrandCode,
  courierInitials,
  courierLabel,
  courierLogoUrl,
} from '../courier'

const REAL = COURIER_OPTIONS.filter((o) => o.code !== OTHER_COURIER_CODE)

describe('[blocker] COURIER_OPTIONS', () => {
  it('มีเจ้าจริงครบ + "อื่น ๆ" อยู่ท้ายลิสต์เสมอ', () => {
    expect(REAL.length).toBeGreaterThanOrEqual(8)
    expect(COURIER_OPTIONS.at(-1)?.code).toBe(OTHER_COURIER_CODE)
    // iShip เป็น *วิธีคืน* (radio ข้อแรก) ไม่ใช่ "ขนส่งเจ้าอื่นที่ร้านไปเปิดพัสดุเอง"
    expect(COURIER_OPTIONS.some((o) => o.code === 'ISHIP')).toBe(false)
  })

  it('รหัสและชื่อไม่ซ้ำกัน', () => {
    expect(new Set(COURIER_OPTIONS.map((o) => o.code)).size).toBe(COURIER_OPTIONS.length)
    expect(new Set(COURIER_OPTIONS.map((o) => o.label)).size).toBe(COURIER_OPTIONS.length)
  })

  /**
   * 🛑 นี่คือเทสที่กันบั๊กจริงของรอบนี้: ร้านเลือก "ไปรษณีย์ไทย" → เก็บ `'THAIPOST'` →
   * หน้าจอเรียก `courierLogoUrl('THAIPOST')` ซึ่ง **ไม่ match `/thailand\s*post/`**
   * ⇒ ถ้าไม่มีการเทียบรหัสตรงตัวก่อน โลโก้จะหายเฉพาะเจ้าที่ร้านเลือกเอง โดยไม่มีอะไรฟ้อง
   */
  it('[blocker] รหัสที่บันทึกลงฐานย้อนกลับมาหาแบรนด์/โลโก้ของตัวเองได้ทุกตัว', () => {
    for (const o of REAL) {
      expect(courierBrandCode(o.code), o.code).toBe(o.code)
      expect(courierLogoUrl(o.code), o.code).toBe(o.logo)
      expect(courierLogoUrl(o.code)).not.toBeNull()
    }
  })

  it('[blocker] ไฟล์โลโก้ทุกตัวมีอยู่จริงใน public/', () => {
    for (const o of REAL) {
      const abs = path.join(process.cwd(), 'public', o.logo!.replace(/^\//, ''))
      expect(existsSync(abs), `${o.code} → ${o.logo}`).toBe(true)
    }
  })

  it('"อื่น ๆ" ไม่มีโลโก้ และไม่ถูกจับเป็นแบรนด์ไหน', () => {
    expect(COURIER_OPTIONS.at(-1)?.logo).toBeNull()
    expect(courierBrandCode(OTHER_COURIER_CODE)).toBeNull()
    expect(courierLogoUrl(OTHER_COURIER_CODE)).toBeNull()
    // ไม่มีโลโก้ = ต้องยังมีอะไรให้แสดง ไม่ใช่ช่องว่าง
    expect(courierInitials('อื่น ๆ')).not.toBe('?')
  })

  /** ชื่อจริงของแพ็กเกจจำเพาะกว่าชื่อแบรนด์ และเป็นสิ่งที่ร้านเห็นตอนเลือก — ต้องชนะเสมอ */
  it('[blocker] courierLabel: ชื่อจริงชนะรหัส · ไม่มีชื่อจึงถอยไปชื่อแบรนด์ · ไม่มีอะไรเลย = null', () => {
    expect(courierLabel('FlashExpressA', 'Flash Thunder')).toBe('Flash Thunder')
    expect(courierLabel('THAIPOST', null)).toBe('ไปรษณีย์ไทย')
    expect(courierLabel('THAIPOST', '   ')).toBe('ไปรษณีย์ไทย')
    // รหัสที่ไม่รู้จักต้องแสดงตัวมันเอง ไม่ใช่หายไปหรือกลายเป็นเจ้าแรกในลิสต์
    expect(courierLabel('WEIRD_LOCAL', null)).toBe('WEIRD_LOCAL')
    expect(courierLabel(null, null)).toBeNull()
  })

  /** พัสดุที่ระบบเปิดผ่าน iShip ยังต้องจับคู่โลโก้ได้เหมือนเดิม — regex ต้องไม่ถูกถอด */
  it('[blocker] ชื่อแพ็กเกจจริงของ iShip ยังจับคู่โลโก้ได้ (regex ไม่ถูกแทนที่ด้วยรหัส)', () => {
    expect(courierBrandCode('FlashExpressA', 'Flash Thunder')).toBe('FLASH')
    expect(courierBrandCode('KEXA', 'KEX Jumbo')).toBe('KERRY')
    expect(courierBrandCode('THPA', 'ไปรษณีย์ไทย (EMS) X')).toBe('THAIPOST')
    expect(courierBrandCode(null, 'J&T Express')).toBe('JANDT')
    expect(courierBrandCode(null, 'ขนส่งบ้านนอก')).toBeNull()
  })
})
