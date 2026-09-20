/**
 * [blocker] iPad ต้องไม่เหลือช่องว่างเปล่าข้างฟอร์ม (2026-09-20)
 *
 * ## บั๊กจริง — หัวหน้าเทสบน iPad แล้วถ่ายรูปมา 2 หน้า
 *
 * ### 1. `/shop` — ฟอร์มกว้างแค่ 2/3 ของการ์ด
 *
 * กริดเขียนว่า `md:grid-cols-3` (แตกคอลัมน์ตั้งแต่ 768px) แต่ลูกคนแรกของกริด
 * (แถบ step) เป็น `hidden lg:block` = **โผล่ที่ 1024px ขึ้นไปเท่านั้น**
 *
 * 🛑 `display:none` ทำให้กล่อง **กว้าง 0 แต่ยังถูกจองที่ในกริดอยู่** ⇒ ช่วง 768–1023px
 * (iPad แนวตั้ง 820px พอดี) กริดแบ่ง 3 คอลัมน์ · คอลัมน์แรกว่างเปล่า · เนื้อหาได้ 2 คอลัมน์
 * ⇒ ผู้ใช้เห็นฟอร์มลีบอยู่ซ้ายมือ และที่ว่าง 1/3 ทางขวาที่ไม่มีอะไรเลย
 *
 * วัดจริงก่อนแก้ที่ 820px: กริด 780px = 3 × 246.66px · ลูกที่ซ่อน = 0px
 * · ช่อง "ชื่อร้าน" = 513px (66%) — หลังแก้ = 780px (100%)
 *
 * ### 2. `/account` — การ์ดถูกบีบเหลือ 672px
 *
 * `max-w-2xl` เปล่า ๆ บังคับทุกขนาดจอ ทั้งที่เหตุผลที่เขียนกำกับไว้พูดถึง **จอ 1440px**
 * ⇒ iPad (820/1180px) โดนบีบไปด้วยทั้งที่มีที่ว่างเหลือเฟือ
 *
 * วัดจริงหลังแก้: 820→788px · 1180→1065px · 1280→672px · 1440→672px
 * (เพดานเดสก์ท็อปยังอยู่ครบตามเจตนาเดิม)
 *
 * ## ทำไมเป็นเทสสแกนซอร์ส
 *
 * รีโปนี้ตั้ง `environment: "node"` และไม่มี jsdom ⇒ วัด layout ในเทสไม่ได้
 * ด่านนี้จึงกันที่ **กติกา** แทน: "กริดห้ามแตกคอลัมน์ที่ breakpoint ที่ลูกของมันยังซ่อนอยู่"
 * ซึ่งเป็นรูปร่างของบั๊กทั้งคลาส ไม่ใช่แค่ตัวเลขของหน้านี้
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const SHOP_FORM = 'src/app/(paces)/seller/(dashboard)/shop/components/ShopForm.tsx'
const ACCOUNT_PAGE = 'src/app/(paces)/seller/(dashboard)/account/page.tsx'

/** ตัดคอมเมนต์ทิ้งก่อนสแกน — ไฟล์พวกนี้เล่าบั๊กไว้ยาวและมีคลาสที่ผิดอยู่ในคำอธิบาย
 *  (คลาสเดียวกับ grep gate ของ HR9 ที่เคยแดงค้างเพราะไปเจอคำเตือนของตัวเอง) */
function code(rel: string): string {
  return readFileSync(rel, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('[blocker] /shop — กริดห้ามแตกคอลัมน์ก่อนแถบ step จะโผล่', () => {
  /**
   * 🛑 ต้องผูกกับ **ลูกคนแรกของกริดตัวนั้น** ไม่ใช่หาสตริง `hidden lg:block` ลอย ๆ ทั้งไฟล์
   *
   * ร่างแรกเขียน `toContain('hidden lg:block')` แล้ว mutation พิสูจน์ว่าจับไม่ได้ —
   * ไฟล์นี้มีคลาสนั้นอยู่ **3 จุด** เปลี่ยน breakpoint ของแถบ step ทิ้งไปเลยก็ยังเขียว
   * เพราะเทสไปเจอจุดอื่นแทน (บทเรียน `mutation-silence-means-weak-corpus.md`)
   */
  it('🛑 breakpoint ของแถบ step ต้องเท่ากับ breakpoint ที่กริดแตกคอลัมน์', () => {
    const src = code(SHOP_FORM)
    const at = src.indexOf('grid grid-cols-1 lg:grid-cols-4')
    expect(at, 'ไม่เจอกริดหลักของฟอร์ม').toBeGreaterThan(-1)
    /* ลูกคนแรกหลังเปิดกริด — ต้องซ่อนจนถึง lg เท่ากับที่กริดแตกคอลัมน์ */
    const firstChildClass = src.slice(at).match(/className="(hidden [a-z0-9]+:block)"/)?.[1]
    expect(
      firstChildClass,
      'ลูกคนแรกของกริดต้องซ่อนที่ lg — คนละ breakpoint กับกริด = คอลัมน์ว่างหรือของซ้อนกัน',
    ).toBe('hidden lg:block')
  })

  it('🛑 กริดต้องแตกคอลัมน์ที่ lg เท่านั้น — ห้ามมี md:grid-cols-*', () => {
    const src = code(SHOP_FORM)
    expect(src, 'ไม่เจอกริดหลักของฟอร์ม').toMatch(/grid grid-cols-1 lg:grid-cols-4/)
    expect(
      src,
      'md:grid-cols-* = จองที่ให้คอลัมน์ที่ยังซ่อนอยู่ ⇒ ช่องว่างเปล่าบน iPad กลับมา',
    ).not.toMatch(/md:grid-cols-/)
  })

  it('🛑 เนื้อหาต้อง span ที่ lg เท่านั้น — ห้ามมี md:col-span-*', () => {
    const src = code(SHOP_FORM)
    expect(src).toContain('lg:col-span-3')
    expect(
      src,
      'span ที่ breakpoint ที่ยังไม่มีคอลัมน์ให้ span = ที่มาของบั๊กเดิม',
    ).not.toMatch(/md:col-span-/)
  })
})

describe('[blocker] /account — เพดานความกว้างต้องเริ่มที่เดสก์ท็อป ไม่ใช่ทุกจอ', () => {
  it('🛑 ต้องเป็น w-full + xl:max-w-2xl ไม่ใช่ max-w-2xl เปล่า ๆ', () => {
    const src = code(ACCOUNT_PAGE)
    expect(src, 'ต่ำกว่า xl ต้องกว้างเต็มพื้นที่ (iPad)').toContain('w-full xl:max-w-2xl')
    /**
     * 🛑 ต้องจับ "เพดานที่ไม่มี breakpoint" ให้ได้ ไม่ใช่แค่หาคำว่า max-w-2xl เฉย ๆ
     * เพราะตัวที่ถูก (`xl:max-w-2xl`) ก็มีสตริงนั้นอยู่ข้างใน
     */
    const bareCap = /(?<![a-z0-9:])max-w-2xl/.test(src.replace(/xl:max-w-2xl/g, ''))
    expect(bareCap, 'ยังมี max-w-2xl ที่ไม่ผูก breakpoint = iPad โดนบีบเหมือนเดิม').toBe(false)
  })
})
