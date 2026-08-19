import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] เนื้อหาหลักต้องใช้พื้นที่จอแท็บเล็ต — ห้ามค้างที่ความกว้างของมือถือ
 *
 * ## บั๊กที่ด่านนี้กัน (user ทัก 2026-08-19 พร้อมสกรีนช็อต iPad)
 *
 * *"มันไม่เต็มอ่ะ ipad อ่ะ"* — รายการคำสั่งซื้อ/สินค้าและฟอร์มสินค้า ถูกจำกัดความกว้างไว้
 * ที่ขนาดมือถือ แล้วจัดกลาง ⇒ บน iPad เหลือขอบว่างข้างละ 68–130px
 *
 * 🛑 **ไม่มี gate ไหนของโปรเจกต์เห็นเรื่องนี้ได้เลย** — `tsc`/build/eslint/theme-guard ผ่านหมด
 * เพราะคลาสถูกทุกตัวอักษร สิ่งที่ผิดคือ *ค่าที่เลือก* และมันเห็นได้เฉพาะบนจอที่กว้างกว่ามือถือ
 * ซึ่งไม่มีใครเปิดดูระหว่างพัฒนา (เครื่อง dev = เดสก์ท็อป ซึ่งข้ามช่วงนี้ไปเลย)
 *
 * ## ทำไมผูกกับ `md:` โดยเฉพาะ
 *
 * เปลือกมือถือของ seller ครอบ `<1024px` (`safepay-overrides.css`) ⇒ **ช่วง 768–1023 คือ
 * แท็บเล็ตที่ยังใช้เลย์เอาต์มือถืออยู่** ถ้าไม่มี `md:` มาขยาย ค่าที่ตั้งไว้เพื่อมือถือจะถูก
 * ใช้กับ iPad ทั้งเครื่อง
 *
 * 🛑 แดง = ห้าม merge
 */

const ROOT = process.cwd()
const SELLER = 'src/app/(paces)/seller'
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** ลบเนื้อคอมเมนต์แต่คงจำนวนบรรทัด — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย */
const blankComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (m, indent: string) => indent)

describe('[blocker] เนื้อหาหลักต้องขยายบนแท็บเล็ต', () => {
  /**
   * รายการการ์ด 2 หน้านี้เป็นฝาแฝดกัน (โครง `-mx-4 md:mx-auto` + marker `*-fullbleed`)
   * ⇒ ต้องกว้างเท่ากันเสมอ ไม่งั้นผู้ใช้สลับ 2 แท็บแล้วเจอความกว้างไม่เท่ากันบนจอเดียวกัน
   */
  const CARD_LISTS = [
    [`${SELLER}/(dashboard)/orders/components/OrdersList.tsx`, 'orders-fullbleed'],
    [`${SELLER}/(dashboard)/products/components/ProductsListing.tsx`, 'products-fullbleed'],
  ] as const

  for (const [rel, marker] of CARD_LISTS) {
    it(`${rel.split('/').pop()} — รายการการ์ดต้องกว้างพอบน iPad`, () => {
      const code = blankComments(read(rel))
      const line = code.split('\n').find((l) => l.includes(marker)) ?? ''
      expect(line, `${marker}: หาแถวคอนเทนเนอร์ไม่เจอ`).toBeTruthy()
      /**
       * 🛑 `md:max-w-2xl` (672px) คือค่าที่พัง — iPad แนวตั้งมีเนื้อที่ 712–802px
       * ⇒ ต่ำกว่าเนื้อที่จริงทุกรุ่น เหลือขอบว่างเสมอ
       */
      expect(line, 'ห้ามกลับไป md:max-w-2xl — แคบกว่าเนื้อที่ iPad ทุกรุ่น').not.toMatch(
        /md:max-w-2xl/,
      )
      expect(line, 'ต้องมีเพดานสำหรับแท็บเล็ตที่ ≥ 4xl').toMatch(/md:max-w-(?:4xl|5xl|6xl|7xl)/)
    })
  }

  it('[blocker] ฟอร์มสินค้ากับฟอร์มประมูลต้องกว้างเท่ากันบนแท็บเล็ต', () => {
    /**
     * `AuctionForm` ทำถูกอยู่ก่อนแล้ว (`md:max-w-3xl`) ส่วน `ProductFormV2` กระโดดจาก
     * มือถือไปเดสก์ท็อปโดยข้ามช่วงแท็บเล็ต — สองฟอร์มโครงเดียวกันแต่คนละความกว้างบนจอเดียวกัน
     * (`docs/conventions/sibling-surface-parity.md`)
     */
    const grab = (rel: string) => {
      const m = blankComments(read(rel)).match(/md:max-w-(\w+)/)
      return m?.[1] ?? null
    }
    const product = grab(`${SELLER}/(dashboard)/products/components/ProductFormV2.tsx`)
    const auction = grab(`${SELLER}/(fullscreen)/auctions/components/AuctionForm.tsx`)
    expect(product, 'ฟอร์มสินค้าต้องประกาศความกว้างระดับแท็บเล็ต').toBeTruthy()
    expect(auction, 'ฟอร์มประมูลต้องประกาศความกว้างระดับแท็บเล็ต').toBeTruthy()
    expect(product, 'สองฟอร์มพี่น้องต้องกว้างเท่ากันบนแท็บเล็ต').toBe(auction)
  })
})
