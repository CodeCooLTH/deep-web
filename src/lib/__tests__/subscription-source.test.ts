import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { isAppleBilled, isWalletBilled, SUBSCRIPTION_SOURCE } from '@/lib/subscription-source'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** ด่านต้องดู *โค้ด* ไม่ใช่คำอธิบาย — ไฟล์เหล่านี้เล่าเหตุผลไว้ยาวและมีชื่อสัญลักษณ์ในคอมเมนต์
 *  (บทเรียนซ้ำ: grep gate ของ HR9 เคยแดงค้างเพราะไปเจอคอมเมนต์ที่อธิบายกฎของตัวเอง) */
const code = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const SERVICE = 'src/services/business-package.service.ts'
const CRON = 'src/app/api/cron/business-package-lifecycle/route.ts'
const SCHEMA = 'prisma/schema.prisma'

/**
 * feature 00064 — ห้ามเก็บเงินลูกค้าสองต่อ
 *
 * ตั้งแต่เปิด In-App Purchase บน iOS `BusinessPackageSubscription` มีเจ้าของการต่ออายุ
 * **2 คน**: `WALLET` = cron ของเราหักกระเป๋าเงิน · `APPLE_IAP` = Apple ตัดบัตรให้เอง
 *
 * 🛑 ถ้า cron หยิบใบของ Apple ไปต่ออายุ ผู้ขายจะถูกหักเงินสองทาง หรือถ้ากระเป๋าว่าง
 * จะกลายเป็น `LOCKED_RENEWAL_FAILED` แล้ว `lockAllBusinessShops()` จะล็อกร้าน business
 * **ทุกร้าน** ของเขาพร้อมกัน ทั้งที่จ่ายเงินให้ Apple ครบทุกบาท
 *
 * ก่อนฟีเจอร์นี้ query ของ cron เป็น `{ status:'ACTIVE', nextRenewalAt: { lte: now } }`
 * เปล่า ๆ — ไม่มีอะไรกันเลย เพราะตอนนั้นยังไม่มีเจ้าของคนที่สอง
 */
