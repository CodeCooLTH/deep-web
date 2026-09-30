/**
 * [blocker] Apple ออก `sub` แยกตาม `aud` — ผู้ขายคนเดียวจึงมีได้ **หลาย** Apple sub
 *
 * ## ที่มา (2026-09-27)
 *
 * ผู้ขายที่เคยเชื่อม Apple **ทางเว็บ** กดล็อกอินด้วย Apple **ในแอป** แล้วได้
 * *"ไม่พบบัญชีผู้ขายสำหรับข้อมูลที่ใช้เข้าสู่ระบบนี้"* ทั้งที่เป็นคนเดียวกัน
 *
 * เพราะโทเคนของ Apple มี `aud` 2 ค่าในระบบนี้:
 *   ทางเว็บ → Services ID  `com.deepthailand.seller.web`  (`APPLE_CLIENT_ID`)
 *   ในแอป   → bundle id    `com.deepthailand.seller`      (`APPLE_APP_BUNDLE_ID`)
 *
 * และ Apple ให้ `sub` เท่ากันข้าม `aud` **ก็ต่อเมื่อ identifier ถูกจัดกลุ่มใต้ primary
 * App ID ในพอร์ทัล** — ซึ่งเป็น **การตั้งค่านอกรีโปที่โค้ดตรวจสอบไม่ได้เลย**
 *
 * ## ด่านนี้คุมอะไร
 *
 * คุม **ข้อสมมติที่โค้ดต้องอยู่ได้ไม่ว่าพอร์ทัลจะตั้งถูกหรือผิด**:
 *   1. ตัวตรวจต้องรับ **ทั้งสอง** `aud` (รับค่าเดียว = พังทางใดทางหนึ่งทันที)
 *   2. สคีมาต้องอนุญาตให้ **หนึ่งผู้ใช้มีหลาย Apple sub** — unique อยู่ที่
 *      `(provider, providerAccountId)` **ไม่ใช่** `(userId, provider)`
 *      ถ้าวันหนึ่งมีคนเปลี่ยนเป็น `(userId, provider)` ทางออกของผู้ใช้จะหายไปเงียบ ๆ
 *   3. หน้า `/account` ต้องมีปุ่มผูกเพิ่มจากในแอป ไม่งั้นผู้ขายติดตายตามเดิม
 *
 * 🛑 **ห้ามแก้ด้วยการจับคู่ด้วยอีเมลจาก Apple** — เปิดช่องยึดบัญชีให้คนที่คุมกล่องอีเมลนั้น
 * ทั้งที่ระบบนี้ใช้ "เบอร์" เป็นตัวตนหลักและไม่มีการกู้บัญชีทางอีเมลเลย (security R1)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { APPLE_APP_BUNDLE_ID } from '@/lib/apple/identity-token'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำอธิบายของกฎนั้นไว้ด้วย */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const VERIFIER = 'src/lib/apple/identity-token.ts'
const SCHEMA = 'prisma/schema.prisma'
const ACCOUNT_CARD = 'src/app/(paces)/seller/(dashboard)/account/components/ConnectedAccountsClient.tsx'

describe('[blocker] ตัวตรวจต้องรับโทเคนจากทั้งสองทาง', () => {
  it('🛑 `audiences` ตั้งต้นต้องมีทั้ง bundle id และ Services ID จาก env', () => {
    /* รับค่าเดียว = ทางนั้นทำงาน อีกทางพังทันทีโดยขึ้นข้อความเดียวกันจนแยกไม่ออก */
    const src = code(VERIFIER)
    expect(src, 'ไม่ได้ใส่ bundle id ของแอปในรายการ aud').toMatch(/APPLE_APP_BUNDLE_ID/)
    expect(src, 'ไม่ได้อ่าน Services ID ของเว็บจาก env').toMatch(/process\.env\.APPLE_CLIENT_ID/)
  })

  it('🛑 bundle id ต้องเป็นของแอปผู้ขาย — พิมพ์ผิด = ทุกคนล็อกอินในแอปไม่ได้', () => {
    expect(APPLE_APP_BUNDLE_ID).toBe('com.deepthailand.seller')
  })

})

