/**
 * [blocker] คำบนหน้า "ยังไม่มีร้านค้าของคุณ" ต้องตรงกับสิ่งที่กดได้จริง (แก้ 2026-09-17)
 *
 * ## อาการจริง
 *
 * ล็อกอินด้วย Apple ID ใหม่ในแอป → ได้บัญชีที่ยังไม่มีร้าน → มาโผล่หน้านี้ → คำโปรยบอกว่า
 * "เริ่มขายของออนไลน์ได้ทันที" **แต่ปุ่มเปิดร้านถูกซ่อนในแอป** ⇒ หาปุ่มไม่เจอ คิดว่าแอปพัง
 *
 * ## ทำไมปุ่มถูกซ่อน — Apple สั่งเป็นลายลักษณ์อักษร
 *
 * > "Remove the account registration features for business and organizations"
 * > (รอบ 2026-08-23 — ข้อความเต็มอยู่ที่ `src/lib/app-shell.ts`)
 *
 * 🛑 และถ้าปล่อยให้กดได้ จะไม่ใช่แค่ผิดกฎ — `activeShopId` กลายเป็นร้านที่ยังไม่ตั้งค่า
 * ⇒ `needsRegistration` เป็นจริง ⇒ **ด่าน 3.1.1 ล้าง session แล้วเตะออกจากระบบ**
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { chooseShopEmptySubtitle } from '@/lib/choose-shop-copy'

const IN_APP = chooseShopEmptySubtitle(true)
const ON_WEB = chooseShopEmptySubtitle(false)

describe('[blocker] คำโปรยในแอป', () => {
  it('🛑 ห้ามชวนให้ "เริ่มขาย" ทั้งที่ปุ่มเปิดร้านถูกซ่อน', () => {
    for (const lure of ['เริ่มขาย', 'เปิดร้าน', 'สร้างร้าน']) {
      expect(IN_APP, `ชวนให้หาปุ่มที่ไม่มี: "${lure}"`).not.toContain(lure)
    }
  })

  it('🛑 ห้ามชี้ทางไปสมัคร/เว็บข้างนอก — Apple ผูกเรื่องนี้เข้ากับข้อกล่าวหาเดิม', () => {
    for (const bad of ['เว็บ', 'website', 'สมัคร', 'ลงทะเบียน', 'deepthailand', '.app', '.com', 'http']) {
      expect(IN_APP, `ชี้ออกนอกแอป: "${bad}"`).not.toContain(bad)
    }
  })

  it('ต้องบอกทางที่ยังทำได้จริง — เข้าร่วมด้วยลิงก์เชิญ', () => {
    expect(IN_APP).toContain('ลิงก์เชิญ')
  })

  it('ต้องอธิบายว่าแอปนี้มีไว้สำหรับใคร ไม่ใช่ปล่อยให้เดา', () => {
    expect(IN_APP).toContain('มีร้านอยู่แล้ว')
  })
})

describe('[blocker] บนเว็บต้องไม่เปลี่ยน', () => {
  it('ยังเป็นคำเดิมที่ชวนให้เปิดร้าน (เว็บมีปุ่มจริง)', () => {
    expect(ON_WEB).toBe('เริ่มขายของออนไลน์ได้ทันที หรือวางลิงก์เชิญถ้ามีคนแชร์มาให้')
  })

  it('🛑 สองกรณีต้องเป็นคนละข้อความ — เท่ากันเมื่อไหร่แปลว่าเงื่อนไขหลุด', () => {
    expect(IN_APP).not.toBe(ON_WEB)
  })
})

describe('[blocker] หน้านี้ต้องมีทางออกเสมอ', () => {
  /**
   * ## บั๊กที่ทำให้ต้องมีด่านนี้ (หัวหน้าเจอบน TestFlight 2026-09-25)
   *
   * ล็อกอินด้วย Apple ID ที่ผูกกับบัญชีซึ่ง **ยังไม่มีร้าน** → มาโผล่หน้านี้ →
   * **ออกไปไหนไม่ได้เลย** ไม่มีปุ่มออกจากระบบ ไม่มีปุ่มถอย และในแอปไม่มีแถบนำทางของเบราว์เซอร์
   * ⇒ ปิดแอปเปิดใหม่ก็กลับมาที่เดิม เพราะ session ยังอยู่
   *
   * 🛑 **ทีมรีวิวของ Apple ไม่มีบัญชี Deep** ⇒ ถ้าเขากดปุ่ม Apple ก่อนล็อกอิน `appreview`
   * เขาจะมาติดที่นี่แล้วทดสอบต่อไม่ได้ทั้งแอป — ตีกลับแน่นอน
   * (ทางตันคลาสเดียวกับ "บัญชีค้าง" ของภาคผนวก 6)
   *
   * 🛑 เป็นเทสสแกนซอร์สเพราะรีโปไม่มี jsdom — จับได้แค่ "ต่อสายไว้ไหม" ซึ่งเป็นสิ่งที่พังจริง
   * และ **ต้องตัดคอมเมนต์ก่อนสแกน** ไม่งั้นจะไปเจอคำอธิบายของกฎนี้เอง
   */
  const code = () =>
    readFileSync('src/app/(paces)/seller/choose-shop/components/ChooseShopClient.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('🛑 ต้องมีปุ่มออกจากระบบ และต้องเรียก `signOutSeller` ไม่ใช่ signOut ดิบ', () => {
    /* signOut() ของ next-auth ล้างแค่คุกกี้ session ตัวเดียว — `callback-url` ที่ค้าง
       จะพาผู้ใช้กลับมาที่เดิมหลังล็อกอินรอบหน้า (บั๊ก prod 2026-09-17) */
    const src = code()
    expect(src, 'ไม่มีทางออก = ผู้ใช้ถูกขังอยู่หน้านี้').toMatch(/signOutSeller\(/)
    expect(src, 'ต้องมีปุ่มให้กดจริง ไม่ใช่แค่ import').toContain('ออกจากระบบ')
    expect(src, 'เรียก signOut ดิบ = คุกกี้ค้างแล้ววนกลับมาที่เดิม').not.toMatch(
      /[^t]signOut\(\{/,
    )
  })

  it('🛑 ต้องมีทางออก **ทั้งสองสถานะ** (0 ร้าน และหลายร้าน)', () => {
    /* จอ 0 ร้านคือทางตันที่ชัดที่สุด แต่คนที่ล็อกอินผิดบัญชีแล้วบังเอิญมีหลายร้าน
       ก็ยังต้องสลับบัญชีได้โดยไม่ต้องเดินเข้าร้านไหนสักร้านก่อน */
    const hits = code().match(/<SignOutEscape \/>/g) ?? []
    expect(hits.length, `เจอทางออก ${hits.length} จุด — ต้องมีทั้งสองสถานะ`).toBe(2)
  })

  it('🛑 ทางออกต้องไม่มี confirm ขวาง — มันคือทางออกทางเดียวของหน้าที่ขังผู้ใช้อยู่', () => {
    /* ต่างจาก `/register` ที่ถามก่อน เพราะที่นั่นผู้ใช้กรอกข้อมูลค้างอยู่ (มีของจะเสีย)
       ที่นี่ไม่มีอะไรจะเสีย ⇒ ด่านถามซ้ำบนทางออกเดียว = ทำให้ทางตันแน่นขึ้น */
    const src = code()
    const at = src.indexOf('signOutSeller(')
    const around = src.slice(Math.max(0, at - 400), at)
    expect(around, 'มี confirm ขวางทางออก').not.toMatch(/Swal\.fire|pacesConfirm/)
  })
})

describe('[blocker] หน้าจอต้องเรียกใช้จริง ไม่ใช่มีฟังก์ชันทิ้งไว้เฉย ๆ', () => {
  it('🛑 ChooseShopClient ต้องเรียก `chooseShopEmptySubtitle(hideOpenShop)`', async () => {
    const fs = await import('fs')
    const code = fs
      .readFileSync('src/app/(paces)/seller/choose-shop/components/ChooseShopClient.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')

    expect(code, 'ไม่เรียก = คำเดิมยังอยู่ ผู้ใช้ยังหาปุ่มที่ไม่มี').toContain(
      'chooseShopEmptySubtitle(hideOpenShop)',
    )
    expect(
      code,
      'ยังมีข้อความเดิมฝังอยู่ในหน้า = แก้ไม่ครบ',
    ).not.toContain('เริ่มขายของออนไลน์ได้ทันที')
  })
})