describe('[blocker] ใบที่ Apple เก็บเงิน ห้ามถูกหักกระเป๋าเงินซ้ำ', () => {
  it('🛑 `isWalletBilled` fail-closed — ค่าที่อ่านไม่ออกต้องไม่ใช่ WALLET', () => {
    expect(isWalletBilled(SUBSCRIPTION_SOURCE.WALLET)).toBe(true)
    expect(isWalletBilled(SUBSCRIPTION_SOURCE.APPLE_IAP)).toBe(false)

    /* ค่าที่ไม่รู้จักต้องตอบ false — เดาผิดทางนี้เสียแค่ "ใบนั้นไม่ถูกต่ออายุ" ซึ่งเห็นได้จาก
       รายงานและตามแก้ได้ แต่เดาผิดอีกทางคือหักเงินลูกค้าซ้ำแล้วล็อกร้านเขา กู้คืนไม่ได้ */
    for (const bad of [null, undefined, '', 'wallet', 'WALLET ', 'GOOGLE_PLAY', 'unknown']) {
      expect(isWalletBilled(bad), `ค่า ${JSON.stringify(bad)} ต้องไม่ถูกนับเป็น WALLET`).toBe(false)
    }
  })

  it('🛑 `isAppleBilled` ต้องไม่ใช่แค่ negation ของ `isWalletBilled`', () => {
    /* "ไม่รู้ว่าใครดูแล" ≠ "Apple ดูแล" — ถ้าเขียนเป็น !isWalletBilled() ค่าขยะจะกลายเป็น
       ของ Apple แล้วหลุดเข้าเส้นทาง webhook ที่ไม่ควรแตะมัน */
    expect(isAppleBilled(SUBSCRIPTION_SOURCE.APPLE_IAP)).toBe(true)
    expect(isAppleBilled(SUBSCRIPTION_SOURCE.WALLET)).toBe(false)
    for (const bad of [null, undefined, '', 'apple', 'GOOGLE_PLAY']) {
      expect(isAppleBilled(bad), `ค่า ${JSON.stringify(bad)} ต้องไม่ถูกนับเป็น Apple`).toBe(false)
    }
  })

  it('🛑 ทุกฟังก์ชันที่หัก `deductCredit` ต้องผ่านด่านแหล่งที่มาก่อน', () => {
    /* ตรวจ **ทุกฟังก์ชันในไฟล์** ไม่ใช่รายชื่อที่ hardcode ไว้ — ด่านที่ผูกกับรายชื่อจะเงียบ
       ทันทีที่มีคนเพิ่มฟังก์ชันใหม่ที่หักเงิน ซึ่งคือกรณีที่เราต้องการให้มันดังที่สุด
       (docs/conventions/rule-must-be-enforced-not-described.md) */
    const src = code(SERVICE)
    const blocks = src.split(/\bexport async function /).slice(1)
    expect(blocks.length, 'แยกฟังก์ชันไม่ได้ — รูปแบบไฟล์เปลี่ยนไป ด่านนี้ต้องถูกเขียนใหม่')
      .toBeGreaterThan(4)

    /* 🛑 มีวิธีพิสูจน์ความปลอดภัย **2 แบบ** ที่ถูกต้องเท่ากัน — ด่านที่รู้จักแบบเดียว
       จะไปแดงใส่โค้ดที่ถูกอยู่แล้ว แล้วสุดท้ายจะถูกปิดทิ้ง (บทเรียนซ้ำจากด่าน [TAP]):

         แบบที่ 1 "ตรวจของที่มีอยู่" — มีแถวอยู่แล้ว ⇒ ต้องอ่าน `source` ก่อนหักเงิน
         แบบที่ 2 "สร้างใหม่เป็นของกระเป๋าเงิน" — ยังไม่มีแถวให้ตรวจ (`subscribeBusinessPackage`)
                  ความปลอดภัยมาจาก การกันไม่ให้มีใบซ้ำ + เขียน source เป็น WALLET ตรง ๆ */
    const unguarded: string[] = []
    for (const b of blocks) {
      if (!b.includes('deductCredit(')) continue
      const name = b.slice(0, b.indexOf('(')).trim()
      const checksExisting = b.includes('assertWalletBilled(') || b.includes('isWalletBilled(')
      const createsWalletRow =
        b.includes('source: SUBSCRIPTION_SOURCE.WALLET') && b.includes('SUBSCRIPTION_ALREADY_EXISTS')
      if (!checksExisting && !createsWalletRow) unguarded.push(name)
    }
    expect(unguarded, `ฟังก์ชันที่หักเงินโดยไม่เช็คแหล่งที่มา: ${unguarded.join(', ')}`).toEqual([])
  })

  it('🛑 ด่านต้องมาก่อน `deductCredit` ไม่ใช่หลัง', () => {
    /* เช็คทีหลัง = เงินออกจากกระเป๋าไปแล้ว แล้ว throw ทำได้แค่ rollback ซึ่งขึ้นกับว่า
       ผู้เรียกอยู่ในทรานแซกชันเดียวกันจริงไหม — อย่าฝากความถูกต้องไว้กับเรื่องนั้น */
    const src = code(SERVICE)
    const blocks = src.split(/\bexport async function /).slice(1)
    const wrongOrder: string[] = []
    for (const b of blocks) {
      const deduct = b.indexOf('deductCredit(')
      if (deduct === -1) continue
      const name = b.slice(0, b.indexOf('(')).trim()
      /* ตัวที่ปลอดภัยด้วย "สร้างใหม่" ไม่มีด่านให้เรียงลำดับ — ตัวกันของมันคือ
         `SUBSCRIPTION_ALREADY_EXISTS` ซึ่งต้องมาก่อนหักเงินแทน */
      if (b.includes('source: SUBSCRIPTION_SOURCE.WALLET')) {
        const exists = b.indexOf('SUBSCRIPTION_ALREADY_EXISTS')
        if (exists === -1 || exists > deduct) wrongOrder.push(name)
        continue
      }
      const guardPositions = [b.indexOf('assertWalletBilled('), b.indexOf('isWalletBilled(')]
        .filter((i) => i !== -1)
      if (!guardPositions.length || Math.min(...guardPositions) > deduct) wrongOrder.push(name)
    }
    expect(wrongOrder, `ด่านอยู่หลังการหักเงิน: ${wrongOrder.join(', ')}`).toEqual([])
  })

  it('🛑 ฟังก์ชันที่แก้ tier / ลบแถว ก็ต้องมีด่าน ไม่ใช่เฉพาะตัวที่หักเงิน', () => {
    /* ขยับ tier ของใบที่ Apple ดูแล = ตัวเลขฝั่งเราเพี้ยนจากที่ Apple เก็บเงินจริง
       ลบแถว = Apple ยังเก็บเงินรอบถัดไป แต่เราลืมเขาแล้ว ⇒ เก็บเงินโดยไม่ให้ของ */
    const src = code(SERVICE)
    const blocks = src.split(/\bexport async function /).slice(1)
    const byName = new Map<string, string>()
    for (const b of blocks) byName.set(b.slice(0, b.indexOf('(')).trim(), b)

    for (const fn of [
      'upgradeBusinessPackage',
      'downgradeBusinessPackage',
      'cancelBusinessPackage',
      'reactivateBusinessPackage',
    ]) {
      const body = byName.get(fn)
      expect(body, `ไม่เจอฟังก์ชัน ${fn} — ถูกเปลี่ยนชื่อ? ด่านนี้ต้องถูกปรับตาม`).toBeTruthy()
      expect(
        body!.includes('assertWalletBilled(') || body!.includes('isWalletBilled('),
        `${fn} แก้ subscription ได้โดยไม่เช็คแหล่งที่มา`,
      ).toBe(true)
    }
  })

  it('🛑 cron ต้องกรอง `source` ตั้งแต่ใน query — ห้ามลากใบของ Apple มาตั้งแต่แรก', () => {
    const src = code(CRON)
    expect(src, 'cron ต้องอ้าง SUBSCRIPTION_SOURCE ไม่ใช่พิมพ์สตริงเอง').toContain('SUBSCRIPTION_SOURCE.WALLET')
    /* ต้องอยู่ใน where ของ findMany ที่ดึงรายชื่อมาต่ออายุ ไม่ใช่โผล่ที่ไหนก็ได้ในไฟล์ */
    const where = src.slice(src.indexOf('businessPackageSubscription.findMany'))
    expect(where.slice(0, 400)).toContain('source')
  })

  it('🛑 คอลัมน์ `source` ต้อง default เป็น WALLET — ไม่งั้นแถวเดิมหลุดจาก cron เงียบ ๆ', () => {
    /* ถ้า default ไม่ใช่ WALLET (หรือเป็น NULL) แถวที่มีอยู่บน prod จะไม่ผ่านตัวกรอง
       แล้วลูกค้าที่จ่ายเงินอยู่จะถูกปล่อยให้หมดอายุโดยไม่มีอะไรฟ้อง */
    const schema = read(SCHEMA)
    const model = schema.slice(
      schema.indexOf('model BusinessPackageSubscription'),
      schema.indexOf('model AppleIapNotification'),
    )
    expect(model).toMatch(/source\s+String\s+@default\("WALLET"\)/)
    /* กติกา BR-IAP-04 ต้องบังคับที่ฐาน ไม่ใช่แค่ที่โค้ด — webhook กับการยืนยันจากเครื่อง
       วิ่งเข้ามาพร้อมกันได้ find-then-insert แพ้ race เสมอ */
    expect(model).toMatch(/appleOriginalTransactionId\s+String\?\s+@unique/)
  })
})