describe('[blocker] สคีมาต้องยอมให้หนึ่งบัญชีมีหลาย Apple sub', () => {
  const schema = read(SCHEMA)
  const model = schema.slice(schema.indexOf('model AuthAccount'), schema.indexOf('model MobileAuthTicket'))

  it('🛑 unique ต้องอยู่ที่ (provider, providerAccountId)', () => {
    expect(model).toMatch(/@@unique\(\[provider,\s*providerAccountId\]\)/)
  })

  it('🛑 ห้าม unique ที่ (userId, provider) — ทางออกของผู้ขายจะหายไปเงียบ ๆ', () => {
    /**
     * ถ้าเปลี่ยนเป็น `(userId, provider)` ผู้ขายที่เชื่อม Apple ทางเว็บไว้แล้วจะ
     * **ผูก sub ของแอปเพิ่มไม่ได้** ⇒ ต้องถอดของเดิมทิ้งก่อน (ต้อง OTP ทางเบอร์)
     * ซึ่งคนที่ไม่มีเบอร์จะติดตายถาวร (ทางตันของภาคผนวก 6)
     */
    expect(model, 'unique แบบนี้ทำให้หนึ่งบัญชีมี Apple ได้แค่ sub เดียว').not.toMatch(
      /@@unique\(\[userId,\s*provider\]\)/,
    )
  })
})

describe('[blocker] /account ต้องมีทางออกให้ผู้ขายกดเอง', () => {
  const card = code(ACCOUNT_CARD)

  it('🛑 ต้องมีปุ่มผูกเพิ่มจากในแอป ทั้งที่สถานะเป็น "เชื่อมแล้ว"', () => {
    /**
     * ปุ่ม "ยกเลิก" อย่างเดียวไม่พอ — การถอดต้องยืนยันด้วย OTP ทางเบอร์ และผู้ขายที่
     * ไม่มีเบอร์จะทำไม่ได้เลย · ปุ่มนี้ผูก sub ของแอปเพิ่มโดยไม่แตะของเดิม
     */
    expect(card, 'ไม่มีตัวสั่งผูกเพิ่ม').toMatch(/handleRelinkInApp/)
    expect(card, 'ไม่ได้ส่งให้แถว provider ใช้จริง').toMatch(/onRelink=\{handleRelinkInApp\}/)
  })

  it('🛑 ต้องโชว์เฉพาะ Apple + เชื่อมแล้ว + อยู่ในแอป', () => {
    /* โชว์บนเว็บ = ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น (เปลือกเว็บสั่ง native ไม่ได้) */
    expect(card).toMatch(/showRelinkInApp=\{[^}]*'apple'[^}]*\}/)
    expect(card).toMatch(/showRelinkInApp=\{[^}]*appleNativeAvailable[^}]*\}/)
  })

  it('🛑 ต้องอ่านความสามารถหลัง hydrate และฟัง event ไม่ใช่อ่านครั้งเดียวตอน render', () => {
    /**
     * `__DEEP_NATIVE_CAPS__` ถูก inject **หลังหน้าโหลดเสร็จ** ซึ่งช้ากว่าที่ React hydrate
     * ⇒ อ่านตอน render จะได้ false ตลอดแล้วปุ่มไม่มีวันโผล่ (บั๊กคลาสเดียวกับที่ทำให้
     * ปุ่ม Apple ถอยไปหน้าเว็บทุกครั้งก่อนจะมี `NATIVE_CAPS_EVENT`)
     */
    expect(card).toMatch(/addEventListener\(NATIVE_CAPS_EVENT/)
  })

  it('🛑 ล้มเหลวในแอปแล้วห้ามถอยไปเปิดหน้าเว็บของ Apple (Guideline 4)', () => {
    const at = card.indexOf('handleRelinkInApp')
    const body = card.slice(at, card.indexOf('const handleConnect', at))
    expect(body, 'ตัวผูกเพิ่มเปิดหน้าเว็บของ Apple จากในแอป').not.toMatch(
      /signIn\((?:'apple'|provider)/,
    )
  })
})
