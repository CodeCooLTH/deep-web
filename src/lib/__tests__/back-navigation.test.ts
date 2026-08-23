/**
 * ด่านของปุ่ม "ย้อนกลับ" — กันลูปที่ user เจอบน prod 2026-08-23
 *
 * อาการ: กดย้อนกลับที่ `/orders/{token}/edit` → มาหน้ารายละเอียด → กดย้อนกลับ →
 * **กลับเข้าหน้าแก้ไขอีก** วนไม่รู้จบ
 *
 * ต้นเหตุ: ปุ่มย้อนกลับสั่ง `router.push()` ซึ่ง **เพิ่ม** entry เข้าประวัติ ทั้งที่ปุ่มนี้
 * สัญญากับผู้ใช้ว่าจะ *ถอย* · หน้าปลายทางใช้ `back()` ตามปกติ ⇒ สองหน้าผลักกันไปมา
 *
 * เกณฑ์ที่ด่านนี้บังคับ (invariant เดียวที่กันลูปได้จริง):
 * **ปุ่มย้อนกลับต้องไม่ทำให้ประวัติยาวขึ้น เว้นแต่ตอนที่ไม่มีอะไรให้ถอยเลย**
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  BACK_LAST_RESORT_HREF,
  resolveBackNavigation,
  type BackNavigationInput,
} from '@/lib/back-navigation'

/** ค่าตั้งต้นของ "อยู่กลางแอป มีที่ให้ถอย" */
const inApp = (over: Partial<BackNavigationInput> = {}): BackNavigationInput => ({
  historyLength: 5,
  ...over,
})

describe('invariant หลัก — ปุ่มย้อนกลับห้ามทำให้ประวัติยาวขึ้น', () => {
  it('[blocker] ทุกกรณีที่ยังมีประวัติให้ถอย ต้องไม่ใช่ push', () => {
    /**
     * 🛑 นี่คือเกณฑ์เดียวที่กันลูปได้ — ไม่ใช่ "ต้องไป url ไหน"
     * ไล่ทุกส่วนผสมของ prop เพื่อไม่ให้มีสาขาไหนหลุด (สาขาที่หลุดคือสาขาที่พังจริงรอบนี้)
     */
    const hrefs = [undefined, '/orders', '/orders/abc']
    for (const backHref of hrefs) {
      for (const backFallbackHref of hrefs) {
        for (const historyLength of [2, 5, 50]) {
          const nav = resolveBackNavigation({ backHref, backFallbackHref, historyLength })
          expect(
            nav.action,
            `backHref=${backHref} fallback=${backFallbackHref} len=${historyLength} → ห้าม push`,
          ).not.toBe('push')
        }
      }
    }
  })

  it('[blocker] push ได้เฉพาะตอนไม่มีอะไรให้ถอยจริง ๆ', () => {
    /* เปิดลิงก์ขึ้นมาตรง ๆ — `back()` ตรงนี้จะพาออกจากแอปไปเลย ซึ่งแย่กว่าเพิ่ม entry */
    expect(resolveBackNavigation({ historyLength: 1 })).toEqual({
      action: 'push',
      href: BACK_LAST_RESORT_HREF,
    })
    expect(resolveBackNavigation({ historyLength: 0, backFallbackHref: '/orders/abc' })).toEqual({
      action: 'push',
      href: '/orders/abc',
    })
  })
})

describe('backFallbackHref — หน้าที่มีหลายทางเข้า (หน้าแก้ไขออเดอร์)', () => {
  it('[blocker] มีประวัติ = ถอย ไม่ใช่ไปที่ href ที่ให้มา', () => {
    /**
     * 🛑 เคสของบั๊กจริง · หน้าแก้ไขออเดอร์เข้าได้ 2 ทาง (ปุ่มแก้ไขบนหน้ารายละเอียด และ
     * เมนู ⋮ ในรายการออเดอร์) ⇒ ปลายทางที่ถูกคือ "ที่ที่เพิ่งมา" ซึ่งไม่คงที่
     * ถ้าตอบเป็น replace/push ไปหน้ารายละเอียด คนที่มาจากรายการจะถูกพาไปหน้าที่ไม่เคยอยู่
     */
    expect(resolveBackNavigation(inApp({ backFallbackHref: '/orders/abc' }))).toEqual({
      action: 'back',
    })
  })

  it('[blocker] ไม่มีประวัติ = ใช้ค่าสำรองที่ให้มา ไม่ตกไป /dashboard', () => {
    expect(resolveBackNavigation({ historyLength: 1, backFallbackHref: '/orders/abc' })).toEqual({
      action: 'push',
      href: '/orders/abc',
    })
  })
})

