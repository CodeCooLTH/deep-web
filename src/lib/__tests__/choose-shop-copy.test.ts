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
