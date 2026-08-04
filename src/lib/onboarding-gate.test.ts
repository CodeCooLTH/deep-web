import { describe, it, expect } from 'vitest'
import { resolveOnboardingGate } from './onboarding-gate'

/**
 * กฎนี้คุมว่า proxy.ts จะ "ขัง" user ไว้ที่ /register หรือ /onboarding หรือไม่ — พังแล้วมี 2 ทิศ
 * ที่เจ็บทั้งคู่:
 *   - หลวมไป: seller ที่ยังไม่ตั้ง slug หลุด gate ไปใช้งานได้ทั้งที่ร้านยังไม่มี URL สาธารณะ
 *   - แน่นไป: ผู้ถูกเชิญที่เพิ่งกด "สร้างร้านส่วนตัว" ถูกเด้งออกจากงานในร้าน BUSINESS ที่ทำค้างอยู่
 *     และออกไม่ได้เลยจนกว่าจะตั้ง slug เสร็จ (= บั๊กที่ feature 00026 ตั้งใจแก้)
 */

const PERSONAL = 'shop-personal-1'
const BUSINESS = 'shop-business-9'

describe('resolveOnboardingGate', () => {
  it('ผู้ถูกเชิญที่ยังไม่มีร้านส่วนตัว — ไม่โดนบังคับอะไรเลย', () => {
    expect(
      resolveOnboardingGate({
        personalShopId: null,
        personalShopSlug: null,
        activeShopId: BUSINESS,
        hasPhone: false,
      }),
    ).toEqual({ needsRegistration: false, needsOnboarding: false })
  })

  it('nobody (ไม่มีร้านเลย ยังไม่ได้เลือกอะไร) — ไม่โดนบังคับ', () => {
    expect(
      resolveOnboardingGate({
        personalShopId: null,
        personalShopSlug: null,
        activeShopId: null,
        hasPhone: false,
      }),
    ).toEqual({ needsRegistration: false, needsOnboarding: false })
  })

  it('seller ปกติที่ยังไม่ตั้ง slug และยืนอยู่ในร้านตัวเอง — ยังต้องโดนบังคับเหมือนเดิม', () => {
    expect(
      resolveOnboardingGate({
        personalShopId: PERSONAL,
        personalShopSlug: null,
        activeShopId: PERSONAL,
        hasPhone: true,
      }),
    ).toEqual({ needsRegistration: false, needsOnboarding: true })
  })

  it('ยืนอยู่ในร้านตัวเองและยังไม่มีเบอร์ — บังคับ /register ก่อน (เฟส 1 มาก่อนเฟส 2)', () => {
    const gate = resolveOnboardingGate({
      personalShopId: PERSONAL,
      personalShopSlug: null,
      activeShopId: PERSONAL,
      hasPhone: false,
    })
    expect(gate.needsRegistration).toBe(true)
    // proxy.ts ตรวจ needsRegistration ก่อน needsOnboarding อยู่แล้ว — ค่านี้เป็น true พร้อมกันได้ไม่ผิด
    expect(gate.needsOnboarding).toBe(true)
  })

  it('หัวใจของ 00026: เพิ่งสร้างร้านส่วนตัว (ยังไม่มี slug/เบอร์) แต่ active อยู่ร้าน BUSINESS — ต้องไม่โดนขัง', () => {
    expect(
      resolveOnboardingGate({
        personalShopId: PERSONAL,
        personalShopSlug: null,
        activeShopId: BUSINESS,
        hasPhone: false,
      }),
    ).toEqual({ needsRegistration: false, needsOnboarding: false })
  })

  it('ตั้ง slug ครบแล้ว ยืนอยู่ในร้านตัวเอง — ไม่โดนบังคับ (proxy จะพาออกจาก /onboarding ให้เอง)', () => {
    expect(
      resolveOnboardingGate({
        personalShopId: PERSONAL,
        personalShopSlug: 'my-shop',
        activeShopId: PERSONAL,
        hasPhone: true,
      }),
    ).toEqual({ needsRegistration: false, needsOnboarding: false })
  })

  it('activeShopId ยังไม่ถูก resolve (null) ทั้งที่มีร้านส่วนตัว — ไม่ขัง (fail-open ฝั่งไม่ขังคน)', () => {
    // เกิดได้กับ JWT เก่าที่ออกก่อน feature 00008 ซึ่งไม่เคยมี activeShopId. เลือกไม่ขังเพราะ
    // การขังผิดทำให้ user ใช้งานอะไรไม่ได้เลย ส่วนการปล่อยผิดแค่ทำให้ยังไม่ได้ตั้ง slug ซึ่ง
    // จะถูกบังคับทันทีที่ token ถูกคำนวณใหม่ (sign-in หรือ session.update)
    expect(
      resolveOnboardingGate({
        personalShopId: PERSONAL,
        personalShopSlug: null,
        activeShopId: null,
        hasPhone: true,
      }),
    ).toEqual({ needsRegistration: false, needsOnboarding: false })
  })
})