describe('backHref — ปลายทางตายตัว (orders/new · ตัวจัดหน้าร้าน · rich-menu)', () => {
  it('[blocker] ต้องเป็น replace ห้ามเป็น push', () => {
    /**
     * 🛑 "ปลายทางตายตัว" ตอบว่า *จะไปไหน* ไม่ใช่ใบอนุญาตให้เพิ่ม entry
     * `push` ที่นี่คือรูปร่างของลูปเดิมเป๊ะ ๆ แค่ย้ายไปเกิดกับหน้าอื่น:
     * `[.., orders, new]` → push(orders) → `[.., orders, new, orders]` → back → กลับเข้า new
     */
    expect(resolveBackNavigation(inApp({ backHref: '/orders' }))).toEqual({
      action: 'replace',
      href: '/orders',
    })
  })

  it('[blocker] ปลายทางตายตัวชนะค่าสำรองเสมอ และไม่ขึ้นกับความยาวประวัติ', () => {
    /* ถ้าสาขานี้ไปขึ้นกับ historyLength เมื่อไหร่ พฤติกรรมจะเปลี่ยนตามว่าผู้ใช้เดินมาทางไหน
       ซึ่งขัดกับคำว่า "ตายตัว" ที่เป็นเหตุผลทั้งหมดที่ prop นี้มีอยู่ */
    for (const historyLength of [0, 1, 2, 99]) {
      expect(
        resolveBackNavigation({ backHref: '/orders', backFallbackHref: '/x', historyLength }),
      ).toEqual({ action: 'replace', href: '/orders' })
    }
  })
})

describe('ตัวเรียกจริงต้องผูกกับกติกานี้', () => {
  it('[blocker] หน้าแก้ไขออเดอร์ต้องใช้ backFallbackHref ไม่ใช่ backHref', () => {
    /**
     * 🛑 ปักหมุดที่ call site ด้วย เพราะ `resolveBackNavigation` ถูกทุกอย่างแล้วก็จริง
     * แต่ถ้าหน้านี้ส่ง prop ผิดตัว ลูปเดิมกลับมาทันทีโดยที่เทสข้างบนยังเขียวหมด
     * (บทเรียน `rule-must-be-enforced-not-described.md` — ด่านต้องผูกกับของที่พังจริง)
     */
    const src = readFileSync(
      join(process.cwd(), 'src/app/(paces)/seller/(fullscreen)/orders/[token]/edit/page.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '')

    expect(src, 'ต้องส่ง backFallbackHref').toMatch(/backFallbackHref=\{/)
    /* 🛑 ต้องมี `\s` นำหน้า — สตริง "backFallbackHref" **มี "backHref" อยู่ข้างใน**
       (`...Fal|lbackHref`) ⇒ ร่างแรกใช้ `[^k]backHref` แล้วแดงใส่โค้ดที่ทำถูก
       ด่านที่จับ substring ของชื่อ prop อีกตัวคือด่านที่ไม่มีใครเชื่อแล้วโดนปิดทิ้ง */
    expect(src, 'ห้ามกลับไปใช้ backHref — มันสั่ง replace ไปหน้าที่ผู้ใช้อาจไม่เคยอยู่').not.toMatch(
      /\sbackHref=/,
    )
  })

  it('[blocker] ปุ่มย้อนกลับห้ามตัดสินเอง ต้องเรียกตัวตัดสินกลาง', () => {
    /* ถ้ามีใครเขียน if/else กลับเข้าไปใน component ตรรกะจะไม่มีที่ให้เทสจับอีก
       ซึ่งเป็นสภาพก่อนหน้าที่ทำให้บั๊กนี้อยู่ได้โดยไม่มีอะไรฟ้อง */
    const src = readFileSync(
      join(process.cwd(), 'src/app/(paces)/seller/(fullscreen)/_shared/FullscreenBackButton.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '')

    expect(src, 'ต้องเรียก resolveBackNavigation').toMatch(/resolveBackNavigation\(/)
    expect(src, 'ห้าม push ปลายทางแบบตายตัวเองในไฟล์นี้').not.toMatch(/router\.push\(backHref/)
  })
})
