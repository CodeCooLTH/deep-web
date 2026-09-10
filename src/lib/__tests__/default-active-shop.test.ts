import { describe, it, expect } from 'vitest'
import { resolveDefaultActiveShopId, resolveOnboardingGate } from '@/lib/onboarding-gate'

const PERSONAL = 'personal-shop-id'
const BIZ = 'business-shop-id'

/**
 * [blocker] — แอดมินของร้านธุรกิจต้องไม่ถูกวางไว้ในร้านส่วนตัวที่ยังตั้งค่าไม่เสร็จ
 *
 * 🛑 บั๊ก prod 2026-09-10: "ดรีม ดรีม" เป็น ADMIN ของร้าน BT Premium - สุขสวัสดิ์ และมีร้านส่วนตัว
 * ที่ระบบสร้างให้เอง (feature 00012 Lazy Personal shop) โดยยังไม่มี slug ⇒ ตอนล็อกอินถูกตั้ง
 * `activeShopId` = ร้านส่วนตัว ⇒ `needsOnboarding = true` ⇒ **ในแอป iOS ด่าน 3.1.1 ล้าง session
 * ทิ้งทันที** ขึ้นว่า "ไม่พบบัญชีผู้ขายสำหรับข้อมูลที่ใช้เข้าสู่ระบบนี้" = เข้าไม่ได้เลย
 *
 * user ยืนยันเจตนาเอง: "มันต้องเข้าได้ป่ะ เพราะเค้ามีร้านอื่น" และ "ถ้าเค้าไม่มีร้านส่วนตัว
 * แต่มี admin ร้านอื่น ไม่จำเป็นต้องเข้า /onboarding"
 */
describe('[blocker] ร้านตั้งต้นตอนล็อกอินครั้งแรก', () => {
  it('มีร้านส่วนตัวที่ตั้งค่าเสร็จแล้ว → ร้านตัวเองมาก่อน (พฤติกรรมเดิม)', () => {
    expect(
      resolveDefaultActiveShopId({
        personalShopId: PERSONAL,
        personalShopSlug: 'my-shop',
        firstBusinessShopId: BIZ,
      }),
    ).toBe(PERSONAL)
  })

  /** เคสของ "ดรีม ดรีม" — ร้านส่วนตัวถูกสร้างให้อัตโนมัติแต่ไม่เคยตั้งค่า */
  it('ร้านส่วนตัวยังไม่มี slug แต่เป็นแอดมินร้านธุรกิจ → ไปร้านธุรกิจ ไม่ใช่ร้านส่วนตัว', () => {
    expect(
      resolveDefaultActiveShopId({
        personalShopId: PERSONAL,
        personalShopSlug: null,
        firstBusinessShopId: BIZ,
      }),
    ).toBe(BIZ)
  })

  /** เคสที่ user ระบุมาตรง ๆ */
  it('ไม่มีร้านส่วนตัวเลย แต่เป็นแอดมินร้านอื่น → ไปร้านนั้น', () => {
    expect(
      resolveDefaultActiveShopId({
        personalShopId: null,
        personalShopSlug: null,
        firstBusinessShopId: BIZ,
      }),
    ).toBe(BIZ)
  })

  it('มีแต่ร้านส่วนตัวที่ยังไม่ตั้งค่า ไม่มีร้านธุรกิจ → ร้านส่วนตัว (ให้เดินเข้า /onboarding ตามเดิม)', () => {
    expect(
      resolveDefaultActiveShopId({
        personalShopId: PERSONAL,
        personalShopSlug: null,
        firstBusinessShopId: null,
      }),
    ).toBe(PERSONAL)
  })

  it('ไม่มีร้านอะไรเลย → null (layout พาไป /choose-shop)', () => {
    expect(
      resolveDefaultActiveShopId({
        personalShopId: null,
        personalShopSlug: null,
        firstBusinessShopId: null,
      }),
    ).toBeNull()
  })
})

/**
 * [blocker] — ผลลัพธ์ปลายทางที่ผู้ใช้รู้สึกจริง: ห้ามถูกบังคับ onboarding เมื่อมีร้านธุรกิจให้ทำงาน
 * ผูก 2 ฟังก์ชันเข้าด้วยกัน เพราะบั๊กเกิดจาก "ค่าที่ตัวหนึ่งเลือก ไปทำให้อีกตัวตัดสินผิด"
 */
describe('[blocker] แอดมินร้านธุรกิจต้องไม่โดนบังคับ onboarding', () => {
  const cases = [
    { name: 'ร้านส่วนตัวยังไม่ตั้งค่า + เป็นแอดมินร้านธุรกิจ', personalShopId: PERSONAL, firstBusinessShopId: BIZ },
    { name: 'ไม่มีร้านส่วนตัว + เป็นแอดมินร้านธุรกิจ', personalShopId: null, firstBusinessShopId: BIZ },
  ]
  for (const c of cases) {
    it(`${c.name} → needsOnboarding = false`, () => {
      const activeShopId = resolveDefaultActiveShopId({
        personalShopId: c.personalShopId,
        personalShopSlug: null,
        firstBusinessShopId: c.firstBusinessShopId,
      })
      const gate = resolveOnboardingGate({
        personalShopId: c.personalShopId,
        personalShopSlug: null,
        activeShopId,
        hasPhone: true,
      })
      expect(gate.needsOnboarding).toBe(false)
      expect(gate.needsRegistration).toBe(false)
    })
  }

  it('auth.ts ต้องเรียก SSOT ไม่เขียนกฎเอง', async () => {
    const fs = await import('fs')
    const code = fs
      .readFileSync('src/lib/auth.ts', 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    expect(code).toMatch(/resolveDefaultActiveShopId\(\{/)
    // ห้ามกลับไปใช้ท่าเดิมที่ทำให้เกิดบั๊ก
    expect(code).not.toMatch(/let defaultActive: string \| null = personal\?\.id/)
    /**
     * 🛑 ต้อง assign **ผลของ SSOT ตรง ๆ** ห้ามมีอะไรมาครอบทับก่อน
     * (mutation รอบแรกพิสูจน์ว่าเช็คแค่ "เรียก SSOT ไหม" ยังเขียวได้ทั้งที่เขียน
     * `personal?.id ?? resolveDefaultActiveShopId(...)` ซึ่งคือบั๊กเดิมกลับมาเป๊ะ)
     */
    const assign = code.match(/token\.activeShopId = ([^\n]*)/g) ?? []
    const inSignInBranch = assign.filter((l) => l.includes('resolveDefaultActiveShopId'))
    expect(inSignInBranch.length, 'ต้องมีจุด assign ที่เรียก SSOT').toBeGreaterThan(0)
    for (const line of inSignInBranch) {
      expect(line.trim(), 'ห้ามมีค่าอื่นมาชิงก่อนผลของ SSOT').toBe(
        'token.activeShopId = resolveDefaultActiveShopId({',
      )
    }
  })
})
