/**
 * onboarding-gate — SSOT ของกฎ "ต้องบังคับ user ไปลงทะเบียน/ตั้งค่าร้านก่อนใช้งานไหม"
 *
 * ทำไมต้องแยกเป็นไฟล์: กฎนี้ถูกอ่าน 2 ที่ที่ต้องตรงกันเป๊ะเสมอ —
 *   1. `jwt` callback (lib/auth.ts) → เขียนลง JWT → `proxy.ts` อ่านแล้ว **บังคับ redirect ที่ edge**
 *   2. `session` callback (lib/auth.ts) → ส่งเข้า session → **UI อ่านไปแสดงสถานะ**
 * ถ้า 2 ที่คำนวณไม่ตรงกัน UI จะโชว์คนละอย่างกับที่ proxy บังคับจริง (เคยเป็นกับดักที่มีคอมเมนต์
 * "mirror logic ใน jwt callback ด้านบน" เตือนไว้ — ซึ่งกันได้แค่ตอนคนอ่านคอมเมนต์เจอ)
 *
 * บริบทของกฎ:
 * - feature 00012 (Lazy Personal shop): บังคับเฉพาะ "คนที่ตั้งใจเป็น seller" = มี Personal shop แล้ว
 *   ผู้ถูกเชิญ (ADMIN ของ business ที่ยังไม่มี Personal) และ nobody ต้องไม่โดนบังคับ ไม่งั้นเข้า
 *   business dashboard ไม่ได้เลย (โดน proxy เด้งวน)
 * - feature 00026: เพิ่มเงื่อนไข "และกำลัง active อยู่ที่ร้านส่วนตัวนั้น" — ผู้ถูกเชิญที่กด
 *   "สร้างร้านส่วนตัว" จาก account switcher จะมี Personal shop ที่ยังไม่มี slug ทันที ถ้าไม่ scope
 *   ตรงนี้ proxy จะเด้งเขาไป /onboarding ทุก route = หลุดจากงานในร้าน BUSINESS ที่ทำค้างอยู่
 *   ออกไม่ได้จนกว่าจะตั้ง slug เสร็จ
 */

export interface OnboardingGateInput {
  /** id ของ PERSONAL shop ของ user — null = ยังไม่เคยเปิดร้านของตัวเอง (ผู้ถูกเชิญ/nobody) */
  personalShopId: string | null;
  /** slug ของ PERSONAL shop — null = ยังไม่ได้ตั้ง (ต้องผ่าน /onboarding) */
  personalShopSlug: string | null;
  /** shop ที่ user กำลังใช้งานอยู่ — อาจเป็น BUSINESS ของคนอื่นที่เขาเป็นสมาชิก */
  activeShopId: string | null;
  hasPhone: boolean;
}

export interface OnboardingGate {
  /** ยังไม่มีเบอร์ → proxy บังคับไป /register (เฟส 1) */
  needsRegistration: boolean;
  /** ยังไม่มี slug → proxy บังคับไป /onboarding (เฟส 2) */
  needsOnboarding: boolean;
}

export function resolveOnboardingGate({
  personalShopId,
  personalShopSlug,
  activeShopId,
  hasPhone,
}: OnboardingGateInput): OnboardingGate {
  // บังคับก็ต่อเมื่อ "มีร้านส่วนตัว" และ "กำลังยืนอยู่ในร้านส่วนตัวนั้น" พร้อมกัน
  const onPersonalShop = personalShopId !== null && activeShopId === personalShopId;

  return {
    needsRegistration: onPersonalShop && !hasPhone,
    needsOnboarding: onPersonalShop && !personalShopSlug,
  };
}
