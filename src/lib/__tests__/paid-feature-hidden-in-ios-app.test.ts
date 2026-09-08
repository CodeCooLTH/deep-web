import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { isPaidFeatureRestricted, isPaymentRestricted, isSignUpRestricted } from '@/lib/app-shell'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** ตรวจ *โค้ด* ไม่ใช่คำอธิบาย — ไฟล์ในโปรเจกต์นี้เล่าเหตุผลยาวและอ้างชื่อสัญลักษณ์ในคอมเมนต์ */
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(ROOT, rel)).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue
      walk(rel, out)
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(rel)
    }
  }
  return out
}

const INVENTORY_PAGE = 'src/app/(paces)/seller/(dashboard)/inventory/page.tsx'
const MOVEMENTS_PAGE = 'src/app/(paces)/seller/(dashboard)/inventory/movements/[productId]/page.tsx'

/**
 * feature 00064 — Deep Stock ต้องไม่โผล่ในแอป iOS เลย
 *
 * Apple ข้อ 3.1.3(b) ยอมให้ผู้ใช้เข้าถึงของที่ซื้อจากช่องทางอื่นได้ **ก็ต่อเมื่อของชิ้นนั้น
 * มีขายเป็น In-App Purchase ในแอปด้วย** — user เคาะ 2026-09-01 ว่าขาย IAP เฉพาะ
 * Business Package ส่วน Deep Stock ไม่ขาย (สิทธิ์เป็น "ต่อร้าน" แต่ Apple ขาย
 * auto-renewable ได้ใบเดียวต่อ Apple ID) ⇒ เมื่อไม่ขาย ก็เปิดให้ใช้ในแอปไม่ได้
 *
 * 🛑 ก่อนหน้านี้โค้ด **จงใจ** เปิดให้คนที่สมัครแล้วใช้ต่อในแอป (มีคอมเมนต์อธิบายไว้ทั้งใน
 * `applyPaymentRestriction` และหน้า `/inventory`) ซึ่งถูกตามข้อ 3.1.1 แต่ผิดข้อ 3.1.3(b)
 * เทสชุดนี้จึงมีไว้กันไม่ให้ใครย้อนกลับไปตรรกะเดิมโดยไม่รู้ว่ามันเคยถูกตัดสินไปแล้ว
 */
describe('[blocker] Deep Stock ต้องไม่โผล่ในแอป iOS', () => {
  it('🛑 กฎ 3 ข้อของเปลือกแอปต้องแยกกัน — ห้ามยุบเป็นตัวเดียว', () => {
    /* วันนี้ทั้งสามคืน true บน ios เหมือนกัน แต่มาจากจดหมายคนละรอบและจะถูกผ่อนคนละเวลา
       ถ้ายุบรวม วันที่ผ่อนข้อหนึ่งจะพลอยเปิดอีกสองข้อโดยไม่มีใครตั้งใจ */
    for (const fn of [isPaymentRestricted, isSignUpRestricted, isPaidFeatureRestricted]) {
      expect(fn('ios')).toBe(true)
      expect(fn('web')).toBe(false)
      expect(fn('android')).toBe(false)
    }
    /* ทั้งสามต้องเป็นฟังก์ชันคนละตัวจริง ๆ ไม่ใช่ alias ของกันและกัน */
    const src = strip(read('src/lib/app-shell.ts'))
    for (const name of ['PAYMENT_RESTRICTED_SHELLS', 'SIGNUP_RESTRICTED_SHELLS', 'PAID_FEATURE_RESTRICTED_SHELLS']) {
      expect(src, `${name} ต้องประกาศแยกของตัวเอง`).toContain(name)
    }
  })

  it('🛑 เมนู Deep Stock ต้องหายในแอป **แม้สมัครแล้ว**', () => {
    const src = strip(read('src/lib/seller-menu.ts'))
    /* ต้องมีสาขาที่ลบ seller:inventory โดย **ไม่ผูกกับ entitlementStatus**
       ของเดิมลบเฉพาะตอน `entitlementStatus !== 'ACTIVE'` ซึ่งแปลว่าคนที่จ่ายเงินแล้วยังเห็น */
    expect(src).toContain('hidePaidFeatures')
    const idx = src.indexOf('if (ctx.hidePaidFeatures)')
    expect(idx, 'ไม่เจอสาขาที่ลบเมนูตาม hidePaidFeatures').toBeGreaterThan(-1)
    expect(src.slice(idx, idx + 120)).toContain("seller:inventory")
  })

  it('🛑 หน้า Deep Stock ทุกหน้าต้องกันที่หน้าเอง ไม่ใช่พึ่งการซ่อนเมนู', () => {
    /* โปรเจกต์นี้เขียนกติกาไว้เองว่า "การซ่อนเมนูคือ UX ไม่ใช่การควบคุมสิทธิ์ —
       คนที่พิมพ์ URL ตรงต้องถูกกันที่หน้านั้นเองด้วย" · หน้า movements เคยไม่มีด่านเลย */
    for (const page of [INVENTORY_PAGE, MOVEMENTS_PAGE]) {
      const src = strip(read(page))
      expect(src, `${page} ต้องเรียก shouldHidePaidFeatures()`).toContain('shouldHidePaidFeatures()')
      expect(src, `${page} ต้อง redirect ออกเมื่อถูกซ่อน`).toMatch(
        /shouldHidePaidFeatures\(\)\)\s*redirect\(/,
      )
    }
  })

  it('🛑 ทุกที่ที่สร้างรายการเมนูเอง ต้องส่งข้อจำกัดของเปลือกแอปเข้าไปด้วย', () => {
    /* 🛑 บั๊กที่เจอจริง 2026-09-01: `shortcut.service.ts` สร้างแคตตาล็อกทางลัดจาก
       `resolveVisibleSellerMenu` ตัวเดียวกับ sidebar แต่ **ไม่เคยส่ง hidePayments เลย**
       ⇒ ในแอป iOS ผู้ใช้เห็น "แพ็กเกจ" เป็นทางลัดให้ปักหมุด = ช่องทางเข้าหน้าจ่ายเงิน
       ทั้งที่ sidebar ซ่อนไปแล้ว — คลาสเดียวกับบั๊ก `ShopQuickLinks.tsx` ที่เคยเจอมาก่อน

       ด่านนี้สแกน **ทั้ง src/** ไม่ใช่รายชื่อไฟล์ที่รู้จัก เพราะตัวที่อันตรายคือผู้เรียก
       รายถัดไปที่ยังไม่มีใครเขียน (rule-must-be-enforced-not-described.md) */
    const offenders: string[] = []
    for (const file of walk('src')) {
      const src = strip(read(file))
      let from = 0
      for (;;) {
        const i = src.indexOf('resolveVisibleSellerMenu(', from)
        if (i === -1) break
        from = i + 1
        if (file === 'src/lib/seller-menu.ts') continue // ตัวประกาศเอง
        /* ดูอาร์กิวเมนต์ของการเรียกนี้ — ctx object อยู่ในวงเล็บเดียวกัน */
        const call = src.slice(i, i + 700)
        if (!call.includes('hidePayments') || !call.includes('hidePaidFeatures')) {
          offenders.push(file)
        }
      }
    }
    expect(
      [...new Set(offenders)],
      `สร้างเมนูโดยไม่ส่งข้อจำกัดของเปลือกแอป:\n${[...new Set(offenders)].join('\n')}`,
    ).toEqual([])
  })
})
