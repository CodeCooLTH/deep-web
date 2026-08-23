/**
 * ด่านของ "สินค้าราคา ฿0" — สามชั้นต้องยอมเท่ากัน
 *
 * user สั่ง 2026-08-23: *"สร้าง และ แก้ไข ต้อง มีราคา 0 ให้ด้วยนะ"*
 *
 * ## ทำไมต้องมีด่าน
 *
 * เพดานล่างของราคาถูกบังคับ **3 ชั้นคนละไฟล์คนละภาษา** และทั้งสามต้องพูดตรงกัน:
 *
 * | ชั้น | ที่อยู่ | เดิม |
 * |---|---|---|
 * | HTML | `ProductPriceCardV2.tsx` — `min=` ของ `<input type="number">` | `0.01` |
 * | ฟอร์ม (Yup) | `ProductFormV2.tsx` — `price` | `.positive()` |
 * | เซิร์ฟเวอร์ (Valibot) | `validations.ts` — `CreateProductSchema` **และ** `UpdateProductSchema` | `minValue(0.01)` |
 *
 * 🛑 แก้ไม่ครบแล้ว **ไม่มีอะไรฟ้อง** — `tsc`/build/eslint ผ่านหมด เพราะทุกชั้นถูกในตัวเอง
 * อาการจะไปโผล่ที่ผู้ใช้เป็นอย่างใดอย่างหนึ่ง:
 *   · ชั้น server ค้าง → กรอก 0 ได้ กด "บันทึก" แล้วเด้ง error ที่ฟอร์มอธิบายไม่ได้
 *   · `CreateProductSchema` ปลดแต่ `UpdateProductSchema` ค้าง → **สร้างสินค้า ฿0 ได้ แต่แก้ไม่ได้**
 *     (ร้านจะเจอตอนกลับมาแก้ทีหลัง ซึ่งห่างจากตอนสร้างเป็นวัน)
 *
 * ## 🛑 ฿0 ≠ "ยังไม่ได้ตั้งราคา"
 *
 * ช่องราคายัง `required` เหมือนเดิม — ค่าที่แปลว่า "ยังไม่ได้ตั้ง" คือช่องว่าง (`undefined`)
 * ไม่ใช่ `0` · ปล่อยให้ปล่อยว่างได้เมื่อไหร่ สินค้าที่ลืมกรอกราคาจะกลายเป็นของฟรีเงียบ ๆ
 * (คลาสเดียวกับ `0` ที่ถูกใช้แทน "ไม่รู้" — `partial-data-must-be-labeled-or-filled.md`)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import { CreateProductSchema, UpdateProductSchema } from '@/lib/validations'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const CARD = 'src/app/(paces)/seller/(dashboard)/products/components/ProductPriceCardV2.tsx'
const FORM = 'src/app/(paces)/seller/(dashboard)/products/components/ProductFormV2.tsx'

/** สินค้าที่ผ่านทุก field ยกเว้นราคาที่ส่งเข้ามาทดสอบ */
const productWith = (price: number) => ({ name: 'ของแถม', price, type: 'PHYSICAL' })

describe('ชั้นเซิร์ฟเวอร์ต้องรับ ฿0 ทั้งตอนสร้างและตอนแก้', () => {
  it('[blocker] สร้างสินค้าราคา 0 ต้องผ่าน', () => {
    expect(v.safeParse(CreateProductSchema, productWith(0)).success).toBe(true)
  })

  it('[blocker] แก้สินค้าเป็นราคา 0 ต้องผ่าน — ไม่งั้นสร้างได้แต่แก้ไม่ได้', () => {
    expect(v.safeParse(UpdateProductSchema, { price: 0 }).success).toBe(true)
  })

  it('[blocker] ราคาติดลบต้องยังไม่ผ่าน — ปลดเพดานล่าง ไม่ใช่ถอดทิ้ง', () => {
    /* ถ้าเผลอเปลี่ยนเป็น `v.number()` เปล่า ๆ เทสสองข้อบนก็ยังเขียว แต่ราคา −500 จะลงฐานได้
       แล้วยอดขายทั้งเดือนติดลบโดยไม่มีใครรู้ว่ามาจากไหน */
    expect(v.safeParse(CreateProductSchema, productWith(-1)).success).toBe(false)
    expect(v.safeParse(UpdateProductSchema, { price: -0.01 }).success).toBe(false)
  })

  it('[blocker] ช่องราคายังบังคับกรอก — ฿0 ไม่ได้แปลว่าปล่อยว่างได้', () => {
    expect(v.safeParse(CreateProductSchema, { name: 'ของแถม', type: 'PHYSICAL' }).success).toBe(false)
  })
})

describe('ชั้นหน้าจอต้องยอมเท่ากับชั้นเซิร์ฟเวอร์', () => {
  it('[blocker] input min ต้องเป็น 0 ไม่ใช่ 0.01', () => {
    /* min ของ input เป็นด่านที่ **เบราว์เซอร์** บังคับก่อนถึง JS — ค้างไว้ที่ 0.01 แล้ว
       ผู้ใช้จะพิมพ์ 0 แล้วถูกบล็อกตั้งแต่ยังไม่ได้กดอะไร โดยไม่มีข้อความอธิบายเป็นภาษาไทย */
    expect(read(CARD)).toMatch(/min="0"/)
    expect(read(CARD), 'ห้ามเหลือ min="0.01"').not.toMatch(/min="0\.01"/)
  })

  it('[blocker] Yup ต้องเป็น .min(0) ไม่ใช่ .positive()', () => {
    /* 🛑 ตัดคอมเมนต์ก่อน — คอมเมนต์ที่อธิบายกฎนี้เขียนคำว่า `.positive()` ไว้ในตัวมันเอง
       ด่านที่ไม่ตัดจะแดงใส่โค้ดที่ทำถูก (รอยเดิม: grep gate ของ HR9) */
    const code = stripComments(read(FORM))
    const at = code.indexOf('price: Yup.number()')
    expect(at, 'ต้องเจอ rule ของ price').toBeGreaterThan(-1)
    const rule = code.slice(at, at + 500)
    expect(rule, 'ต้องใช้ .min(0)').toMatch(/\.min\(0,/)
    expect(rule, 'ห้ามกลับไป .positive() — มันแปลว่า > 0').not.toMatch(/\.positive\(/)
    expect(rule, 'ต้องยังบังคับกรอก').toMatch(/\.required\(/)
  })

  it('[blocker] ชิปราคาแนะนำต้องมี 0 และต้องอยู่หัวแถว', () => {
    /* หัวแถวเพราะเป็นค่าที่ต่ำสุด — เรียงเลขจากน้อยไปมากคือสิ่งที่ตาอ่านโดยไม่ต้องคิด
       และเป็นตัวเดียวที่ "ไม่ใช่ราคาขายปกติ" จึงต้องหาเจอทันทีโดยไม่ต้องกวาดทั้งแถว */
    const m = /const QUICK_PICK_PRICES = \[([^\]]*)\]/.exec(read(CARD))
    expect(m, 'ต้องเจอ QUICK_PICK_PRICES').not.toBeNull()
    const nums = m![1].split(',').map((x) => Number(x.trim()))
    expect(nums, 'ต้องมี ฿0 ในชิป').toContain(0)
    expect(nums[0], '฿0 ต้องอยู่ตัวแรก').toBe(0)
    expect([...nums].sort((a, b) => a - b), 'ต้องเรียงจากน้อยไปมาก').toEqual(nums)
  })
})
